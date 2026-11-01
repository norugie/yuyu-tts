import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PlaybackQueue, type Prepared } from '../../src/voice/queue.ts';
import { createLogger } from '../../src/log.ts';
import type { QueueMode } from '../../src/store/settings.ts';

// A fake player: "playing" a message takes until the test calls finish().
function setup(opts: { mode?: QueueMode; maxWaiting?: number; failOn?: string[] } = {}) {
  const events: string[] = [];
  const logs: string[] = [];
  let mode: QueueMode = opts.mode ?? 'in-order';
  let finishCurrent: (() => void) | undefined;
  type P = Prepared & { text: string };

  const q = new PlaybackQueue<string, P>({
    log: createLogger({ write: (l) => logs.push(l) }),
    mode: () => mode,
    maxWaiting: opts.maxWaiting,
    async prepare(text) {
      events.push(`prepare ${text}`);
      if (opts.failOn?.includes(text)) throw new Error(`tts failed for ${text}`);
      return { text, cancel: () => events.push(`cancel ${text}`) };
    },
    play(p) {
      events.push(`play ${p.text}`);
      return new Promise<void>((resolve) => (finishCurrent = resolve));
    },
    stopPlayback: () => {
      events.push('stop');
      finishCurrent?.();
    },
  });

  const tick = () => new Promise((r) => setImmediate(r));
  const finish = async () => {
    await tick();
    finishCurrent?.();
    finishCurrent = undefined;
    await tick();
  };
  const played = () => events.filter((e) => e.startsWith('play ')).map((e) => e.slice(5));
  return { q, events, logs, finish, tick, played, setMode: (m: QueueMode) => (mode = m) };
}

test('AC3.1: in-order plays every message in the order sent', async () => {
  const t = setup();
  t.q.enqueue('a');
  t.q.enqueue('b');
  t.q.enqueue('c');
  await t.finish();
  await t.finish();
  await t.finish();
  await t.q.whenIdle();
  assert.deepEqual(t.played(), ['a', 'b', 'c']);
});

test('the next message is prepared while the current one plays', async () => {
  const t = setup();
  t.q.enqueue('a');
  t.q.enqueue('b');
  await t.tick();
  // b starts being made as soon as a starts playing.
  assert.deepEqual(t.events, ['prepare a', 'prepare b', 'play a']);
  t.q.enqueue('c');
  await t.tick();
  // Only one message ahead is prepared.
  assert.equal(t.events.includes('prepare c'), false);
  await t.finish();
  assert.equal(t.events.includes('prepare c'), true);
});

test('AC3.2: newest mode drops waiting messages, not the one playing', async () => {
  const t = setup({ mode: 'newest' });
  t.q.enqueue('a');
  await t.tick();
  t.q.enqueue('b');
  t.q.enqueue('c');
  t.q.enqueue('d');
  await t.finish();
  await t.finish();
  await t.q.whenIdle();
  assert.deepEqual(t.played(), ['a', 'd']);
  // b's audio was being made already, so it was cancelled.
  assert.ok(t.events.includes('cancel b'));
});

test('AC3.3: when full, the oldest waiting message is dropped and logged', async () => {
  const t = setup({ maxWaiting: 2 });
  t.q.enqueue('a');
  await t.tick();
  t.q.enqueue('b');
  t.q.enqueue('c');
  t.q.enqueue('d');
  assert.equal(t.q.waitingCount, 2);
  for (let i = 0; i < 3; i++) await t.finish();
  await t.q.whenIdle();
  assert.deepEqual(t.played(), ['a', 'c', 'd']);
  assert.ok(t.logs.some((l) => l.includes('"reason":"full"')));
});

test('AC3.4: a TTS failure is logged and skipped, and the queue continues', async () => {
  const t = setup({ failOn: ['b'] });
  t.q.enqueue('a');
  t.q.enqueue('b');
  t.q.enqueue('c');
  for (let i = 0; i < 3; i++) await t.finish();
  await t.q.whenIdle();
  assert.deepEqual(t.played(), ['a', 'c']);
  assert.ok(t.logs.some((l) => l.includes('could not play message') && l.includes('tts failed for b')));
});

test('/skip stops the current message and the next one starts', async () => {
  const t = setup();
  t.q.enqueue('a');
  t.q.enqueue('b');
  await t.tick();
  t.q.skip();
  await t.tick();
  assert.deepEqual(t.played(), ['a', 'b']);
  await t.finish();
  await t.q.whenIdle();
});

test('AC4.2: /skip all stops the current message and clears the queue', async () => {
  const t = setup();
  t.q.enqueue('a');
  t.q.enqueue('b');
  t.q.enqueue('c');
  await t.tick();
  t.q.clear();
  await t.q.whenIdle();
  assert.deepEqual(t.played(), ['a']);
  assert.equal(t.q.isBusy, false);
  assert.ok(t.events.includes('cancel b'));
});

test('switching to newest mid-way applies to the next message', async () => {
  const t = setup();
  t.q.enqueue('a');
  await t.tick();
  t.q.enqueue('b');
  t.setMode('newest');
  t.q.enqueue('c');
  await t.finish();
  await t.finish();
  await t.q.whenIdle();
  assert.deepEqual(t.played(), ['a', 'c']);
});

test('works again after going idle', async () => {
  const t = setup();
  t.q.enqueue('a');
  await t.finish();
  await t.q.whenIdle();
  t.q.enqueue('b');
  await t.finish();
  await t.q.whenIdle();
  assert.deepEqual(t.played(), ['a', 'b']);
});
