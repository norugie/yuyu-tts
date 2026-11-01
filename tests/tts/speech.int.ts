// Integration: fake Kokoro HTTP server → createSpeechMaker → real ffmpeg → Ogg Opus that
// @discordjs/voice can play (checked by demuxing it into Opus packets the same way the player does).
// Needs ffmpeg on PATH, not Kokoro or Discord.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import prism from 'prism-media';
import { createKokoroClient } from '../../src/tts/kokoro.ts';
import { createSpeechMaker, speechToBuffer } from '../../src/tts/speech.ts';

// 1 s of a 440 Hz tone as 24 kHz mono s16le, sent in a few chunks like Kokoro streams.
function tone(seconds = 1): Buffer {
  const n = 24_000 * seconds;
  const buf = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / 24_000) * 8000), i * 2);
  return buf;
}

async function withFakeKokoro(fn: (url: string, requests: unknown[]) => Promise<void>) {
  const requests: unknown[] = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      requests.push(JSON.parse(body));
      res.writeHead(200, { 'content-type': 'audio/pcm' });
      const pcm = tone();
      for (let i = 0; i < pcm.length; i += 9600) res.write(pcm.subarray(i, i + 9600));
      res.end();
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  try {
    await fn(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, requests);
  } finally {
    server.close();
  }
}

// Splits Ogg into Opus packets with the same demuxer @discordjs/voice uses for StreamType.OggOpus.
async function opusPackets(ogg: Buffer): Promise<Buffer[]> {
  const packets: Buffer[] = [];
  const demux = new prism.opus.OggDemuxer();
  demux.on('data', (p: Buffer) => packets.push(p));
  await new Promise<void>((resolve, reject) => {
    demux.on('end', resolve);
    demux.on('error', reject);
    demux.end(ogg);
  });
  return packets;
}

test('speech comes out as Ogg Opus with 20 ms packets, using the voice settings asked for', async () => {
  await withFakeKokoro(async (url, requests) => {
    const make = createSpeechMaker(createKokoroClient(url));
    const speech = await make({ text: 'left door', voice: 'af_sky(1)+af_nicole(1)', speed: 1.05, semitones: 2.5, extraPitch: 0 });
    const ogg = await speechToBuffer(speech);
    assert.ok(speech.firstByteAt() !== undefined);
    assert.deepEqual(requests[0], { model: 'kokoro', input: 'left door', voice: 'af_sky(1)+af_nicole(1)', speed: 1.05, response_format: 'pcm', stream: true });
    assert.equal(ogg.subarray(0, 4).toString(), 'OggS');

    const packets = await opusPackets(ogg);
    // ~1 s of audio at 20 ms per packet ≈ 50 packets.
    assert.ok(packets.length >= 45 && packets.length <= 60, `got ${packets.length} packets`);
  });
});

// Regression: the queue prepares the next message while the current one plays. ffmpeg used to finish
// before anyone read its output, Node dropped the unread audio, and queued messages played as silence.
test('speech prepared ahead of time still has all its audio when read later', async () => {
  await withFakeKokoro(async (url) => {
    const speech = await createSpeechMaker(createKokoroClient(url))({ text: 'second message', voice: 'af_bella', speed: 1, semitones: 0, extraPitch: 0 });
    await speech.done; // ffmpeg has exited, like a prefetched message waiting its turn
    const packets = await opusPackets(await speechToBuffer(speech));
    assert.ok(packets.length >= 45 && packets.length <= 60, `got ${packets.length} packets`);
  });
});

test('cancel() stops ffmpeg and the Kokoro stream without hanging', async () => {
  await withFakeKokoro(async (url) => {
    const speech = await createSpeechMaker(createKokoroClient(url))({ text: 'x', voice: 'af_bella', speed: 1, semitones: 0, extraPitch: 0 });
    speech.cancel();
    await assert.rejects(speech.done);
  });
});
