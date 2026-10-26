// Integration tests: need Kokoro running (docker run ... kokoro-fastapi-gpu:v0.9.0).
// Run with: npm run test:int   (uses KOKORO_URL, default http://localhost:8880)
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createKokoroClient, PCM_FORMAT } from '../../src/tts/kokoro.ts';

const kokoro = createKokoroClient(process.env.KOKORO_URL ?? 'http://localhost:8880');

before(async () => {
  assert.ok(await kokoro.health(), 'Kokoro is not reachable. Start the container first, then rerun.');
});

test('synthesize streams non-empty 16-bit PCM', async () => {
  const started = performance.now();
  const audio = await kokoro.synthesize({ text: 'Left door! Need heals.', voice: 'af_bella' });

  let bytes = 0;
  let firstChunkMs: number | undefined;
  for await (const chunk of audio) {
    firstChunkMs ??= performance.now() - started;
    bytes += (chunk as Buffer).length;
  }

  assert.ok(bytes > 0, 'no audio bytes received');
  assert.equal(bytes % PCM_FORMAT.bytesPerSample, 0, 'byte count should be a whole number of 16-bit samples');
  const seconds = bytes / (PCM_FORMAT.sampleRate * PCM_FORMAT.bytesPerSample * PCM_FORMAT.channels);
  console.log(`  first audio after ${firstChunkMs?.toFixed(0)} ms, ${seconds.toFixed(2)} s of audio`);
});

test('synthesize works with a blend', async () => {
  const audio = await kokoro.synthesize({ text: 'on my way', voice: 'af_bella+af_sky' });
  let bytes = 0;
  for await (const chunk of audio) bytes += (chunk as Buffer).length;
  assert.ok(bytes > 0);
});

test('listVoices includes af_bella with its grade', async () => {
  const voices = await kokoro.listVoices();
  assert.deepEqual(voices.find((v) => v.id === 'af_bella'), { id: 'af_bella', grade: 'A-' });
});

test('synthesize rejects an unknown voice', async () => {
  await assert.rejects(kokoro.synthesize({ text: 'hello', voice: 'not_a_voice' }));
});
