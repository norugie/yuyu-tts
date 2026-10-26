# PROGRESS — YuyuTTS

Update this at the end of every session so the next one can pick up cleanly. Newest entry on top.

## Current state

- Phase: 2 (TTS spike)
- Engine: Kokoro only (RVC spike dropped 2026-10-26)
- Next task: pick from batch 1/4 Kokoro voices, then 2.7 (audition with the friend)

## Log

<!-- Copy this block for each session:
### YYYY-MM-DD
- **Done:**
- **Broke (and why):**
- **Next:**
-->

### 2026-10-26 (RVC removed)
- **Decision:** Youmu sticks with Kokoro only. All RVC code removed from the working tree: `src/tts/rvc.ts`, `tests/tts/rvc.test.ts`, `docker/rvc.Dockerfile`, the WAV input mode in `src/tts/audio.ts` (+ its test), RVC handling in `spikes/render-presets.ts`, batch 3 in `spikes/candidates.ts`, the batch 3 section of `evals/voice-quality/README.md`, the `models/rvc` lines in `.gitignore`. Entries below are kept as history.
- **Remaining voices:** batch 1 (sakura, momo, yuzu) and batch 4 (9 teen-ish blends). `npm run render -- --quick` renders one line each.
- **Next:** Youmu picks favourites, then task 2.7.

### 2026-10-25 (voices, batch 3: Kokoro + RVC spike)
- **Decision:** Youmu stays with Kokoro and removed batch 2. Youmu wants to drop the no-cloned-voices rule. Claude only uses voices whose owners released them for voice-model use, and CLAUDE.md is unchanged for now. Youmu picked a spike: Kokoro (English) → RVC voice conversion with **Amitaro** (はきはき, るんるん, ささやき) and **Tsukuyomi-chan** official RVC models. Research: `/mnt/project-files/yuyutts-docs/voice-conversion-options.md`.
- **Done (written, unverified on Youmu's PC):** `docker/rvc.Dockerfile` (rvc-python 0.1.5, torch 2.1.1+cu118, base models baked in, pip<24.1 for fairseq's old deps); `src/tts/rvc.ts` (client + `pcmToWav`); ffmpeg `input: 'wav'`; 8 batch-3 candidates (af_bella/af_heart × 4 RVC voices, RVC pitch +3); render records `rvc_ms` per clip; `models/rvc/README.md` with downloads, folder names, terms and credit lines; `models/**` gitignored (Amitaro forbids redistributing models).
- **Checked in sandbox:** typecheck, 28 unit tests, ffmpeg tests, batch-3 render against fake Kokoro + fake RVC. Could NOT build the RVC image here (no access to Docker Hub, PyTorch or Hugging Face downloads from the sandbox), so the first build on Youmu's PC is the real test.
- **Known limits:** the RVC server holds one model at a time (fine for rendering; the bot would need one server per voice or model switching). rvc-python assumes v2 models.
- **Next:** Youmu downloads models, builds and runs the RVC container, renders batch 3, listens. Then latency from `render-latency-batch3.csv`.
- Update (08:05): docker fix (PyPI as extra index, numpy<2); Tsukuyomi files renamed (normal-1 used, others in models/rvc-extra/). First render (bella/heart, RVC +3) stopped by Youmu and deleted. Batch 3 is now sakura/yuzu/momo bases × hakihaki/runrun/sasayaki/tsukuyomi at RVC +1, +0 st (12 candidates). Note: rvc-python truncates RVC pitch to whole numbers.
- Update (08:16): render too slow, so added `npm run render -- --quick` (one line per voice → evals/voice-quality/line/). Batch 1 trimmed to sakura/momo/yuzu. Batch 3 = base (af_bella) + sakura/yuzu/momo × hakihaki/runrun/sasayaki/tsukuyomi, all RVC +0 (16 candidates).
- Update (08:25): Youmu kept sasayaki + tsukuyomi only (base + sakura/yuzu/momo mixes, 8 RVC candidates + 3 plain). hakihaki/runrun models, renders deleted.
- Update (08:43): added amitaro-yofukashi, amitaro-nonbiri and Tsukuyomi normal-2/normal-3/strong/weak (each its own folder; the server uses the first .pth per folder). sakura/yuzu/momo mixes for each, RVC +0...
- Update (08:50): first quick render. RVC time for the line: Tsukuyomi ~0.5 s (no .index), Amitaro 1.2–1.7 s (has a large .index; first one 3.5 s incl. warm-up). nonbiri is an RVC v1 model and failed to load; Dockerfile now patches rvc-python to read the version from the model file. Quick render skips failing voices instead of stopping.
- Update (09:20): nonbiri deleted (model + renders). Batch 4 = 9 plain-Kokoro "teenage girl" candidates (blends incl. af_sky/nova/kore/aoede/jessica, +2 to +4 st, speed 1.05–1.1).

### 2026-10-25 (voices, batch 2)
- **Feedback:** Youmu listened to the batch-1 reels and liked none: too adult and natural. Wants younger, cuter, anime-style voices. Batch-1 clips kept for comparison.
- **Done:** Batch 2 (8 candidates, `--batch 2`): formants raised via asetrate (+2 to +6 st, sounds smaller/younger) plus extra pitch via ffmpeg `rubberband` with formants preserved (+2 to +4 st), speed 1.05–1.1. Three use Japanese voices (jf_alpha, jf_nezumi) reading English via `lang_code: "a"` for an anime-style accent. Code: `buildVoiceFilter` + `extraPitch` in `src/tts/audio.ts`, `langCode` in `src/tts/kokoro.ts`, `--batch` in the render script. Checked in sandbox: 26 unit tests; +3 st formant +3 st extra on a 440 Hz tone measured 622 Hz (expected 622); batch-2 render against fake Kokoro (640 clips).
- **Not yet verified:** Kokoro accepting `lang_code: "a"` with a jf_ voice; Youmu's ffmpeg build including rubberband.
- **If batch 2 still isn't cute enough:** Kokoro's English voices are adult women, so DSP has limits. Next would be a different engine (VOICEVOX: Japanese only, needs credits; or a Style-Bert-VITS2 English model with a clear license). That's an architecture change, so it needs Youmu's decision.

### 2026-10-25 (tasks 2.4–2.6, pre-approved by Youmu)
- **Done (written, verification pending on Youmu's PC):**
  - 2.4 `src/tts/audio.ts`: `buildPitchFilter` (asetrate/aresample/atempo, ±12 st), `buildFfmpegArgs` (PCM 24 kHz mono → Ogg Opus 48 kHz stereo, 64 kbit/s, 20 ms frames and pages), `encodePcm` (spawns ffmpeg). Unit tests + `tests/tts/audio.int.ts` (needs ffmpeg).
  - 2.5 `spikes/render-presets.ts` (`npm run render`): 7 candidates (`spikes/candidates.ts`) × 38 phrases, with "!"/"." variants for short phrases → 80 clips per candidate + one reel each. Also writes `ratings-template.csv` and `render-latency.csv` (Kokoro time to first audio per clip).
  - 2.6 `evals/voice-quality/` (`npm run eval:voices`): CSV ratings → averages per candidate / variant / rater, ✓ at clarity ≥ 4. README with the rating workflow.
- **Checked in Claude's sandbox:** typecheck, 23 unit tests, ffmpeg integration tests; +3 st on a 440 Hz tone measured 522 Hz (expected 523), duration unchanged; full render against a fake Kokoro (560 clips, 4.5 MB).
- **Broke (and why):** First draft of the ±2 st test expectations had hand-calculated numbers that were wrong; the code was right. asetrate now rounds to whole Hz.
- **Next:** Youmu installs ffmpeg, runs the checks, renders the clips; then 2.7.

### 2026-10-25 (task 2.2)
- **Done:** Task 2.2 Kokoro client: `src/tts/kokoro.ts` (`synthesize` → streamed raw PCM 24 kHz mono 16-bit as a Node `Readable`, `listVoices` with grades, `health`), unit tests (`npm test`), integration tests against the container (`npm run test:int`). Removed the hello placeholder. Verified by Youmu: typecheck, unit and integration tests pass.
- **Broke (and why):** Nothing.
- **Measured:** first audio after **212 ms** for "Left door! Need heals." (1.72 s of audio, af_bella, GPU, warm container). The blend test took 77 ms end to end. This is Kokoro alone, not the full Discord path. It leaves about 790 ms of the 1 s p95 budget for ffmpeg, the queue and voice.
- **Also done:** Task 2.3 phrase list: `config/phrases.txt`, 38 phrases (general, Helldivers 2, Lethal Company, plus 6 longer chat sentences because the group mostly types full sentences). Approved by Youmu.
- **Next:** Task 2.4, ffmpeg pitch filter.

### 2026-10-25 (phase 0, task 2.1)
- **Done:** Phase 0 environment signed off by Youmu (driver, WSL2, Docker Desktop, GPU in Docker, Kokoro v0.9.0 on GPU, Node 24.18). Phase 1 docs committed. Task 2.1 project skeleton: `package.json`, `tsconfig.json` (strict, `noEmit`, `erasableSyntaxOnly`), `.gitignore`, `.env.example`, placeholder test (removed in 2.2). Verified by Youmu: `npm test` passes, `npm run typecheck` passes.
- **Broke (and why):** Nothing.
- **Next:** Task 2.2, Kokoro client.

## Environment notes (from phase 0)

- `nvidia-smi` driver / CUDA version: (Youmu to fill in)
- WSL2: Ubuntu, VERSION 2. Kokoro v0.9.0 confirmed on GPU (`docker exec <container> nvidia-smi`).
- Node: v24.18.
- Kokoro health check path: `/health`
- `/v1/audio/speech` fields: `model`, `input`, `voice`, `response_format`, `download_format`, `speed`, `stream` (default `true`), `return_download_link`, `return_timing`, `lang_code`, `volume_multiplier`, `voice_aliases`, `allow_voice_tags`, `ssml`, `normalization_options` { `normalize`, `unit_normalization` (off), `url_normalization`, `email_normalization`, `optional_pluralization_normalization`, `phone_normalization`, `caps_normalization`, `replace_remaining_symbols`, `remove_emoji` (off) }. Defaults are on unless marked off.
