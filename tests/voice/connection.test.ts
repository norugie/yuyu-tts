// Voice connection errors and the start timeout, with fakes instead of a real voice connection and player.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { AudioPlayerStatus, type AudioPlayer } from '@discordjs/voice';
import type { VoiceBasedChannel } from 'discord.js';
import { Sessions, playToEnd, watchConnection } from '../../src/voice/connection.ts';
import { createLogger } from '../../src/log.ts';

test('a voice connection error is logged instead of crashing the bot', () => {
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

test('audio that never starts is stopped after the start timeout', async () => {
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

// A fake voice connection: it stays "signalling" until the test calls ready(), and
// like the real one, destroy() ends in the 'destroyed' status without ever becoming ready.
function fakeConnection() {
  const c = new EventEmitter() as EventEmitter & { state: { status: string }; subscribe(): void; destroy(): void; ready(): void };
  c.state = { status: 'signalling' };
  c.subscribe = () => {};
  c.destroy = () => {
    c.state = { status: 'destroyed' };
    c.emit('destroyed');
  };
  c.ready = () => {
    c.state = { status: 'ready' };
    c.emit('ready');
  };
  return c;
}

function fakeChannel(id: string) {
  return { id, guild: { id: 'g1' }, members: { map: () => [] } } as unknown as VoiceBasedChannel;
}

function setup(readyTimeoutMs = 300) {
  const connections: ReturnType<typeof fakeConnection>[] = [];
  const sessions = new Sessions({
    makeSpeech: () => Promise.reject(new Error('not used')),
    settings: {} as never,
    log: createLogger({ write: () => {} }),
    joinVoice: () => {
      const c = fakeConnection();
      connections.push(c);
      return c as never;
    },
    readyTimeoutMs,
  });
  return { sessions, connections };
}

test('a session is "connecting" until its voice connection is ready', async () => {
  const { sessions, connections } = setup();
  const joining = sessions.join(fakeChannel('vc1'));
  assert.equal(sessions.get('g1')?.status, 'connecting');
  assert.equal(sessions.getReady('g1'), undefined, 'messages must not be queued before the connection is up');
  connections[0]!.ready();
  const session = await joining;
  assert.equal(session.status, 'ready');
  assert.equal(sessions.getReady('g1'), session);
  sessions.destroyAll();
  assert.equal(session.status, 'destroyed');
});

test('a join that is replaced by a newer /join fails at once as "cancelled", not after the ready timeout', async () => {
  const { sessions, connections } = setup(300);
  const started = Date.now();
  const first = sessions.join(fakeChannel('vc1'));
  const firstResult = first.then(() => 'joined', (err: Error) => err.name);
  const second = sessions.join(fakeChannel('vc2'));
  connections[1]!.ready();
  await second;
  assert.equal(await firstResult, 'JoinCancelledError');
  assert.ok(Date.now() - started < 150, `first join took ${Date.now() - started} ms to give up`);
  assert.equal(sessions.get('g1')?.channelId, 'vc2');
  sessions.destroyAll();
});

test('/leave while still connecting cancels the join', async () => {
  const { sessions } = setup(300);
  const joining = sessions.join(fakeChannel('vc1'));
  const result = joining.then(() => 'joined', (err: Error) => err.name);
  sessions.leave('g1');
  assert.equal(await result, 'JoinCancelledError');
  assert.equal(sessions.get('g1'), undefined);
});

test('a join that never connects times out and leaves no session behind', async () => {
  const { sessions } = setup(50);
  await assert.rejects(sessions.join(fakeChannel('vc1')));
  assert.equal(sessions.get('g1'), undefined);
});
