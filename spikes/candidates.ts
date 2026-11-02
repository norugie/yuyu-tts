// Candidate voice presets to audition with the render script. Base voices are Kokoro-82M built-ins (Apache-2.0).
// Names are placeholders; final names and values go to config/presets.json.
// Blend syntax "a(2)+b(1)" = 67% a, 33% b (Kokoro-FastAPI normalizes the weights).
//
// Quick check, one line per voice:  npm run render -- --quick
// Render one batch:  npm run render -- --batch 4
// Render one voice:  npm run render -- --only sakura

export type Candidate = {
  name: string;
  // Which audition round the candidate came from.
  batch: 1 | 2 | 3 | 4;
  voice: string;
  // Pitch AND formants, via ffmpeg asetrate.
  semitones: number;
  // Extra pitch only, formants kept (ffmpeg rubberband). 0 = off.
  extraPitch?: number;
  speed: number;
  why: string;
};

const BATCH_1: Candidate[] = [
  // Batch 1: natural voices with light pitch shifts.
  { batch: 1, name: 'sakura', voice: 'af_bella(2)+af_sky(1)', semitones: 2, speed: 1.05, why: 'Bella clarity with some of Sky\'s lighter tone.' },
  { batch: 1, name: 'momo', voice: 'af_heart', semitones: 2, speed: 1.0, why: 'Heart is the top-graded voice (A).' },
  { batch: 1, name: 'yuzu', voice: 'af_nicole(1)+af_bella(1)', semitones: 3, speed: 1.05, why: 'Soft and breathy, a bit higher.' },
];

export const CANDIDATES: Candidate[] = [
  ...BATCH_1,

  // Batches 2 (big formant/rubberband shifts) and 3 (Kokoro → RVC) were tried and removed.


  // Batch 4: plain Kokoro blends aiming for a teenage girl, +2 to +4 st, slightly quicker speech.
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

