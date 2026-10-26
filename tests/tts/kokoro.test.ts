// Unit tests: no Kokoro needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSpeechRequest, parseVoices, KokoroError } from '../../src/tts/kokoro.ts';

test('buildSpeechRequest asks for streamed raw PCM', () => {
  assert.deepEqual(buildSpeechRequest({ text: 'left door', voice: 'af_bella' }), {
    model: 'kokoro',
    input: 'left door',
    voice: 'af_bella',
    speed: 1,
    response_format: 'pcm',
    stream: true,
  });
});

test('buildSpeechRequest keeps blends and speed, trims text', () => {
  const req = buildSpeechRequest({ text: '  hi  ', voice: 'af_bella(2)+af_sky(1)', speed: 1.2 });
  assert.equal(req.input, 'hi');
  assert.equal(req.voice, 'af_bella(2)+af_sky(1)');
  assert.equal(req.speed, 1.2);
});

test('buildSpeechRequest sends lang_code only when set', () => {
  assert.equal('lang_code' in buildSpeechRequest({ text: 'hi', voice: 'af_bella' }), false);
  assert.equal(buildSpeechRequest({ text: 'hi', voice: 'jf_alpha', langCode: 'a' }).lang_code, 'a');
});

test('buildSpeechRequest rejects empty text, empty voice, bad speed', () => {
  assert.throws(() => buildSpeechRequest({ text: '   ', voice: 'af_bella' }), KokoroError);
  assert.throws(() => buildSpeechRequest({ text: 'hi', voice: '' }), KokoroError);
  assert.throws(() => buildSpeechRequest({ text: 'hi', voice: 'af_bella', speed: 0 }), KokoroError);
  assert.throws(() => buildSpeechRequest({ text: 'hi', voice: 'af_bella', speed: Number.NaN }), KokoroError);
});

test('parseVoices reads ids and keeps grades when present', () => {
  // Trimmed copy of the real v0.9.0 response.
  const json = {
    voices: [
      { id: 'af_bella', name: 'af_bella', target_quality: 'A', training_duration: 'HH hours', overall_grade: 'A-' },
      { id: 'af_jadzia', name: 'af_jadzia' },
    ],
    default_voice: 'af_heart',
  };
  assert.deepEqual(parseVoices(json), [{ id: 'af_bella', grade: 'A-' }, { id: 'af_jadzia' }]);
});

test('parseVoices skips malformed entries and rejects a wrong shape', () => {
  assert.deepEqual(parseVoices({ voices: [null, 42, { name: 'no id' }, { id: 'ok' }] }), [{ id: 'ok' }]);
  assert.throws(() => parseVoices({ nope: [] }), KokoroError);
  assert.throws(() => parseVoices(null), KokoroError);
});
