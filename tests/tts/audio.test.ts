import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPitchFilter, buildVoiceFilter, buildFfmpegArgs, MAX_SEMITONES } from '../../src/tts/audio.ts';

test('0 semitones only resamples to 48 kHz', () => {
  assert.equal(buildPitchFilter(0), 'aresample=48000');
});

test('+2 semitones raises the rate and slows tempo by the same factor', () => {
  // k = 2^(2/12) ≈ 1.122462 → 24000·k ≈ 26939, 1/k ≈ 0.890899
  assert.equal(buildPitchFilter(2), 'asetrate=26939,aresample=48000,atempo=0.890899');
});

test('-2 semitones is the mirror image', () => {
  // k ≈ 0.890899 → 24000·k ≈ 21382, 1/k ≈ 1.122462
  assert.equal(buildPitchFilter(-2), 'asetrate=21382,aresample=48000,atempo=1.122462');
});

test('+12 semitones is exactly one octave', () => {
  assert.equal(buildPitchFilter(12), 'asetrate=48000,aresample=48000,atempo=0.5');
});

test('fractional semitones are allowed', () => {
  assert.match(buildPitchFilter(1.5), /^asetrate=\d+,aresample=48000,atempo=[\d.]+$/);
});

test('out-of-range or non-numeric semitones throw', () => {
  assert.throws(() => buildPitchFilter(MAX_SEMITONES + 0.1), RangeError);
  assert.throws(() => buildPitchFilter(-13), RangeError);
  assert.throws(() => buildPitchFilter(Number.NaN), RangeError);
});

test('ffmpeg args describe the PCM input and Discord-ready output', () => {
  const args = buildFfmpegArgs({ semitones: 0 });
  const after = (flag: string) => args[args.indexOf(flag) + 1];
  assert.equal(after('-f'), 's16le');
  assert.equal(after('-i'), 'pipe:0');
  assert.equal(after('-af'), 'aresample=48000');
  assert.equal(after('-c:a'), 'libopus');
  assert.equal(after('-page_duration'), '20000');
  assert.equal(args.at(-1), 'pipe:1');
  assert.ok(!args.includes('-y'), 'no overwrite flag when streaming');
});

test('ffmpeg args write to a file with -y when given a path', () => {
  const args = buildFfmpegArgs({ output: 'clip.ogg', semitones: 2 });
  assert.deepEqual(args.slice(-2), ['-y', 'clip.ogg']);
  assert.equal(args[args.indexOf('-af') + 1], buildPitchFilter(2));
});

test('buildVoiceFilter adds a formant-preserving rubberband step only when extraPitch is set', () => {
  assert.equal(buildVoiceFilter(2), buildPitchFilter(2));
  // +12 extra semitones = pitch factor 2
  assert.equal(buildVoiceFilter(0, 12), 'aresample=48000,rubberband=pitch=2:formant=preserved');
  assert.equal(buildVoiceFilter(3, 3), `${buildPitchFilter(3)},rubberband=pitch=1.189207:formant=preserved`);
  assert.throws(() => buildVoiceFilter(0, 13), RangeError);
});

test('ffmpeg args use extraPitch', () => {
  const args = buildFfmpegArgs({ semitones: 3, extraPitch: 3 });
  assert.equal(args[args.indexOf('-af') + 1], buildVoiceFilter(3, 3));
});

