// Crash handlers and the heartbeat for the Docker healthcheck.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { installCrashHandlers, startHeartbeat } from '../src/health.ts';
import { createLogger } from '../src/log.ts';

function setup() {
  const logs: string[] = [];
  const exits: number[] = [];
  const proc = new EventEmitter();
  installCrashHandlers(proc, createLogger({ write: (l) => logs.push(l) }), (code) => exits.push(code));
  return { proc, logs, exits };
}

test('an unhandled rejection is logged and the bot keeps running', () => {
  const t = setup();
  t.proc.emit('unhandledRejection', new Error('forgot to await'));
  assert.deepEqual(t.exits, []);
  assert.match(t.logs[0]!, /unhandled promise rejection.*forgot to await/);
});

test('an uncaught exception is logged and the bot exits with code 1', () => {
  const t = setup();
  t.proc.emit('uncaughtException', new Error('boom'));
  assert.deepEqual(t.exits, [1]);
  assert.match(t.logs[0]!, /uncaught exception.*boom/);
});

test('the heartbeat is only written while logged in to Discord', async () => {
  let ready = false;
  const touched: string[] = [];
  const stop = startHeartbeat({ isReady: () => ready, log: createLogger({ write: () => {} }), path: 'hb', intervalMs: 10, touch: (p) => touched.push(p) });
  await new Promise((r) => setTimeout(r, 35));
  assert.equal(touched.length, 0);
  ready = true;
  await new Promise((r) => setTimeout(r, 35));
  stop();
  const count = touched.length;
  assert.ok(count >= 2, `expected beats, got ${count}`);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(touched.length, count, 'no beats after stop()');
});

test('a heartbeat that cannot be written warns once and does not throw', () => {
  const logs: string[] = [];
  const stop = startHeartbeat({
    isReady: () => true,
    log: createLogger({ write: (l) => logs.push(l) }),
    intervalMs: 1_000,
    touch: () => {
      throw new Error('read-only');
    },
  });
  stop();
  assert.equal(logs.length, 1);
  assert.match(logs[0]!, /could not write the heartbeat/);
});
