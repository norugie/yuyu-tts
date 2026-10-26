// Task 2.5: render every candidate preset × every phrase to Ogg Opus clips, plus one "reel" per candidate.
//
// Run (Kokoro container up, ffmpeg on PATH):
//   npm run render                      all candidates
//   npm run render -- --batch 2         one batch (see spikes/candidates.ts)
//   npm run render -- --only sakura     one candidate
//   npm run render -- --quick           ONE line per candidate (fast check), see QUICK_LINE
//   npm run render -- --quick --line "your text"   same, with your own line
//   (--quick combines with --batch / --only)
//
// Writes, under evals/voice-quality/:
//   reels/<candidate>.ogg            ~10 phrases back to back. Listen to these first to shortlist.
//   clips/<candidate>/NN-slug.ogg    every phrase on its own (+ -exclaim/-period variants for short ones)
//   ratings-template.csv             one row per clip; copy to ratings.csv and fill in scores (task 2.6)
//   line/<candidate>.ogg             --quick mode: just the one line, no clips/reels/ratings
//   render-latency.csv               Kokoro time-to-first-audio per clip (E1 preview)

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { join } from 'node:path';
import { createKokoroClient, PCM_FORMAT } from '../src/tts/kokoro.ts';
import { encodePcm } from '../src/tts/audio.ts';
import { CANDIDATES, type Candidate } from './candidates.ts';
import { parsePhrases, clipName, variantsFor, csvField } from './phrases.ts';

const OUT = 'evals/voice-quality';
// Phrases in each reel: a mix of short callouts and longer chat lines (indexes into phrases.txt order).
const REEL_SIZE = 10;
const REEL_GAP_MS = 400;
// --quick: one medium-length chat line, like the group actually types.
const QUICK_LINE = 'This is the test message for this voice. It should be long enough to get a good idea of the voice quality.';

const kokoro = createKokoroClient(process.env.KOKORO_URL ?? 'http://localhost:8880');

async function synthesizeToBuffer(text: string, c: Candidate): Promise<{ pcm: Buffer; firstAudioMs: number; totalMs: number }> {
  const started = performance.now();
  const stream = await kokoro.synthesize({ text, voice: c.voice, speed: c.speed, langCode: c.langCode });
  const chunks: Buffer[] = [];
  let firstAudioMs = Number.NaN;
  for await (const chunk of stream) {
    if (chunks.length === 0) firstAudioMs = performance.now() - started;
    chunks.push(chunk as Buffer);
  }
  return { pcm: Buffer.concat(chunks), firstAudioMs, totalMs: performance.now() - started };
}

// Kokoro PCM → ffmpeg (pitch + Opus) → Ogg file.
async function writeOgg(pcm: Buffer, c: Candidate, path: string): Promise<void> {
  await encodePcm(Readable.from([pcm]), { semitones: c.semitones, extraPitch: c.extraPitch ?? 0, output: path }).done;
}

// Pick reel phrases spread across the whole list, so the reel has callouts, game terms and long lines.
function pickReel(phrases: string[]): number[] {
  if (phrases.length <= REEL_SIZE) return phrases.map((_, i) => i);
  const step = phrases.length / REEL_SIZE;
  return Array.from({ length: REEL_SIZE }, (_, i) => Math.floor(i * step));
}

// --quick: one line per candidate into line/<candidate>.ogg. Much faster than every phrase × variant.
async function renderQuick(candidates: Candidate[], text: string, suffix: string): Promise<void> {
  const dir = join(OUT, 'line');
  await mkdir(dir, { recursive: true });
  const rows = ['candidate,chars,first_audio_ms,total_ms,audio_s'];
  console.log(`Quick render: "${text}"`);
  const failed: string[] = [];
  for (const c of candidates) {
    // One broken voice (e.g. a voice name Kokoro doesn't have) shouldn't stop the rest.
    try {
      const { pcm, firstAudioMs, totalMs } = await synthesizeToBuffer(text, c);
      await writeOgg(pcm, c, join(dir, `${c.name}.ogg`));
      const audioS = pcm.length / (PCM_FORMAT.sampleRate * PCM_FORMAT.bytesPerSample);
      rows.push([c.name, text.length, firstAudioMs.toFixed(0), totalMs.toFixed(0), audioS.toFixed(2)].map(csvField).join(','));
      console.log(`  ${c.name}: kokoro ${totalMs.toFixed(0)} ms`);
    } catch (err) {
      failed.push(c.name);
      console.log(`  ${c.name}: FAILED, skipped. ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (failed.length > 0) {
    console.log(`\n${failed.length} failed: ${failed.join(', ')}`);
    process.exitCode = 1;
  }
  await writeFile(join(OUT, `render-latency-quick${suffix}.csv`), rows.join('\n') + '\n');
  console.log(`\n${candidates.length - failed.length} files → ${dir}/`);
}

async function main(): Promise<void> {
  const arg = (flag: string) => {
    const i = process.argv.indexOf(flag);
    return i === -1 ? undefined : process.argv[i + 1];
  };
  const only = arg('--only');
  const batch = arg('--batch');
  const candidates = CANDIDATES.filter((c) => (only === undefined || c.name === only) && (batch === undefined || String(c.batch) === batch));
  if (candidates.length === 0) throw new Error(`no candidates match. Names: ${CANDIDATES.map((c) => c.name).join(', ')}; batches: ${[...new Set(CANDIDATES.map((c) => c.batch))].join(', ')}`);

  if (!(await kokoro.health())) throw new Error('Kokoro is not reachable. Start the container first.');

  if (process.argv.includes('--quick')) {
    await renderQuick(candidates, arg('--line') ?? QUICK_LINE, only ? `-${only}` : batch ? `-batch${batch}` : '');
    return;
  }

  const phrases = parsePhrases(await readFile('config/phrases.txt', 'utf8'));
  const reelIdx = new Set(pickReel(phrases));
  const silence = Buffer.alloc(Math.round((PCM_FORMAT.sampleRate * REEL_GAP_MS) / 1000) * PCM_FORMAT.bytesPerSample);

  const ratingRows = ['candidate,clip,phrase,variant,clarity_1to5,cute_1to5,rater,notes'];
  const latencyRows = ['candidate,clip,chars,first_audio_ms,total_ms,audio_s'];
  await mkdir(join(OUT, 'reels'), { recursive: true });

  let clipCount = 0;
  const started = performance.now();

  for (const c of candidates) {
    const dir = join(OUT, 'clips', c.name);
    await mkdir(dir, { recursive: true });
    const reel: Buffer[] = [];
    const extra = c.extraPitch ? ` +${c.extraPitch} st extra pitch,` : '';
    console.log(`\n${c.name}: ${c.voice}, ${c.semitones >= 0 ? '+' : ''}${c.semitones} st,${extra} speed ${c.speed}${c.langCode ? `, lang ${c.langCode}` : ''}`);

    for (const [i, phrase] of phrases.entries()) {
      for (const v of variantsFor(phrase)) {
        const name = clipName(i, phrase, v.id === 'plain' ? '' : `-${v.id}`);
        const { pcm, firstAudioMs, totalMs } = await synthesizeToBuffer(v.text, c);
        await writeOgg(pcm, c, join(dir, `${name}.ogg`));
        clipCount++;

        const audioS = pcm.length / (PCM_FORMAT.sampleRate * PCM_FORMAT.bytesPerSample);
        ratingRows.push([c.name, name, v.text, v.id, '', '', '', ''].map(csvField).join(','));
        latencyRows.push([c.name, name, v.text.length, firstAudioMs.toFixed(0), totalMs.toFixed(0), audioS.toFixed(2)].map(csvField).join(','));
        if (v.id === 'plain' && reelIdx.has(i)) reel.push(pcm, silence);
      }
      process.stdout.write('.');
    }

    await writeOgg(Buffer.concat(reel), c, join(OUT, 'reels', `${c.name}.ogg`));
  }

  // When rendering one candidate, don't overwrite the full template/latency files.
  const suffix = only ? `-${only}` : batch ? `-batch${batch}` : '';
  await writeFile(join(OUT, `ratings-template${suffix}.csv`), ratingRows.join('\n') + '\n');
  await writeFile(join(OUT, `render-latency${suffix}.csv`), latencyRows.join('\n') + '\n');

  const secs = ((performance.now() - started) / 1000).toFixed(1);
  console.log(`\n\n${clipCount} clips + ${candidates.length} reels in ${secs} s → ${OUT}/`);
  console.log(`Start with the reels in ${OUT}/reels/, then fill in ratings (see ${OUT}/README.md).`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
