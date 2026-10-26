// Audio post-processing with ffmpeg: pitch shift + encode to Ogg Opus for Discord.
// ffmpeg options checked against the ffmpeg 7 docs (asetrate, aresample, atempo, libopus, ogg muxer page_duration).

import { spawn } from 'node:child_process';
import type { Readable } from 'node:stream';
import { PCM_FORMAT } from './kokoro.ts';

// Discord voice is Opus at 48 kHz, stereo, 20 ms frames.
export const DISCORD_AUDIO = { sampleRate: 48_000, channels: 2, frameMs: 20 } as const;

// atempo only accepts 0.5–2.0, so ±12 semitones (one octave) is the most one filter chain can do.
export const MAX_SEMITONES = 12;

// Rounds to 6 decimals so filter strings are stable and readable in logs and tests.
const fmt = (n: number): string => String(Math.round(n * 1e6) / 1e6);

// Pure: ffmpeg -af string that shifts pitch by `semitones` and resamples to 48 kHz.
//
// How it works, like a tape player:
//   1. asetrate pretends the audio was recorded k times faster, so pitch AND speed go up by k.
//   2. aresample converts that to a real 48 kHz stream (what Discord wants).
//   3. atempo slows it back down by 1/k without changing pitch, so only the pitch change remains.
// k = 2^(semitones/12): +12 semitones doubles the frequency (one octave up).
// Side effect: formants (the "shape" of the voice) move up too, a slight chipmunk effect,
// which is part of what makes it sound cuter. ffmpeg's rubberband filter avoids that; compared in 2.7.
export function buildPitchFilter(semitones: number, inputRate: number = PCM_FORMAT.sampleRate): string {
  if (!Number.isFinite(semitones) || Math.abs(semitones) > MAX_SEMITONES) {
    throw new RangeError(`semitones must be between -${MAX_SEMITONES} and ${MAX_SEMITONES}, got ${semitones}`);
  }
  const resample = `aresample=${DISCORD_AUDIO.sampleRate}`;
  if (semitones === 0) return resample;

  const k = 2 ** (semitones / 12);
  // asetrate takes a whole number of Hz; rounding changes pitch by under 0.01%, which nobody can hear.
  return [`asetrate=${Math.round(inputRate * k)}`, resample, `atempo=${fmt(1 / k)}`].join(',');
}

// Pure: pitch filter plus an optional extra pitch raise that keeps formants where they are.
//
// Two separate knobs, because "younger" and "higher" are not the same thing:
//   - semitones (asetrate) moves pitch AND formants. Formants are the resonances of the throat and mouth;
//     moving them up sounds like a smaller person. Too much sounds like a chipmunk.
//   - extraPitch (rubberband, formant=preserved) raises only the note being sung, not the "size".
// A childlike/anime voice is roughly: formants up a little (+2 to +4), pitch up more (+3 to +4 extra).
// rubberband needs an ffmpeg build with librubberband (check: ffmpeg -filters | findstr rubberband).
export function buildVoiceFilter(semitones = 0, extraPitch = 0): string {
  const base = buildPitchFilter(semitones);
  if (extraPitch === 0) return base;
  if (!Number.isFinite(extraPitch) || Math.abs(extraPitch) > MAX_SEMITONES) {
    throw new RangeError(`extraPitch must be between -${MAX_SEMITONES} and ${MAX_SEMITONES}, got ${extraPitch}`);
  }
  return `${base},rubberband=pitch=${fmt(2 ** (extraPitch / 12))}:formant=preserved`;
}

export type EncodeOptions = {
  semitones?: number;
  // Extra pitch in semitones that leaves formants alone (see buildVoiceFilter). 0 = off.
  extraPitch?: number;
  // Opus bitrate in kbit/s. 64 is plenty for speech; Discord's own default is 64.
  bitrateKbps?: number;
  // Where ffmpeg writes: 'pipe:1' (stdout, for streaming to Discord) or a file path (for clips).
  output?: string;
};

// Pure: full ffmpeg argument list for Kokoro PCM on stdin → Ogg Opus.
export function buildFfmpegArgs(opts: EncodeOptions = {}): string[] {
  const { semitones = 0, extraPitch = 0, bitrateKbps = 64, output = 'pipe:1' } = opts;
  return [
    '-hide_banner',
    '-loglevel', 'error',
    // Kokoro's raw PCM has no header, so we must describe it.
    '-f', 's16le', '-ar', String(PCM_FORMAT.sampleRate), '-ac', String(PCM_FORMAT.channels),
    '-i', 'pipe:0',
    '-af', buildVoiceFilter(semitones, extraPitch),
    '-ac', String(DISCORD_AUDIO.channels),
    '-c:a', 'libopus',
    '-b:a', `${bitrateKbps}k`,
    '-frame_duration', String(DISCORD_AUDIO.frameMs),
    '-f', 'ogg',
    // Flush an Ogg page every 20 ms (one Opus frame) instead of every 1 s, so audio isn't held back.
    '-page_duration', String(DISCORD_AUDIO.frameMs * 1000),
    ...(output === 'pipe:1' ? [] : ['-y']),
    output,
  ];
}

// Pipes PCM through ffmpeg. Resolves when ffmpeg exits cleanly, rejects with its stderr otherwise.
// Returns ffmpeg's stdout (Ogg Opus) when output is 'pipe:1'; read it while awaiting `done`.
export function encodePcm(pcm: Readable, opts: EncodeOptions = {}): { stdout: Readable; done: Promise<void> } {
  const ffmpeg = spawn(process.env.FFMPEG_PATH ?? 'ffmpeg', buildFfmpegArgs(opts), { stdio: ['pipe', 'pipe', 'pipe'] });

  let stderr = '';
  ffmpeg.stderr.setEncoding('utf8');
  ffmpeg.stderr.on('data', (chunk: string) => (stderr += chunk));

  const done = new Promise<void>((resolve, reject) => {
    ffmpeg.once('error', (err) =>
      reject(new Error(`could not start ffmpeg (${err.message}). Is it installed and on PATH? Or set FFMPEG_PATH.`)),
    );
    ffmpeg.once('close', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`ffmpeg exited with code ${code}: ${stderr.trim()}${/rubberband/.test(stderr) ? ' (this ffmpeg build has no rubberband; install the full build: winget install --id Gyan.FFmpeg -e)' : ''}`)),
    );
  });

  // Callers often read stdout first and await `done` after. Without this, an early failure (e.g. ffmpeg
  // not installed) counts as an unhandled rejection for a moment and Node prints a warning.
  // Awaiting `done` still throws the error as usual.
  done.catch(() => {});

  // If ffmpeg dies early, writing to its stdin errors with EPIPE; `done` reports the real reason.
  ffmpeg.stdin.on('error', () => {});
  pcm.on('error', () => ffmpeg.kill());
  pcm.pipe(ffmpeg.stdin);

  return { stdout: ffmpeg.stdout, done };
}
