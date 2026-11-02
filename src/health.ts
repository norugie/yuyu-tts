import type { EventEmitter } from 'node:events';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Logger } from './log.ts';

// Since Node 15, a rejected promise that nobody handles crashes the process. Every handler
// already has its own try/catch; this is the safety net for one we missed.
//  - unhandledRejection: log it and keep going. The failed work is already over, nothing is broken.
//  - uncaughtException: log it and exit(1). After an unexpected throw the bot may be half-updated,
//    so restarting fresh (Docker's `restart: unless-stopped`) is safer than carrying on.
export function installCrashHandlers(proc: EventEmitter, log: Logger, exit: (code: number) => void): void {
  proc.on('unhandledRejection', (reason: unknown) => log.error('unhandled promise rejection (bot keeps running)', { err: reason }));
  proc.on('uncaughtException', (err: Error) => {
    log.error('uncaught exception, exiting so Docker restarts the bot', { err });
    exit(1);
  });
}

// In the container tmpdir() is /tmp; compose.yaml's healthcheck reads this exact path.
export const HEARTBEAT_PATH = join(tmpdir(), 'yuyu-heartbeat');
export const HEARTBEAT_INTERVAL_MS = 30_000;

export type HeartbeatOptions = {
  isReady: () => boolean;
  log: Logger;
  path?: string;
  intervalMs?: number;
  touch?: (path: string) => void;
};

// The healthcheck only looks at how old the file is. Returns a function that stops it.
export function startHeartbeat(opts: HeartbeatOptions): () => void {
  const path = opts.path ?? HEARTBEAT_PATH;
  const touch = opts.touch ?? ((p: string) => writeFileSync(p, String(Date.now())));
  let warned = false;
  const beat = () => {
    if (!opts.isReady()) return;
    try {
      touch(path);
    } catch (err) {
      // Only matters for the Docker healthcheck, so warn once instead of every 30 s.
      if (!warned) opts.log.warn('could not write the heartbeat file', { path, err });
      warned = true;
    }
  };
  beat();
  const timer = setInterval(beat, opts.intervalMs ?? HEARTBEAT_INTERVAL_MS);
  // Don't keep the process alive just for this.
  timer.unref();
  return () => clearInterval(timer);
}
