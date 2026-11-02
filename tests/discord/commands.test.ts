import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMMANDS } from '../../src/discord/commands/index.ts';
import { describeSettings, voiceMenu, previewLine, previewCooldownLeft, VOICE_PREVIEW_PREFIX } from '../../src/discord/commands/voice.ts';
import { readPlace } from '../../src/discord/commands/types.ts';
import { NOT_IN_VOICE, isAlone } from '../../src/voice/connection.ts';
import { loadPresets } from '../../src/tts/presets.ts';
import { DEFAULT_USER } from '../../src/store/settings.ts';

const presets = loadPresets('config/presets.json');

test('every PRD command is registered, with valid Discord names, server-only', () => {
  const names = COMMANDS.map((c) => c.data.name);
  assert.deepEqual(names.sort(), ['channel', 'dict', 'join', 'leave', 'pitch', 'prefix', 'queue', 'settings', 'skip', 'speed', 'tts', 'voice']);
  for (const c of COMMANDS) {
    assert.match(c.data.name, /^[a-z-]{1,32}$/);
    assert.ok(c.data.description.length >= 1 && c.data.description.length <= 100, `${c.data.name} description length`);
    assert.deepEqual(c.data.contexts, [0], `${c.data.name} should be server-only`);
  }
});

test('/speed and /pitch limits match the PRD (AC6.1, AC6.2)', () => {
  const opt = (name: string) => COMMANDS.find((c) => c.data.name === name)!.data.options![0] as { min_value?: number; max_value?: number };
  assert.deepEqual([opt('speed').min_value, opt('speed').max_value], [0.5, 2]);
  assert.deepEqual([opt('pitch').min_value, opt('pitch').max_value], [-4, 4]);
});

test('AC1.2: /join without being in voice gives the PRD error', () => {
  assert.equal(NOT_IN_VOICE, 'Hop into a voice channel first, then try again.');
});

test('AC1.4 helper: alone means only bots are left', () => {
  assert.equal(isAlone([{ bot: true }]), true);
  assert.equal(isAlone([]), true);
  assert.equal(isAlone([{ bot: true }, { bot: false }]), false);
});

test('AC5.2: /voice shows a select menu with every preset plus a preview button each', () => {
  const rows = voiceMenu(presets, 'yuzu').map((r) => r.toJSON());
  const select = rows[0]!.components[0] as unknown as { options: { value: string; default?: boolean }[] };
  assert.deepEqual(select.options.map((o) => o.value), ['yuzu', 'ichigo', 'suzu']);
  assert.equal(select.options.find((o) => o.default)?.value, 'yuzu');
  const buttons = rows.slice(1).flatMap((r) => r.components) as unknown as { custom_id: string }[];
  assert.deepEqual(buttons.map((b) => b.custom_id), ['yuzu', 'ichigo', 'suzu'].map((id) => `${VOICE_PREVIEW_PREFIX}${id}`));
  assert.match(previewLine('Suzu'), /^Hi, I'm Suzu!/);
});

test('AC6.3: /settings shows preset, speed, pitch and opt-in', () => {
  assert.equal(describeSettings(presets, DEFAULT_USER, false), 'Voice: **Yuzu** (default)\nSpeed: **1×**\nPitch: **0**\nReading my messages here: **off**');
  assert.equal(
    describeSettings(presets, { preset: 'suzu', speed: 1.5, pitch: 2 }, true),
    'Voice: **Suzu**\nSpeed: **1.5×**\nPitch: **+2**\nReading my messages here: **on**',
  );
});

test('replies name the channel being read', () => {
  assert.equal(readPlace(null), "the voice channel's chat");
  assert.equal(readPlace('123'), '<#123>');
});

test('/dict remove: switches a default off, deletes a server-only word, or says it is missing', async () => {
  const { removeAction } = await import('../../src/discord/commands/dict.ts');
  const defaults = new Map([['gg', 'good game']]);
  assert.equal(removeAction(defaults, [], 'GG'), 'switch-off');
  assert.equal(removeAction(defaults, [{ word: 'knowy', spoken: 'oh they know' }], 'kn0wy'), 'delete', 'saved words are cleaned, so kn0wy finds knowy');
  assert.equal(removeAction(defaults, [{ word: 'gg', spoken: '' }], 'gg'), 'missing');
  assert.equal(removeAction(defaults, [], 'nope'), 'missing');
});

test('/dict list is sorted and fits in one Discord message', async () => {
  const { describeDictionary } = await import('../../src/discord/commands/dict.ts');
  assert.equal(describeDictionary(new Map([['ty', 'thank you'], ['gg', 'good game']])), 'Words I say differently here (2):\n**gg** → good game\n**ty** → thank you');
  assert.match(describeDictionary(new Map()), /empty/);
  const many = new Map(Array.from({ length: 200 }, (_, i) => [`word${String(i).padStart(3, '0')}`, 'something long to say'] as [string, string]));
  const out = describeDictionary(many);
  assert.ok(out.length <= 2000, `got ${out.length}`);
  assert.match(out, /…and \d+ more\.$/);
});

test('/dict has add, remove and list with Discord length limits', () => {
  const d = COMMANDS.find((c) => c.data.name === 'dict')!.data;
  const subs = d.options as { name: string; options?: { name: string; max_length?: number; required?: boolean }[] }[];
  assert.deepEqual(subs.map((s) => s.name), ['add', 'remove', 'list']);
  assert.deepEqual(subs[0]!.options!.map((o) => [o.name, o.max_length, o.required]), [['word', 32, true], ['say', 100, true]]);
});

test('AC10.9: one preview per person every 5 s', () => {
  assert.equal(previewCooldownLeft(undefined, 1_000), 0, 'first preview is always fine');
  assert.equal(previewCooldownLeft(10_000, 11_000), 4_000);
  assert.equal(previewCooldownLeft(10_000, 15_000), 0);
  assert.equal(previewCooldownLeft(10_000, 20_000), 0);
});
