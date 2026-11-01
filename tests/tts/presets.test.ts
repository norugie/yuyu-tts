import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPresets, parsePresets, PresetError, resolveVoice } from '../../src/tts/presets.ts';
import { DEFAULT_USER } from '../../src/store/settings.ts';

const good = {
  default: 'yuzu',
  presets: {
    yuzu: { name: 'Yuzu', voice: 'af_nicole(1)+af_bella(1)', pitch: 3, speed: 1.05 },
    suzu: { name: 'Suzu', voice: 'af_sky(1)+af_nicole(1)', pitch: 2.5, extraPitch: 1, speed: 1.05 },
  },
};

test('AC5.1: the real config/presets.json is valid (3 presets, default Yuzu)', () => {
  const p = loadPresets('config/presets.json');
  assert.deepEqual(p.list.map((x) => x.id), ['yuzu', 'ichigo', 'suzu']);
  assert.equal(p.defaultId, 'yuzu');
});

test('AC5.1: a good file parses; extraPitch defaults to 0', () => {
  const p = parsePresets(good);
  assert.equal(p.byId.get('yuzu')?.extraPitch, 0);
  assert.equal(p.byId.get('suzu')?.extraPitch, 1);
});

test('AC5.1: a bad preset file is rejected with a clear error listing every problem', () => {
  const bad = {
    default: 'nope',
    presets: {
      Yuzu: { name: '', voice: 'bella', pitch: 20, speed: 3 },
    },
  };
  assert.throws(() => parsePresets(bad), (err: unknown) => {
    assert.ok(err instanceof PresetError);
    for (const part of [/id must be lowercase/, /"name"/, /"voice"/, /"pitch"/, /"speed"/, /"default" is "nope"/]) assert.match(err.message, part);
    return true;
  });
  assert.throws(() => parsePresets({ default: 'a', presets: {} }), /at least one preset/);
  assert.throws(() => parsePresets([]), PresetError);
  assert.throws(() => loadPresets('does/not/exist.json'), /could not read/);
});

test('AC5.4: no saved preset → default preset, unchanged', () => {
  const v = resolveVoice(parsePresets(good), DEFAULT_USER);
  assert.equal(v.preset.id, 'yuzu');
  assert.deepEqual([v.voice, v.speed, v.semitones, v.extraPitch], ['af_nicole(1)+af_bella(1)', 1.05, 3, 0]);
});

test('AC5.3: a saved preset is used; an unknown one falls back to the default', () => {
  const p = parsePresets(good);
  assert.equal(resolveVoice(p, { ...DEFAULT_USER, preset: 'suzu' }).preset.id, 'suzu');
  assert.equal(resolveVoice(p, { ...DEFAULT_USER, preset: 'removed' }).preset.id, 'yuzu');
});

test('AC6.1/AC6.2: user speed multiplies, user pitch adds on top of the preset', () => {
  const v = resolveVoice(parsePresets(good), { preset: 'yuzu', speed: 1.5, pitch: -2 });
  assert.equal(v.speed, 1.58);
  assert.equal(v.semitones, 1);
});
