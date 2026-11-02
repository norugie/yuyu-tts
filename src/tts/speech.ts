// Steps [4]+[5]: text → Kokoro (streaming PCM) → ffmpeg (pitch + Ogg Opus).
// Returns as soon as Kokoro starts answering; audio keeps streaming while it plays.

import type { Readable } from 'node:stream';
import { encodePcm } from './audio.ts';
import type { KokoroClient } from './kokoro.ts';
import { resolveVoice, type Presets, type VoiceChoice } from './presets.ts';
import type { Logger } from '../log.ts';
import type { Prepared } from '../voice/queue.ts';

export type SpeechRequest = {
  text: string;
  voice: string;
  speed: number;
  semitones: number;
  extraPitch: number;
};

export type Speech = Prepared & {
  // Ogg Opus, ready for @discordjs/voice (StreamType.OggOpus).
  audio: Readable;
  // Rejects if ffmpeg fails (ignored after cancel()).
  done: Promise<void>;
  // When Kokoro's first audio bytes arrived (Date.now()), for the latency log (E1).
  firstByteAt(): number | undefined;
};

export type SpeechMaker = (req: SpeechRequest) => Promise<Speech>;

// Pure: what to ask for to say `text` in a resolved voice (resolveVoice). The one place that maps
// voice settings to a request, used by messages, previews and the warm-up.
export function speechFor(text: string, v: VoiceChoice): SpeechRequest {
  return { text, voice: v.voice, speed: v.speed, semitones: v.semitones, extraPitch: v.extraPitch };
}

export function createSpeechMaker(kokoro: KokoroClient, opts: { ffmpegPath?: string } = {}): SpeechMaker {
  return async (req) => {
    const pcm = await kokoro.synthesize({ text: req.text, voice: req.voice, speed: req.speed });
    const enc = encodePcm(pcm, { semitones: req.semitones, extraPitch: req.extraPitch, ffmpegPath: opts.ffmpegPath });
    let firstByte: number | undefined;
    pcm.once('data', () => (firstByte = Date.now()));
    return {
      audio: enc.stdout,
      done: enc.done,
      firstByteAt: () => firstByte,
      cancel() {
        pcm.destroy();
        enc.kill();
      },
    };
  };
}

// For /voice previews when the bot isn't in a call: the whole clip as one .ogg buffer.
export async function speechToBuffer(speech: Speech): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of speech.audio) chunks.push(chunk as Buffer);
  await speech.done;
  return Buffer.concat(chunks);
}

// AC10.8: the first clip after Kokoro starts is often slower (setup on first use), so make
// one short throwaway clip per preset at startup, one after another, and log how long each took.
// Never throws: a failed warm-up just means the first real message is a bit slower.
export async function warmUp(makeSpeech: SpeechMaker, presets: Presets, log: Logger): Promise<void> {
  for (const p of presets.list) {
    const start = Date.now();
    try {
      // Through resolveVoice with neutral user settings, so it's exactly what a real message asks for.
      const v = resolveVoice(presets, { preset: p.id, speed: 1, pitch: 0 });
      await speechToBuffer(await makeSpeech(speechFor('Warming up.', v)));
      log.info('warm-up done', { preset: p.id, warmup_ms: Date.now() - start });
    } catch (err) {
      log.warn('warm-up failed', { preset: p.id, err });
    }
  }
}
