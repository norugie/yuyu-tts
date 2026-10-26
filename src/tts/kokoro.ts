// HTTP client for Kokoro-FastAPI (OpenAI-style /v1/audio/speech).
// API shape checked against the running v0.9.0 container's /docs and /v1/audio/voices (PROGRESS.md, 2026-10-25).

import { Readable } from 'node:stream';
import type { ReadableStream as NodeWebReadableStream } from 'node:stream/web';

// What Kokoro sends back for response_format "pcm": raw 16-bit little-endian samples, 24 kHz, mono.
// No header, no compression, so it can go straight into ffmpeg's stdin later.
export const PCM_FORMAT = { sampleRate: 24_000, channels: 1, bytesPerSample: 2 } as const;

export type Voice = {
  id: string;
  // Quality grade from Kokoro's VOICES.md (e.g. "A-"). Only some voices have one.
  grade?: string;
};

export type SynthesizeOptions = {
  text: string;
  // A voice id ("af_bella") or a blend ("af_bella(2)+af_sky(1)").
  voice: string;
  // 1 = normal. Kokoro changes speaking rate in the model itself, which sounds better than stretching audio.
  speed?: number;
  // Which language rules turn the text into sounds. Kokoro picks it from the voice prefix by default
  // (af_ → "a" American English, jf_ → "j" Japanese). Set "a" to make a Japanese voice read English.
  langCode?: string;
};

export type SpeechRequest = {
  model: 'kokoro';
  input: string;
  voice: string;
  speed: number;
  response_format: 'pcm';
  stream: true;
  lang_code?: string;
};

export class KokoroError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'KokoroError';
    this.status = status;
  }
}

// Pure: builds the JSON body for /v1/audio/speech. Exported so it can be unit tested without Kokoro.
export function buildSpeechRequest(opts: SynthesizeOptions): SpeechRequest {
  const input = opts.text.trim();
  if (input === '') throw new KokoroError('text is empty');
  if (opts.voice.trim() === '') throw new KokoroError('voice is empty');
  const speed = opts.speed ?? 1;
  if (!Number.isFinite(speed) || speed <= 0) throw new KokoroError(`invalid speed: ${speed}`);

  const req: SpeechRequest = {
    model: 'kokoro',
    input,
    voice: opts.voice,
    speed,
    // Raw PCM: nothing to decode before ffmpeg, unlike mp3/opus.
    response_format: 'pcm',
    // Kokoro defaults to true already; we set it so the behaviour doesn't depend on a server default.
    stream: true,
  };
  if (opts.langCode !== undefined) req.lang_code = opts.langCode;
  return req;
}

// Pure: turns the /v1/audio/voices response into Voice[].
// Shape seen on v0.9.0: { voices: [{ id, name, overall_grade?, ... }], default_voice }.
export function parseVoices(json: unknown): Voice[] {
  if (typeof json !== 'object' || json === null || !Array.isArray((json as { voices?: unknown }).voices)) {
    throw new KokoroError('unexpected /v1/audio/voices response: missing "voices" array');
  }
  const voices: Voice[] = [];
  for (const item of (json as { voices: unknown[] }).voices) {
    if (typeof item !== 'object' || item === null) continue;
    const { id, overall_grade } = item as { id?: unknown; overall_grade?: unknown };
    if (typeof id !== 'string') continue;
    voices.push(typeof overall_grade === 'string' ? { id, grade: overall_grade } : { id });
  }
  return voices;
}

export type KokoroClient = {
  // Returns a stream of raw PCM (see PCM_FORMAT). Audio starts arriving before the whole message is generated.
  synthesize(opts: SynthesizeOptions): Promise<Readable>;
  listVoices(): Promise<Voice[]>;
  // true if Kokoro answers GET /health within 2 s.
  health(): Promise<boolean>;
};

export function createKokoroClient(baseUrl: string): KokoroClient {
  const url = (path: string) => new URL(path, baseUrl);

  return {
    async synthesize(opts) {
      const body = buildSpeechRequest(opts);
      const res = await fetch(url('/v1/audio/speech'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new KokoroError(`speech request failed (${res.status}): ${await res.text()}`, res.status);
      if (res.body === null) throw new KokoroError('speech response has no body', res.status);
      // fetch gives a web stream; ffmpeg (child_process) wants a Node stream.
      return Readable.fromWeb(res.body as NodeWebReadableStream<Uint8Array>);
    },

    async listVoices() {
      const res = await fetch(url('/v1/audio/voices'));
      if (!res.ok) throw new KokoroError(`voices request failed (${res.status}): ${await res.text()}`, res.status);
      return parseVoices(await res.json());
    },

    async health() {
      try {
        const res = await fetch(url('/health'), { signal: AbortSignal.timeout(2_000) });
        return res.ok;
      } catch {
        return false;
      }
    },
  };
}
