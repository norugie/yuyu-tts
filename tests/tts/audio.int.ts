// Needs ffmpeg on PATH (or FFMPEG_PATH). Doesn't need Kokoro: it feeds a generated tone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { encodePcm } from '../../src/tts/audio.ts';
import { PCM_FORMAT } from '../../src/tts/kokoro.ts';

// 1 s of a 440 Hz sine as 16-bit mono PCM at Kokoro's rate.
function tone(seconds = 1): Buffer {
  const n = PCM_FORMAT.sampleRate * seconds;
  const buf = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / PCM_FORMAT.sampleRate) * 8000), i * 2);
  return buf;
}

async function encodeToBuffer(semitones: number): Promise<Buffer> {
  const { stdout, done } = encodePcm(Readable.from([tone()]), { semitones });
  const chunks: Buffer[] = [];
  for await (const c of stdout) chunks.push(c as Buffer);
  await done;
  return Buffer.concat(chunks);
}

test('encodes PCM to Ogg Opus', async () => {
  const ogg = await encodeToBuffer(0);
  assert.equal(ogg.subarray(0, 4).toString('ascii'), 'OggS', 'output should start with an Ogg page');
  assert.ok(ogg.includes(Buffer.from('OpusHead')), 'output should contain an Opus header');
});

test('encodes with a pitch shift', async () => {
  const ogg = await encodeToBuffer(3);
  assert.equal(ogg.subarray(0, 4).toString('ascii'), 'OggS');
});
