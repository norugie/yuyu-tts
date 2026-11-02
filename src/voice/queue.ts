// Step [3]: one playback queue per server.
// - in-order (default): every message plays, oldest first (AC3.1).
// - newest: a new message drops the ones still waiting (AC3.2).
// - At most maxWaiting messages wait; when full, the oldest waiting one is dropped (AC3.3).
// - If making audio fails, log it and move on (AC3.4).
// - If a message plays longer than playTimeoutMs, stop it and move on (AC10.3).
// - While one message plays, audio for the next is already being made ("prefetch"), so the
//   next one starts right away instead of waiting for Kokoro.
//
// The queue doesn't know about Discord or Kokoro: it gets `prepare` and `play` functions,
// which makes it easy to test with fakes.

import type { QueueMode } from '../store/settings.ts';
import type { Logger } from '../log.ts';

// Audio that is ready (or streaming) and can be played or thrown away.
export type Prepared = {
  // Stops making audio and frees resources (Kokoro request, ffmpeg).
  cancel(): void;
};

export type QueueDeps<Item, P extends Prepared> = {
  prepare(item: Item): Promise<P>;
  // Resolves when playback finishes or is stopped.
  play(prepared: P, item: Item): Promise<void>;
  // Stop whatever is playing right now (play() then resolves).
  stopPlayback(): void;
  log: Logger;
  mode: () => QueueMode;
  maxWaiting?: number;
  // AC10.3: stop a message that is still playing after this long. Unset = no limit.
  playTimeoutMs?: number;
};

// After stopPlayback(), how long to wait for play() to settle before moving on regardless.
const STOP_GRACE_MS = 2_000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

type Entry<Item, P> = { item: Item; prepared?: Promise<P>; skipped: boolean };

export class PlaybackQueue<Item, P extends Prepared> {
  readonly #deps: QueueDeps<Item, P>;
  readonly #waiting: Entry<Item, P>[] = [];
  #current: Entry<Item, P> | undefined;
  #running = false;
  #idle: Promise<void> = Promise.resolve();

  constructor(deps: QueueDeps<Item, P>) {
    this.#deps = deps;
  }

  get waitingCount(): number {
    return this.#waiting.length;
  }

  get isBusy(): boolean {
    return this.#current !== undefined || this.#waiting.length > 0;
  }

  // Resolves once the queue has nothing left to play (handy in tests).
  whenIdle(): Promise<void> {
    return this.#idle;
  }

  enqueue(item: Item): void {
    if (this.#deps.mode() === 'newest' && this.#waiting.length > 0) {
      this.#drop(this.#waiting.splice(0), 'newest');
    }
    const max = this.#deps.maxWaiting ?? 10;
    while (this.#waiting.length >= max) this.#drop(this.#waiting.splice(0, 1), 'full');
    this.#waiting.push({ item, skipped: false });
    if (!this.#running) this.#idle = this.#run();
    // If something is already playing, start making this one's audio now.
    else if (this.#current !== undefined) this.#prefetchNext();
  }

  // /skip: stop the current message; the next one starts (AC4.1).
  skip(): void {
    if (this.#current === undefined) return;
    this.#current.skipped = true;
    this.#deps.stopPlayback();
  }

  // /skip all and /leave: stop and forget everything (AC4.2, AC1.3).
  clear(): void {
    this.#drop(this.#waiting.splice(0), 'cleared');
    this.skip();
  }

  #drop(entries: Entry<Item, P>[], reason: string): void {
    for (const e of entries) {
      e.skipped = true;
      this.#deps.log.info('queue dropped message', { reason });
      // Throw away audio that was already being made.
      e.prepared?.then((p) => p.cancel()).catch(() => {});
    }
  }

  #prefetchNext(): void {
    const next = this.#waiting[0];
    if (next === undefined || next.prepared !== undefined) return;
    next.prepared = this.#deps.prepare(next.item);
    // The error is handled when this entry's turn comes; this just avoids an "unhandled rejection" warning.
    next.prepared.catch(() => {});
  }

  // Plays one message, but never waits longer than playTimeoutMs (+ a short grace after stopping).
  async #playWithLimit(prepared: P, item: Item): Promise<void> {
    const limit = this.#deps.playTimeoutMs;
    const playing = this.#deps.play(prepared, item);
    if (limit === undefined) return playing;
    let timer: NodeJS.Timeout | undefined;
    const timedOut = new Promise<'timeout'>((resolve) => (timer = setTimeout(() => resolve('timeout'), limit)));
    try {
      if ((await Promise.race([playing, timedOut])) !== 'timeout') return;
    } finally {
      clearTimeout(timer);
    }
    this.#deps.log.warn('message played too long, stopping it', { timeout_ms: limit });
    this.#deps.stopPlayback();
    prepared.cancel();
    await Promise.race([playing.catch(() => {}), sleep(STOP_GRACE_MS)]);
  }

  async #run(): Promise<void> {
    this.#running = true;
    try {
      for (let entry = this.#waiting.shift(); entry !== undefined; entry = this.#waiting.shift()) {
        this.#current = entry;
        let prepared: P | undefined;
        try {
          prepared = await (entry.prepared ?? this.#deps.prepare(entry.item));
          // Skipped while its audio was still being made.
          if (entry.skipped) {
            prepared.cancel();
            continue;
          }
          this.#prefetchNext();
          await this.#playWithLimit(prepared, entry.item);
        } catch (err) {
          // AC3.4: one bad message must not stop the queue.
          if (!entry.skipped) this.#deps.log.error('could not play message, skipping', { err });
          prepared?.cancel();
        } finally {
          this.#current = undefined;
        }
      }
    } finally {
      this.#running = false;
    }
  }
}
