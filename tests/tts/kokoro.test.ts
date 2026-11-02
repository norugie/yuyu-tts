import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { buildSpeechBody, createKokoroClient, parseVoices, KokoroError } from '../../src/tts/kokoro.ts';

test('buildSpeechBody asks for streamed raw PCM', () => {
  assert.deepEqual(buildSpeechBody({ text: 'left door', voice: 'af_bella' }), {
    model: 'kokoro',
    input: 'left door',
    voice: 'af_bella',
    speed: 1,
    response_format: 'pcm',
    stream: true,
  });
});

test('buildSpeechBody keeps blends and speed, trims text', () => {
  const req = buildSpeechBody({ text: '  hi  ', voice: 'af_bella(2)+af_sky(1)', speed: 1.2 });
  assert.equal(req.input, 'hi');
  assert.equal(req.voice, 'af_bella(2)+af_sky(1)');
  assert.equal(req.speed, 1.2);
});

test('buildSpeechBody rejects empty text, empty voice, bad speed', () => {
  assert.throws(() => buildSpeechBody({ text: '   ', voice: 'af_bella' }), KokoroError);
  assert.throws(() => buildSpeechBody({ text: 'hi', voice: '' }), KokoroError);
  assert.throws(() => buildSpeechBody({ text: 'hi', voice: 'af_bella', speed: 0 }), KokoroError);
  assert.throws(() => buildSpeechBody({ text: 'hi', voice: 'af_bella', speed: Number.NaN }), KokoroError);
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

// A local stand-in for Kokoro (no real Kokoro needed). Returns its URL and a close function.
async function fakeKokoro(handler: Parameters<typeof createServer>[1]): Promise<{ url: string; close: () => void }> {
  const server: Server = createServer(handler);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  const close = () => {
    server.closeAllConnections();
    server.close();
  };
  return { url: `http://127.0.0.1:${port}`, close };
}

test('a Kokoro that never answers gives a timeout error instead of waiting forever', async () => {
  const k = await fakeKokoro(() => {}); // accepts the request, never responds
  try {
    const client = createKokoroClient(k.url, { responseTimeoutMs: 50 });
    await assert.rejects(client.synthesize({ text: 'hi', voice: 'af_bella' }), (err: unknown) => err instanceof KokoroError && /did not answer within 50 ms/.test(err.message));
  } finally {
    k.close();
  }
});

test('audio that keeps streaming after the timeout is not cut off', async () => {
  // Headers at once, then audio arrives in three pieces over ~150 ms (3x the timeout).
  const k = await fakeKokoro((_req, res) => {
    res.writeHead(200, { 'content-type': 'audio/pcm' });
    // Node holds headers back until the first body write; send them now, like a streaming server.
    res.flushHeaders();
    let n = 0;
    const t = setInterval(() => {
      res.write(Buffer.alloc(100));
      if (++n === 3) {
        clearInterval(t);
        res.end();
      }
    }, 50);
  });
  try {
    const client = createKokoroClient(k.url, { responseTimeoutMs: 50 });
    const pcm = await client.synthesize({ text: 'hi', voice: 'af_bella' });
    let bytes = 0;
    for await (const chunk of pcm) bytes += (chunk as Buffer).length;
    assert.equal(bytes, 300);
  } finally {
    k.close();
  }
});
