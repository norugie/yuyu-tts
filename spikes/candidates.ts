// Candidate voice presets for the phase-2 audition (tasks 2.5 and 2.7).
// Names are placeholders; final names and values go to config/presets.json in task 2.7.
// Base voices are Kokoro-82M built-ins (Apache-2.0).
// Blend syntax "a(2)+b(1)" = 67% a, 33% b (Kokoro-FastAPI normalizes the weights).
//
// Quick check, one line per voice:  npm run render -- --quick
// Render one batch:  npm run render -- --batch 4
// Render one voice:  npm run render -- --only sakura

export type Candidate = {
  name: string;
  // Which audition round the candidate came from. Batches 2 and 3 were removed (see the notes in the list).
  batch: 1 | 2 | 3 | 4;
  voice: string;
  // Pitch AND formants, via ffmpeg asetrate. Higher sounds like a smaller person. See src/tts/audio.ts.
  semitones: number;
  // Extra pitch only, formants kept (ffmpeg rubberband). 0 = off.
  extraPitch?: number;
  // Kokoro speaking rate. 1 = normal.
  speed: number;
  // Kokoro language rules. "a" lets a Japanese voice (jf_) read English, with a Japanese accent.
  langCode?: string;
  why: string;
};

const BATCH_1: Candidate[] = [
  // Batch 1: natural voices with light pitch shifts. Youmu's verdict (2026-10-25): too adult, not cute enough.
  // Kept: Youmu's favourites (sakura, momo, yuzu). Removed 08:16: baseline, hoshi, kiki, mochi.
  { batch: 1, name: 'sakura', voice: 'af_bella(2)+af_sky(1)', semitones: 2, speed: 1.05, why: 'Bella clarity with some of Sky\'s lighter tone.' },
  { batch: 1, name: 'momo', voice: 'af_heart', semitones: 2, speed: 1.0, why: 'Heart is the top-graded voice (A).' },
  { batch: 1, name: 'yuzu', voice: 'af_nicole(1)+af_bella(1)', semitones: 3, speed: 1.05, why: 'Soft and breathy, a bit higher.' },
];

export const CANDIDATES: Candidate[] = [
  ...BATCH_1,

  // Batch 2 (pip, nyan, kohaku, lumi, chibi, usagi, nezu, mikan) was tried on 2026-10-25 and removed:
  // formant shift + rubberband pitch + Japanese voices still did not sound young or anime enough.

  // Batch 3 (2026-10-25): Kokoro → RVC voice conversion with owner-released anime voices (Amitaro,
  // Tsukuyomi-chan). Removed 2026-10-26: Youmu decided to stick with Kokoro only.

  // Batch 4 (09:18): plain Kokoro again, aiming for a teenage girl. Builds on what Youmu liked in batch 1
  // (sakura, yuzu, momo): blends of the clearest female voices, a bit lighter (af_sky, af_nova, af_kore,
  // af_aoede), +2 to +4 st (pitch and formants, so "a bit smaller"), slightly quicker speech.
  // Kept modest on purpose: batch 2's big formant/rubberband shifts sounded artificial.
  { batch: 4, name: 'sakura-teen', voice: 'af_bella(2)+af_sky(1)', semitones: 3.5, speed: 1.08, why: 'Sakura, a step younger: higher and a little quicker.' },
  { batch: 4, name: 'momo-teen', voice: 'af_heart(2)+af_sky(1)', semitones: 3, speed: 1.05, why: 'Momo lightened with some Sky.' },
  { batch: 4, name: 'yuzu-teen', voice: 'af_nicole(1)+af_bella(1)+af_heart(1)', semitones: 3.5, speed: 1.05, why: 'Yuzu\'s breathiness with Heart\'s clarity.' },
  { batch: 4, name: 'hana', voice: 'af_bella(2)+af_kore(1)', semitones: 3, speed: 1.05, why: 'Bella with Kore\'s brighter tone.' },
  { batch: 4, name: 'nana', voice: 'af_heart(2)+af_aoede(1)', semitones: 2, extraPitch: 1, speed: 1.05, why: 'Soft Heart/Aoede mix; pitch up more than formants for a lighter, still natural voice.' },
  { batch: 4, name: 'mimi', voice: 'af_nova(1)+af_bella(1)', semitones: 3, speed: 1.1, why: 'Nova is light and youthful; Bella keeps it clear.' },
  { batch: 4, name: 'suzu', voice: 'af_sky(1)+af_nicole(1)', semitones: 2.5, speed: 1.05, why: 'Lightest, breathy pair, only a small shift.' },
  { batch: 4, name: 'ichigo', voice: 'af_jessica(1)+af_heart(1)', semitones: 3, speed: 1.08, why: 'Jessica\'s energy with Heart\'s warmth.' },
  { batch: 4, name: 'riri', voice: 'af_heart(1)+af_sky(1)+af_nova(1)', semitones: 4, speed: 1.08, why: 'Three light voices, the highest of the batch.' },
];

