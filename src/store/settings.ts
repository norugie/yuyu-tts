// Voice, speed and pitch are per user and shared across servers; /tts on|off is per server.

import type { Db } from './db.ts';
import { cleanWord, type DictOverride } from '../text/dictionary.ts';

export const QUEUE_MODES = ['in-order', 'newest'] as const;
export type QueueMode = (typeof QUEUE_MODES)[number];

export const NAME_PREFIX_MODES = ['always', 'on-change', 'never'] as const;
export type NamePrefixMode = (typeof NAME_PREFIX_MODES)[number];

export type UserSettings = {
  // null = use the default preset.
  preset: string | null;
  // Multiplies the preset's speed (1 = as the preset is). Allowed: 0.5–2.0.
  speed: number;
  // Semitones added to the preset's pitch (0 = as the preset is). Allowed: −4 to +4.
  pitch: number;
};

export type GuildSettings = {
  queueMode: QueueMode;
  namePrefix: NamePrefixMode;
  // null = read the chat of the voice channel the bot is in.
  readChannelId: string | null;
  maxChars: number;
};

export type Member = { optedIn: boolean; spokenName: string | null };

export const DEFAULT_USER: UserSettings = { preset: null, speed: 1, pitch: 0 };
export const DEFAULT_GUILD: GuildSettings = { queueMode: 'in-order', namePrefix: 'on-change', readChannelId: null, maxChars: 300 };

export const SPEED_RANGE = { min: 0.5, max: 2 } as const;
export const PITCH_RANGE = { min: -4, max: 4 } as const;

export const SPOKEN_NAME_MAX = 32;

export function cleanSpokenName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, SPOKEN_NAME_MAX).trim();
}

export type SettingsStore = ReturnType<typeof createSettingsStore>;

export function createSettingsStore(db: Db, now: () => Date = () => new Date()) {
  const stamp = () => now().toISOString();

  const q = {
    getUser: db.prepare('SELECT preset, speed, pitch FROM user_settings WHERE user_id = ?'),
    upsertUser: db.prepare(`
      INSERT INTO user_settings (user_id, preset, speed, pitch, updated_at) VALUES (@userId, @preset, @speed, @pitch, @at)
      ON CONFLICT (user_id) DO UPDATE SET preset = @preset, speed = @speed, pitch = @pitch, updated_at = @at`),
    deleteUser: db.prepare('DELETE FROM user_settings WHERE user_id = ?'),
    getOptIn: db.prepare('SELECT opted_in, spoken_name FROM guild_opt_in WHERE guild_id = ? AND user_id = ?'),
    upsertOptIn: db.prepare(`
      INSERT INTO guild_opt_in (guild_id, user_id, opted_in, updated_at) VALUES (@guildId, @userId, @optedIn, @at)
      ON CONFLICT (guild_id, user_id) DO UPDATE SET opted_in = @optedIn, updated_at = @at`),
    setSpokenName: db.prepare(`
      INSERT INTO guild_opt_in (guild_id, user_id, opted_in, spoken_name, updated_at) VALUES (@guildId, @userId, 0, @name, @at)
      ON CONFLICT (guild_id, user_id) DO UPDATE SET spoken_name = @name, updated_at = @at`),
    getGuild: db.prepare('SELECT queue_mode, name_prefix, read_channel_id, max_chars FROM guild_settings WHERE guild_id = ?'),
    upsertGuild: db.prepare(`
      INSERT INTO guild_settings (guild_id, queue_mode, name_prefix, read_channel_id, max_chars) VALUES (@guildId, @queueMode, @namePrefix, @readChannelId, @maxChars)
      ON CONFLICT (guild_id) DO UPDATE SET queue_mode = @queueMode, name_prefix = @namePrefix, read_channel_id = @readChannelId, max_chars = @maxChars`),
    getDict: db.prepare('SELECT word, spoken FROM dictionary WHERE guild_id = ? ORDER BY word'),
    upsertDict: db.prepare(`
      INSERT INTO dictionary (guild_id, word, spoken) VALUES (@guildId, @word, @spoken)
      ON CONFLICT (guild_id, word) DO UPDATE SET spoken = @spoken`),
    deleteDict: db.prepare('DELETE FROM dictionary WHERE guild_id = ? AND word = ?'),
  };

  const getUser = (userId: string): UserSettings => {
    const row = q.getUser.get(userId) as { preset: string | null; speed: number; pitch: number } | undefined;
    return row === undefined ? { ...DEFAULT_USER } : { preset: row.preset, speed: row.speed, pitch: row.pitch };
  };
  const saveUser = (userId: string, s: UserSettings) => q.upsertUser.run({ userId, ...s, at: stamp() });

  const getGuild = (guildId: string): GuildSettings => {
    const row = q.getGuild.get(guildId) as
      | { queue_mode: string; name_prefix: string; read_channel_id: string | null; max_chars: number }
      | undefined;
    if (row === undefined) return { ...DEFAULT_GUILD };
    return {
      // Fall back to the default if the DB somehow holds an unknown value.
      queueMode: (QUEUE_MODES as readonly string[]).includes(row.queue_mode) ? (row.queue_mode as QueueMode) : DEFAULT_GUILD.queueMode,
      namePrefix: (NAME_PREFIX_MODES as readonly string[]).includes(row.name_prefix) ? (row.name_prefix as NamePrefixMode) : DEFAULT_GUILD.namePrefix,
      readChannelId: row.read_channel_id,
      maxChars: row.max_chars,
    };
  };
  const saveGuild = (guildId: string, s: GuildSettings) => q.upsertGuild.run({ guildId, ...s });

  return {
    getUser,
    setPreset: (userId: string, preset: string | null) => saveUser(userId, { ...getUser(userId), preset }),
    setSpeed(userId: string, speed: number) {
      if (!Number.isFinite(speed) || speed < SPEED_RANGE.min || speed > SPEED_RANGE.max) {
        throw new RangeError(`speed must be between ${SPEED_RANGE.min} and ${SPEED_RANGE.max}`);
      }
      saveUser(userId, { ...getUser(userId), speed });
    },
    setPitch(userId: string, pitch: number) {
      if (!Number.isFinite(pitch) || pitch < PITCH_RANGE.min || pitch > PITCH_RANGE.max) {
        throw new RangeError(`pitch must be between ${PITCH_RANGE.min} and ${PITCH_RANGE.max}`);
      }
      saveUser(userId, { ...getUser(userId), pitch });
    },
    // /settings reset: voice, speed and pitch back to defaults (opt-in is left alone).
    resetUser: (userId: string) => void q.deleteUser.run(userId),

    // spokenName null = their Discord display name.
    getMember(guildId: string, userId: string): Member {
      const row = q.getOptIn.get(guildId, userId) as { opted_in: number; spoken_name: string | null } | undefined;
      return { optedIn: row?.opted_in === 1, spokenName: row?.spoken_name ?? null };
    },
    setOptIn: (guildId: string, userId: string, optedIn: boolean) =>
      void q.upsertOptIn.run({ guildId, userId, optedIn: optedIn ? 1 : 0, at: stamp() }),
    setSpokenName(guildId: string, userId: string, name: string | null) {
      const clean = name === null ? null : cleanSpokenName(name);
      q.setSpokenName.run({ guildId, userId, name: clean === '' ? null : clean, at: stamp() });
    },

    getGuild,
    setQueueMode: (guildId: string, queueMode: QueueMode) => void saveGuild(guildId, { ...getGuild(guildId), queueMode }),
    setReadChannel: (guildId: string, readChannelId: string | null) => void saveGuild(guildId, { ...getGuild(guildId), readChannelId }),
    setNamePrefix: (guildId: string, namePrefix: NamePrefixMode) => void saveGuild(guildId, { ...getGuild(guildId), namePrefix }),

    // spoken '' means "this default word is switched off here".
    getDictOverrides: (guildId: string): DictOverride[] => q.getDict.all(guildId) as DictOverride[],
    setDictWord: (guildId: string, word: string, spoken: string) =>
      void q.upsertDict.run({ guildId, word: cleanWord(word), spoken: spoken.trim() }),
    clearDictWord: (guildId: string, word: string) => void q.deleteDict.run(guildId, cleanWord(word)),
  };
}
