// Messages that won't be read stop before the dictionary and normalization.
// handleMessage gets a fake Discord message and a fake context that records what was used.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Message } from 'discord.js';
import { handleMessage } from '../../src/discord/messages.ts';
import type { BotContext } from '../../src/discord/context.ts';
import { createLogger } from '../../src/log.ts';
import { DEFAULT_GUILD, DEFAULT_USER } from '../../src/store/settings.ts';
import { createDictionaryCache } from '../../src/text/dictionary.ts';
import { parsePresets } from '../../src/tts/presets.ts';

const GUILD = '100000000000000001';
const VC = '400000000000000001';

function setup(opts: { optedIn: boolean; channelId?: string }) {
  const dictReads: string[] = [];
  const queued: { text: string }[] = [];
  const session = { channelId: VC, lastSpeakerId: undefined as string | undefined, queue: { enqueue: (item: { text: string }) => queued.push(item) } };
  const ctx = {
    log: createLogger({ write: () => {} }),
    settings: {
      getGuild: () => ({ ...DEFAULT_GUILD }),
      getMember: () => ({ optedIn: opts.optedIn, spokenName: null }),
      getUser: () => ({ ...DEFAULT_USER }),
    },
    presets: parsePresets({ default: 'a', presets: { a: { name: 'A', voice: 'af_bella', pitch: 0, speed: 1 } } }),
    dictionaries: createDictionaryCache(new Map([['omw', 'on my way']]), (g) => {
      dictReads.push(g);
      return [];
    }),
    sessions: { get: () => session },
  } as unknown as BotContext;
  const message = {
    id: '1',
    content: 'omw',
    author: { id: '200000000000000001', bot: false, displayName: 'Mika' },
    member: { displayName: 'Mika' },
    guildId: GUILD,
    channelId: opts.channelId ?? VC,
    inGuild: () => true,
    mentions: { members: new Map(), users: new Map(), roles: new Map() },
    guild: { channels: { cache: new Map() } },
  } as unknown as Message;
  return { ctx, message, dictReads, queued };
}

test('a message from someone not opted in never reads the dictionary', () => {
  const t = setup({ optedIn: false });
  handleMessage(t.message, t.ctx);
  assert.deepEqual(t.dictReads, []);
  assert.deepEqual(t.queued, []);
});

test('a message in another channel never reads the dictionary', () => {
  const t = setup({ optedIn: true, channelId: '400000000000000009' });
  handleMessage(t.message, t.ctx);
  assert.deepEqual(t.dictReads, []);
});

test('an opted-in message is normalized with the server dictionary and queued', () => {
  const t = setup({ optedIn: true });
  handleMessage(t.message, t.ctx);
  handleMessage(t.message, t.ctx);
  assert.deepEqual(t.dictReads, [GUILD], 'dictionary read once, then reused');
  assert.deepEqual(t.queued.map((q) => q.text), ['Mika says. On my way', 'on my way']);
});
