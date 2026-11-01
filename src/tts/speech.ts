// Steps [4]+[5]: text → Kokoro (streaming PCM) → ffmpeg (pitch + Ogg Opus).
// Returns as soon as Kokoro starts answering; audio keeps streaming while it plays.

import type { Readable } from 'node:stream';
import { encodePcm } from './audio.ts';
import type { KokoroClient } from './kokoro.ts';
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

export function createSpeechMaker(kokoro: KokoroClient): SpeechMaker {
  return async (req) => {
    const pcm = await kokoro.synthesize({ text: req.text, voice: req.voice, speed: req.speed });
    const enc = encodePcm(pcm, { semitones: req.semitones, extraPitch: req.extraPitch });
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
