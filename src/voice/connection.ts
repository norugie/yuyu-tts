import {
  AudioPlayerStatus,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
  type AudioPlayer,
  type VoiceConnection,
} from '@discordjs/voice';
import type { Guild, VoiceBasedChannel } from 'discord.js';
import type { Logger } from '../log.ts';
import type { Speech, SpeechMaker, SpeechRequest } from '../tts/speech.ts';
import type { SettingsStore } from '../store/settings.ts';
import { PlaybackQueue } from './queue.ts';

export const ALONE_TIMEOUT_MS = 2 * 60 * 1000;
const READY_TIMEOUT_MS = 20_000;
// A message whose audio hasn't started by then is stopped (e.g. Kokoro stalled mid-answer),
// and one that plays longer than this is cut. 300 characters at the slowest speed is about 40 s.
export const START_TIMEOUT_MS = 10_000;
export const PLAY_TIMEOUT_MS = 90_000;

export type SpeakItem = SpeechRequest & {
  // For the latency log. Previews have no message.
  receivedAt?: number;
  messageId?: string;
  userId?: string;
};

export const NOT_IN_VOICE = 'Hop into a voice channel first, then try again.';

// VoiceConnection is an EventEmitter that emits 'error' when its network layer fails.
// Node throws an 'error' event that has no listener, which would crash the whole bot.
// Logging is enough: the Disconnected handler decides whether to reconnect or leave.
export function watchConnection(connection: { on(event: 'error', listener: (err: Error) => void): unknown }, log: Logger): void {
  connection.on('error', (err) => log.warn('voice connection error', { err }));
}

// If it hasn't started playing within startTimeoutMs, the player is stopped, so a stalled
// stream can't hold the queue forever. Exported (with a loose player type) so tests can use a fake.
export function playToEnd(
  player: Pick<AudioPlayer, 'on' | 'off' | 'play' | 'stop'>,
  resource: Parameters<AudioPlayer['play']>[0],
  opts: { startTimeoutMs: number; onPlaying: () => void; onStartTimeout: () => void },
): Promise<void> {
  return new Promise<void>((resolve) => {
    let started = false;
    const timer = setTimeout(() => {
      if (started) return;
      opts.onStartTimeout();
      player.stop(true);
    }, opts.startTimeoutMs);
    const onState = (_old: unknown, state: { status: AudioPlayerStatus }) => {
      if (state.status === AudioPlayerStatus.Playing && !started) {
        started = true;
        clearTimeout(timer);
        opts.onPlaying();
      }
      if (state.status === AudioPlayerStatus.Idle) {
        clearTimeout(timer);
        player.off('stateChange', onState);
        resolve();
      }
    };
    player.on('stateChange', onState);
    player.play(resource);
  });
}

export function isAlone(members: Iterable<{ bot: boolean }>): boolean {
  for (const m of members) if (!m.bot) return false;
  return true;
}

export type SessionStatus = 'connecting' | 'ready' | 'destroyed';

// The join was stopped on purpose (a newer /join replaced it, or /leave): not a connection failure.
export class JoinCancelledError extends Error {
  constructor() {
    super('the join was cancelled');
    this.name = 'JoinCancelledError';
  }
}

// What a session needs from outside. joinVoice and readyTimeoutMs exist so tests can use a fake connection.
export type SessionOptions = {
  makeSpeech: SpeechMaker;
  settings: SettingsStore;
  log: Logger;
  joinVoice?: (channel: VoiceBasedChannel) => VoiceConnection;
  readyTimeoutMs?: number;
};

function joinVoiceChannelFor(channel: VoiceBasedChannel): VoiceConnection {
  return joinVoiceChannel({
    channelId: channel.id,
    guildId: channel.guild.id,
    adapterCreator: channel.guild.voiceAdapterCreator,
    // We only send audio, never listen.
    selfDeaf: true,
  });
}

export class VoiceSession {
  readonly guildId: string;
  channelId: string;
  lastSpeakerId: string | undefined;
  readonly queue: PlaybackQueue<SpeakItem, Speech>;
  readonly #connection: VoiceConnection;
  readonly #player: AudioPlayer;
  readonly #log: Logger;
  #aloneTimer: NodeJS.Timeout | undefined;
  #onDestroyed: () => void;
  readonly #readyTimeoutMs: number;
  // connecting → ready → destroyed (or connecting → destroyed). Never goes back.
  #status: SessionStatus = 'connecting';
  readonly #cancelJoin = new AbortController();

  constructor(opts: SessionOptions & { channel: VoiceBasedChannel; onDestroyed: () => void }) {
    const { channel } = opts;
    this.guildId = channel.guild.id;
    this.channelId = channel.id;
    this.#log = opts.log.child({ guild: this.guildId });
    this.#onDestroyed = opts.onDestroyed;
    this.#readyTimeoutMs = opts.readyTimeoutMs ?? READY_TIMEOUT_MS;

    this.#connection = (opts.joinVoice ?? joinVoiceChannelFor)(channel);
    // Play even if nobody is "subscribed" yet; the connection subscribes right below.
    this.#player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Play } });
    this.#connection.subscribe(this.#player);
    this.#player.on('error', (err) => this.#log.error('audio player error', { err }));
    watchConnection(this.#connection, this.#log);

    // Network blips: wait briefly for Discord to reconnect us; otherwise give up cleanly.
    this.#connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(this.#connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(this.#connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch {
        this.#log.warn('voice disconnected, leaving');
        this.destroy();
      }
    });

    this.queue = new PlaybackQueue<SpeakItem, Speech>({
      log: this.#log,
      mode: () => opts.settings.getGuild(this.guildId).queueMode,
      prepare: (item) => opts.makeSpeech(item),
      play: (speech, item) => this.#play(speech, item),
      stopPlayback: () => this.#player.stop(true),
      playTimeoutMs: PLAY_TIMEOUT_MS,
    });
  }

  get status(): SessionStatus {
    return this.#status;
  }

  // Waits until the voice connection is up (DAVE handshake included).
  // Throws JoinCancelledError if the session is destroyed meanwhile (replaced by a newer /join, or /leave).
  async ready(): Promise<void> {
    if (this.#status === 'destroyed') throw new JoinCancelledError();
    try {
      const signal = AbortSignal.any([AbortSignal.timeout(this.#readyTimeoutMs), this.#cancelJoin.signal]);
      await entersState(this.#connection, VoiceConnectionStatus.Ready, signal);
    } catch (err) {
      if (this.#cancelJoin.signal.aborted) throw new JoinCancelledError();
      throw err;
    }
    // destroy() can run while we were waiting; TypeScript can't see that across the await.
    if ((this.#status as SessionStatus) === 'destroyed') throw new JoinCancelledError();
    this.#status = 'ready';
  }

  #play(speech: Speech, item: SpeakItem): Promise<void> {
    const resource = createAudioResource(speech.audio, { inputType: StreamType.OggOpus });
    speech.done.catch((err: unknown) => this.#log.debug('ffmpeg ended early', { err }));
    return playToEnd(this.#player, resource, {
      startTimeoutMs: START_TIMEOUT_MS,
      onPlaying: () => {
        if (item.receivedAt === undefined) return;
        // Received → playing is our "first audio" time.
        const now = Date.now();
        this.#log.info('speaking', {
          message: item.messageId,
          user: item.userId,
          chars: item.text.length,
          t_received: item.receivedAt,
          t_tts_first_byte: speech.firstByteAt(),
          t_playing: now,
          latency_ms: now - item.receivedAt,
        });
      },
      onStartTimeout: () => {
        this.#log.warn('audio did not start in time, skipping', { message: item.messageId, timeout_ms: START_TIMEOUT_MS });
        speech.cancel();
      },
    });
  }

  // Call whenever voice states in our channel change.
  updateAlone(alone: boolean): void {
    if (!alone) {
      if (this.#aloneTimer !== undefined) clearTimeout(this.#aloneTimer);
      this.#aloneTimer = undefined;
      return;
    }
    if (this.#aloneTimer !== undefined) return;
    this.#aloneTimer = setTimeout(() => {
      this.#log.info('alone for 2 minutes, leaving');
      this.destroy();
    }, ALONE_TIMEOUT_MS);
  }

  destroy(): void {
    if (this.#status === 'destroyed') return;
    this.#status = 'destroyed';
    this.#cancelJoin.abort();
    if (this.#aloneTimer !== undefined) clearTimeout(this.#aloneTimer);
    this.queue.clear();
    this.#player.stop(true);
    if (this.#connection.state.status !== VoiceConnectionStatus.Destroyed) this.#connection.destroy();
    this.#onDestroyed();
  }
}

export class Sessions {
  readonly #byGuild = new Map<string, VoiceSession>();
  readonly #deps: SessionOptions;

  constructor(deps: SessionOptions) {
    this.#deps = deps;
  }

  // Includes a session that is still connecting (so /leave can cancel it).
  get(guildId: string): VoiceSession | undefined {
    return this.#byGuild.get(guildId);
  }

  // Only a session whose connection is up: use this for anything that plays audio.
  getReady(guildId: string): VoiceSession | undefined {
    const session = this.#byGuild.get(guildId);
    return session?.status === 'ready' ? session : undefined;
  }

  // Joins (or moves to) a voice channel. Throws JoinCancelledError if it is replaced or left
  // before it connects, and any other error if the connection doesn't come up in time.
  async join(channel: VoiceBasedChannel): Promise<VoiceSession> {
    this.#byGuild.get(channel.guild.id)?.destroy();
    const session: VoiceSession = new VoiceSession({
      ...this.#deps,
      channel,
      onDestroyed: () => {
        if (this.#byGuild.get(channel.guild.id) === session) this.#byGuild.delete(channel.guild.id);
      },
    });
    this.#byGuild.set(channel.guild.id, session);
    try {
      await session.ready();
    } catch (err) {
      session.destroy();
      throw err;
    }
    session.updateAlone(isAlone(channel.members.map((m) => ({ bot: m.user.bot }))));
    return session;
  }

  leave(guildId: string): void {
    this.#byGuild.get(guildId)?.destroy();
  }

  // Keep the alone timer and our channel id up to date, and notice if we were kicked or moved.
  onVoiceStateChange(guild: Guild, botUserId: string): void {
    const session = this.#byGuild.get(guild.id);
    if (session === undefined) return;
    const me = guild.members.me ?? guild.members.cache.get(botUserId);
    const myChannel = me?.voice.channel ?? null;
    if (myChannel === null) {
      // Someone disconnected the bot; the Disconnected handler will clean up if it doesn't come back.
      return;
    }
    session.channelId = myChannel.id;
    session.updateAlone(isAlone(myChannel.members.map((m) => ({ bot: m.user.bot }))));
  }

  destroyAll(): void {
    for (const s of [...this.#byGuild.values()]) s.destroy();
  }
}
