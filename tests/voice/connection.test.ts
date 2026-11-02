// AC10.1 and AC10.3 (start timeout), with fakes instead of a real voice connection and player.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { AudioPlayerStatus, type AudioPlayer } from '@discordjs/voice';
import { playToEnd, watchConnection } from '../../src/voice/connection.ts';
import { createLogger } from '../../src/log.ts';

test('AC10.1: a voice connection error is logged instead of crashing the bot', () => {
  const logs: string[] = [];
  const connection = new EventEmitter();
  // Without a listener, Node throws on emit('error'). That is the crash this prevents.
  assert.throws(() => new EventEmitter().emit('error', new Error('udp gone')));
  watchConnection(connection, createLogger({ write: (l) => logs.push(l) }));
  assert.doesNotThrow(() => connection.emit('error', new Error('udp gone')));
  assert.equal(logs.length, 1);
  assert.match(logs[0]!, /voice connection error.*udp gone/);
});

// A fake player: play() does nothing by itself; the test moves it between states.
function fakePlayer() {
  const p = new EventEmitter() as EventEmitter & { status: string; stops: number; play(r: unknown): void; stop(force?: boolean): boolean };
  p.status = AudioPlayerStatus.Idle;
  p.stops = 0;
  const go = (status: string) => {
    const old = p.status;
    p.status = status;
    p.emit('stateChange', { status: old }, { status });
  };
  p.play = () => go(AudioPlayerStatus.Buffering);
  p.stop = () => {
    p.stops++;
    go(AudioPlayerStatus.Idle);
    return true;
  };
  return { player: p, go };
}

const asPlayer = (p: unknown) => p as Pick<AudioPlayer, 'on' | 'off' | 'play' | 'stop'>;
const resource = {} as Parameters<AudioPlayer['play']>[0];

test('AC10.3: audio that never starts is stopped after the start timeout', async () => {
  const { player } = fakePlayer();
  let timedOut = false;
  let playing = false;
  await playToEnd(asPlayer(player), resource, { startTimeoutMs: 20, onPlaying: () => (playing = true), onStartTimeout: () => (timedOut = true) });
  assert.equal(timedOut, true);
  assert.equal(playing, false);
  assert.equal(player.stops, 1);
  assert.equal(player.listenerCount('stateChange'), 0);
});

test('audio that starts in time plays to the end, without the timeout firing later', async () => {
  const { player, go } = fakePlayer();
  let timedOut = false;
  let playing = 0;
  const done = playToEnd(asPlayer(player), resource, { startTimeoutMs: 20, onPlaying: () => playing++, onStartTimeout: () => (timedOut = true) });
  go(AudioPlayerStatus.Playing);
  await new Promise((r) => setTimeout(r, 40));
  go(AudioPlayerStatus.Idle);
  await done;
  assert.equal(playing, 1);
  assert.equal(timedOut, false);
  assert.equal(player.stops, 0);
});
