# PROGRESS — YuyuTTS

Update this at the end of every session so the next one can pick up cleanly. Newest entry on top.

## Current state

- Phase: 3–4 done and verified by Youmu in Docker and Discord (2026-11-01)
- Engine: Kokoro only (RVC spike dropped 2026-10-26)
- Phase 5: code done (2026-11-01 night), waiting for Youmu's Discord check (list in the phase 5 entry)
- Phase R (reliability and hardening, PRD F10): R.1–R.5 done and verified by Youmu in Docker and Discord (2026-11-02)

## Log

<!-- Copy this block for each session:
### YYYY-MM-DD
- **Done:**
- **Broke (and why):**
- **Next:**
-->

### 2026-11-02 (phase R: reliability and hardening)
- **Why:** performance and security review (https://claude.ai/artifact/7NW4zFJK9F1VW2mNf8MWX1). Youmu picked findings 1–3, 4, 6, 7, Kokoro warm-up, preview cooldown and a bot healthcheck; `npm audit --omit=dev` found 0 vulnerabilities. Added as PRD F10 (AC10.1–AC10.10) and TASKS phase R; plan approved.
- **Done:** voice connection `error` listener (`watchConnection`, `src/voice/connection.ts`); Kokoro speech request gives up after 5 s with no response, timer cleared once headers arrive (`src/tts/kokoro.ts`); playback stops if audio hasn't started in 10 s (`playToEnd`) or runs past 90 s (`playTimeoutMs` in `src/voice/queue.ts`); new `src/health.ts` (crash handlers: log unhandled rejections, log + exit(1) on uncaught exceptions; heartbeat file `/tmp/yuyu-heartbeat` every 30 s while logged in); message handler checks channel and opt-in before normalizing, and each server's dictionary + regex is cached until `/dict` changes (`createDictionaryCache`; `decideSpeak` no longer takes the text, `decideText` does the empty check); `allowedMentions: { parse: [] }`; compose: log rotation (10 MB × 3) for both containers, bot `no-new-privileges`, `cap_drop: ALL`, `read_only` + `tmpfs /tmp`, healthcheck on the heartbeat age; warm-up clip per preset at startup in the background (`warmUp`, logs `warmup_ms`); preview cooldown 5 s per person.
- **Checked in the sandbox:** `tsc` clean; 171 unit tests pass (26 new); speech/audio integration tests pass; the bot starts, logs, and exits cleanly when it can't log in. Kokoro-only integration tests need the real Kokoro (not run).
- **Learned:** Node holds HTTP response headers until the first body byte unless the server flushes them, so the 5 s Kokoro timer really means "no headers or first audio within 5 s".
- **Youmu's checks:**
  1. `npm test` and `npm run typecheck`.
  2. `docker compose up -d --build`, then `docker compose ps`: kokoro healthy, and the bot turns **healthy** within about a minute.
  3. `docker compose logs bot`: three `warm-up done` lines with `warmup_ms` (one per voice), then "logged in".
  4. `docker inspect yuyu-tts-bot-1 --format "{{.HostConfig.ReadonlyRootfs}} {{.HostConfig.CapDrop}} {{.HostConfig.SecurityOpt}} {{.HostConfig.LogConfig}}"` shows `true [ALL] [no-new-privileges:true] {json-file map[max-file:3 max-size:10m]}` (the container name may differ; see `docker compose ps`).
  5. In Discord: `/join`, type a few messages (audio still plays with the read-only container), `/skip`, `/dict add word:pingtest say:@everyone` (reply shows no ping), `/dict remove word:pingtest`.
  6. `/voice` with the bot not in voice: press Preview twice fast; the second says to wait a moment.
  7. Optional: `docker compose stop kokoro`, type a message, and see the bot log an error and keep going instead of going silent; `docker compose start kokoro`.
- **Verified:** Youmu ran all 7 checks; all passed (2026-11-02).
- **Cleanup (R.5):** review https://claude.ai/artifact/B2pVEtumcAC85u9qkJN2ox; Youmu approved items 1–8 and 11. Done: Kokoro's body type is `KokoroSpeechBody` (`buildSpeechBody`), `SpeakItem = SpeechRequest & {...}`; `speechFor()` in `src/tts/speech.ts` used by messages, previews and warm-up (warm-up now goes through `resolveVoice`); removed `langCode` (unused since batch 2) and the `numberLetters` re-export; `settings.getMember()` replaces `isOptedIn` + `getSpokenName`; `NOT_IN_VOICE` replaces `joinError()`; `Sessions.leave()` returns nothing; `ProblemsError` base class in `src/config.ts` for Config/Preset/Dictionary errors (same messages); `FFMPEG_PATH` read in `config.ts` (`config.ffmpegPath`, also in `.env.example`) and passed to `encodePcm` as `ffmpegPath` (spikes and the audio int test pass the env var themselves). Checked in the sandbox: `tsc` clean, 170 unit tests (one `lang_code` test removed), speech/audio int tests, bot starts.
- **Youmu's check:** `npm test`, `npm run typecheck`, `docker compose up -d --build`, one message and one `/voice` preview in Discord. All good (2026-11-02).
- **Next:** Youmu's phase 5 checks; then phase 6.

### 2026-11-01 (phase 5: normalization, dictionary, prefix sentence)
- **Plan:** https://claude.ai/artifact/VTnYfWuioV7ENTtZiBX9qp. Youmu's calls: dictionary keeps only gg, brb, omw, ty, np, lol ("L O L"); intonation gets only the cheap fix (prefix as its own sentence); new rule 0 as o and 3 as e ("kn0wy" → "knowy"). Not answered, so Claude's suggestions were used: ALL CAPS lowercased (4+ letters), anyone can edit /dict, "!!!!" → "!" and "?!" kept.
- **Intonation finding:** our code never stripped "?" or "!". Kokoro has no emotion control and reacts only mildly to punctuation; "X says, are you coming?" made the question part of a statement sentence. Now "X says. Are you coming?".
- **Done:** E3 table in `tests/text/normalize.test.ts` (emoji runs, repeats, caps, 0/3 letters, dictionary); `src/text/dictionary.ts` (load/validate, merge server changes, whole-word replace), `src/text/letters.ts`, `config/dictionary.json`; `/dict add|remove|list` (`src/discord/commands/dict.ts`, uses the existing `dictionary` table: spoken '' = starter word switched off for that server). Dictionary words are cleaned with the 0/3 rule too, so a `/dict` entry for "kn0wy" matches.
- **Checked in the sandbox:** `tsc` clean, 145 unit tests, speech/audio integration tests. On Youmu's PC (Linux check VM): all test files pass except `commands.test.ts`, which can't load there because node_modules has the Windows build of @snazzah/davey (environment only).
- **Youmu's checks:** `npm test`; `docker compose up -d --build`; in Discord: (1) "are you coming?" and "run!" after a speaker change: hear "Name says." then the question; (2) "kn0wy", "OMW", "gg", "lol", "noooooo!!!!"; (3) `/dict add word:kn0wy say:oh they know`, type it, `/dict list`, `/dict remove word:kn0wy`; (4) `/dict remove word:lol`, then "lol" is read as written.
- **Added:** "nyeh" → "knee-yeh" and "hmeh" → "hih-meh" as default words. Checked with misaki + espeak-ng in the sandbox (the G2P Kokoro uses): before, nyeh = nˈIA ("nigh-ah"), hmeh = ˈAʧmˈA ("aitch-may"); after, nˌijˈɛ and hˈɪmˈɛ. Youmu to confirm by ear. Tip for new words: respell with common English syllables joined by hyphens.
- **Added (22:40):** emoji entries in `/dict` (match even glued to words, with or without U+FE0F) and tilde handling ("~50" → "about 50", other "~" dropped; misaki read "hello~" as "hello tilde"). Playful tilde skipped: Kokoro has no mood control, Youmu OK'd. 154 unit tests pass in the sandbox. Checks: `/dict add word:🍥 say:fishcake` then type "yum🍥"; type "see you~!".
- **Next:** Youmu's checks; phase 6 after Youmu's go-ahead.

### 2026-11-01 (phases 3–4: bot core, presets and settings)
- **Approval:** Youmu filled in `.env` (token, client id, test server id), added the bot to a test server, and pre-approved working through phase 4 overnight. Decided earlier the same day: `DISCORD_GUILD_ID` optional (set = test server commands, empty = global), Public Bot off, `/tts on` per server, voice/speed/pitch shared across servers.
- **Done (code + tests):** `src/config.ts`, `src/log.ts`, `src/store/db.ts` + `settings.ts` (better-sqlite3, migrations), `src/tts/presets.ts` (validate + resolve user voice), `src/tts/speech.ts` (Kokoro → ffmpeg → Ogg Opus), `src/text/normalize.ts` (basic: mentions, custom emoji, URLs, code blocks, spoilers, markdown, length cap), `src/discord/onMessage.ts` (speak-or-not + name prefix), `src/voice/queue.ts`, `src/voice/connection.ts` (join/leave, DAVE via @discordjs/voice, auto-leave after 2 min alone, reconnect on blips), `src/discord/commands/*` (join, leave, tts, skip, queue, channel, voice, speed, pitch, settings), `src/discord/interactions.ts`, `messages.ts`, `registerCommands.ts`, `src/index.ts`, `docker/bot.Dockerfile`, `.dockerignore`, `compose.yaml`. `encodePcm` gained `kill()` for /skip.
- **Dependencies added:** discord.js 14.27.0 (pinned; 14.28 was only 2 days old), @discordjs/voice 0.19.2, better-sqlite3 ^13.0.3 (ships prebuilt binaries for Windows and Linux, so no compiler), @types/better-sqlite3 (dev).
- **Checked in the sandbox (Node 22, no Docker, no Discord):** `tsc` clean; 85 unit tests pass; `tests/tts/speech.int.ts` (fake Kokoro + real ffmpeg → Ogg demuxed into ~50 Opus packets per second, cancel works); a clean `npm ci --omit=dev` copy of src+config starts, logs the dependency report (DAVE: @snazzah/davey 0.1.12; aes-256-gcm native) and stops cleanly when login fails. NOT checked: the Docker build, a real Discord login, real voice playback.
- **Small deviations from the PRD wording:** `/skip all` is `/skip all:True` and `/settings reset` is `/settings reset:True` (Discord can't have both a plain command and subcommands with the same name). Commands register automatically on startup; `npm run register` also exists. `/speed` multiplies the preset's speed (1 = as the preset is); `/pitch` adds semitones to the preset's pitch.
- **Youmu's check list (for the ⏳ tasks):**
  1. `npm install`, then `npm test` and `npm run typecheck`.
  2. Stop the old standalone Kokoro container (Docker Desktop → Containers → kokoro → Stop), because compose starts its own on port 8880.
  3. `docker compose up -d --build`, then `docker compose ps` (both healthy) and `docker compose logs bot` (look for "voice dependency report" with @snazzah/davey, "logged in", "registered commands for the test server"). [3.3, 3.4, AC1.5]
  4. In the test server: join a voice channel, `/join` (AC1.1), `/tts on`, type in the voice channel's chat and hear it (AC2.2; note `latency_ms` in the bot log). [3.10]
  5. Type three messages fast (in order), then `/skip` mid-message (AC4.1), `/skip all:True`, `/queue mode:newest`. [3.11]
  6. Second person (or alt) with `/tts on` talks: the name prefix appears on speaker change (AC2.6); `/channel set` a text channel, then `/channel reset`. [3.12]
  7. `/voice`: press a preview button, pick Ichigo, type again; `/speed value:1.3`, `/pitch value:2`, `/settings`, `/settings reset:True`. Try a preview while the bot is not in voice (it should send a file). [4.2, 4.3]
  8. `docker compose restart bot`, then `/settings`: settings are still there. [3.7]
  9. `/leave` (AC1.3); and once, leave the bot alone in a call for 2 minutes (AC1.4). [3.5, 3.6]
- **Update (evening):** Docker build failed compiling better-sqlite3 (no Python in the image). Fixed with `npm ci --ignore-scripts` + `.npmrc` (`ignore-scripts=true`): its prebuilt binaries load without compiling. Youmu asked for the prefix "Mika says, ..." and a nickname option: `/tts on name:<nickname>` (per server, kept after `/tts off`, plain `/tts on` keeps the old one; DB migration 2 adds `guild_opt_in.spoken_name`). 89 unit tests pass.
- **Bug (evening):** with one speaker, "says" never appeared, because on-change skipped the first message after /join. Fixed: the first message after joining is prefixed too. Added `/prefix mode:always|on-change|never` (AC2.6 said configurable, but there was no command yet).
- **Bug (night):** messages sent while the bot was already reading were never heard. Cause: the queue prepares the next message during playback; ffmpeg finished before anyone read its output, and Node discards a child process's unread stdout when it exits, so the queued message played as 100 ms of silence. Fixed in `encodePcm` (`src/tts/audio.ts`): ffmpeg's stdout is piped straight into a 4 MB buffer. Regression test in `tests/tts/speech.int.ts` (fails with 0 packets on the old code). Also checked with a real @discordjs/voice player: 3 overlapping 1 s messages each play ~1.1 s. Youmu retests check 5.
- **Verified (night):** Youmu ran the Docker and Discord checks; all ⏳ tasks in phases 3–4 are now ✅.
- **Next:** phase 5, planned first; code only after Youmu approves the plan.

### 2026-11-01 (task 2.7, voice pick)
- **Decision:** Youmu keeps three voices for now: Yuzu (batch 1: af_nicole+af_bella, +3 st, speed 1.05), Ichigo (batch 4: af_jessica+af_heart, +3, 1.08), Suzu (batch 4: af_sky+af_nicole, +2.5, 1.05). Default: Yuzu (placeholder, Youmu to confirm).
- **Done:** `config/presets.json` written (id → name, voice/blend, pitch in semitones via asetrate, extraPitch via rubberband, speed). Validated as JSON only; the loader/validator is task 4.1.
- **Closed 2.7 with Youmu's calls:** listening was enough (E2 ratings waived); PRD AC5.1 changed to 3 presets for now; asetrate vs rubberband comparison skipped (happy with the sound). Default Yuzu confirmed (no objection).
- **Next:** phase 3, only after Youmu's go-ahead.

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
