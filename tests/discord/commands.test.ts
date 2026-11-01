import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMMANDS } from '../../src/discord/commands/index.ts';
import { describeSettings, voiceMenu, previewLine, VOICE_PREVIEW_PREFIX } from '../../src/discord/commands/voice.ts';
import { readPlace } from '../../src/discord/commands/types.ts';
import { joinError, isAlone } from '../../src/voice/connection.ts';
import { loadPresets } from '../../src/tts/presets.ts';
import { DEFAULT_USER } from '../../src/store/settings.ts';

const presets = loadPresets('config/presets.json');

test('every PRD command is registered, with valid Discord names, server-only', () => {
  const names = COMMANDS.map((c) => c.data.name);
  assert.deepEqual(names.sort(), ['channel', 'join', 'leave', 'pitch', 'prefix', 'queue', 'settings', 'skip', 'speed', 'tts', 'voice']);
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
  assert.equal(joinError(null), 'Hop into a voice channel first, then try again.');
  assert.equal(joinError('123'), null);
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
