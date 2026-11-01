import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLogger } from '../src/log.ts';

const setup = (level?: 'debug' | 'info' | 'warn' | 'error') => {
  const lines: string[] = [];
  const log = createLogger({ level, write: (l) => lines.push(l), now: () => new Date('2026-11-01T00:00:00Z') });
  return { lines, log, parsed: () => lines.map((l) => JSON.parse(l) as Record<string, unknown>) };
};

test('writes one JSON object per line with time, level, msg and fields', () => {
  const { log, parsed } = setup();
  log.info('spoke', { guild: '1', t_playing: 123 });
  assert.deepEqual(parsed(), [{ t: '2026-11-01T00:00:00.000Z', level: 'info', msg: 'spoke', guild: '1', t_playing: 123 }]);
});

test('drops lines below the level', () => {
  const { log, lines } = setup('warn');
  log.debug('a');
  log.info('b');
  log.warn('c');
  log.error('d');
  assert.equal(lines.length, 2);
});

test('child loggers add their fields to every line', () => {
  const { log, parsed } = setup();
  log.child({ guild: '42' }).info('hi', { user: '7' });
  assert.equal(parsed()[0]?.guild, '42');
  assert.equal(parsed()[0]?.user, '7');
});

test('secrets are redacted and errors become plain objects', () => {
  const { log, parsed } = setup();
  log.error('boom', { token: 'abc', err: new Error('nope') });
  const line = parsed()[0]!;
  assert.equal(line.token, '[redacted]');
  assert.equal((line.err as { message: string }).message, 'nope');
});
