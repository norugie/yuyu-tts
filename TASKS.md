# TASKS — YuyuTTS

Status: **approved** · Last updated: 2026-10-25

How to use this file:
- Work on **one task at a time**, top to bottom, following the loop in `CLAUDE.md`.
- Each task names the PRD criteria (AC) or evals (E) it covers and **how it's verified**. A task is done only when its "Verify" step has been run and shown.
- Tick the box when done, and note it in `PROGRESS.md`.
- New ideas go to the "Later" list at the bottom, not into the current task.
- 🧑‍🎓 marks tasks where Claude asks whether Youmu wants to write it (skeleton + description) or wants the full implementation.

---

## Phase 0 — Environment (Windows)

Youmu runs these by hand. Claude doesn't build anything until Youmu has finished and signed off this phase. Commands are for **PowerShell**. "Admin PowerShell" means right-click → *Run as administrator*.

| Step | Why it's needed |
|---|---|
| 0.1 NVIDIA driver | Lets Windows (and therefore WSL2 and Docker) use the RTX 4070. Kokoro's image is built for CUDA 12.6, which needs driver 560+. |
| 0.2 WSL2 | Docker Desktop runs Linux containers inside WSL2, and WSL2 is how containers reach the GPU on Windows. |
| 0.3 Docker Desktop | Runs both containers (Kokoro and, later, the bot) with one `docker compose` command. |
| 0.4 GPU in Docker | Proves the driver → WSL2 → Docker chain works before adding Kokoro on top, so a failure points at one layer. |
| 0.5 Kokoro test | Proves TTS works on the GPU and lets you hear the voices before any bot code exists. |
| 0.6 Unknowns | Two API details I couldn't confirm from docs alone; the running container's own API page is the source of truth. |
| 0.7 Node 24 | Local tests and type checks. The bot itself runs Node inside Docker, so this is only for development. |

### 0.1 NVIDIA driver
- [x] Install the latest **Game Ready** or **Studio** driver for the RTX 4070 from nvidia.com/drivers (or the NVIDIA app). A separate CUDA toolkit is **not** needed.
- [x] Reboot.
- **Verify:** `nvidia-smi` shows the RTX 4070, a driver version of **560 or newer**, and "CUDA Version: 12.6" or higher in the top-right.

### 0.2 WSL2
- [x] In admin PowerShell: `wsl --install`, then reboot. This installs WSL2 and Ubuntu.
- [x] Open Ubuntu once from the Start menu and create a Linux user.
- [x] `wsl --update`
- **Verify:** `wsl -l -v` lists Ubuntu with **VERSION 2**.
- ⚠️ Don't install an NVIDIA driver *inside* Ubuntu. The Windows driver from 0.1 already gives WSL GPU access.

### 0.3 Docker Desktop
- [x] Install Docker Desktop for Windows from docker.com. When asked, keep **"Use WSL 2 instead of Hyper-V"** ticked.
- [x] Start Docker Desktop. In *Settings → General*, confirm "Use the WSL 2 based engine" is on.
- **Verify:** `docker version` shows both Client and Server, and `docker compose version` prints a version.

### 0.4 GPU inside Docker
- [x] `docker run --rm --gpus all nvidia/cuda:12.6.3-base-ubuntu24.04 nvidia-smi`
- **Verify:** the output shows the RTX 4070, the same as 0.1. If it says "could not select device driver", recheck 0.1 and restart Docker Desktop.

### 0.5 Kokoro test
- [x] `docker run --rm --gpus all -p 8880:8880 ghcr.io/remsky/kokoro-fastapi-gpu:v0.9.0`. The first start downloads a large image; wait for the log to say the server is up.
- [x] In a **second** PowerShell window:
  ```powershell
  Invoke-WebRequest -Method Post -Uri http://localhost:8880/v1/audio/speech `
    -ContentType 'application/json' `
    -Body '{"model":"kokoro","input":"Hello! This is Yuyu speaking.","voice":"af_bella","response_format":"mp3"}' `
    -OutFile hello.mp3
  ```
- [x] Play `hello.mp3`.
- [x] Open http://localhost:8880/web and try a blend such as `af_bella+af_sky`.
- **Verify:** `hello.mp3` plays clearly; the Kokoro log mentions CUDA/GPU, not CPU; `nvidia-smi` shows VRAM in use while it runs.

### 0.6 Fill in the unknowns
- [x] Open http://localhost:8880/docs (Kokoro's API page). Write down in `PROGRESS.md`: the **health check path**, and the exact fields `/v1/audio/speech` accepts (especially `stream`, `normalization_options`, `lang_code`).
- **Verify:** those answers are in `PROGRESS.md`; ARCHITECTURE section 10 is updated.

### 0.7 Node for local dev
- [x] Check what you have: `node -v` and `npm -v`. If it's already `v24.x`, skip to Verify.
- [x] Otherwise install **Node.js 24 LTS** from nodejs.org (the Windows installer replaces the old version), or use a version manager like `fnm` if you want to switch versions per project. npm comes with Node, so it updates too.
- [x] Open a **new** PowerShell window so it picks up the new version.
- **Verify:** `node -v` prints `v24.x`, and `npm -v` prints 11.x or newer.

### 0.8 Sign-off
- [x] Youmu tells Claude phase 0 is done and pastes the `nvidia-smi` line and the 0.6 notes into `PROGRESS.md` (or the chat). Only then does phase 2 start.

---

## Phase 1 — Project docs

- [x] 1.1 `CLAUDE.md` approved
- [x] 1.2 `PRD.md` approved
- [x] 1.3 `ARCHITECTURE.md` approved
- [x] 1.4 `TASKS.md` approved (this file)
- [x] 1.5 `PROGRESS.md` created
- [x] 1.6 Youmu commits and pushes the docs to `main`

---

## Phase 2 — TTS spike (pick the presets)

### 2.1 Project skeleton ✅
`package.json` (type: module, engines node 24), `tsconfig.json` (strict, `noEmit`, `erasableSyntaxOnly`), `.gitignore` (`.env`, `data/`, `node_modules/`), `.env.example`, empty `src/` + `tests/` with one trivial passing test.
- **Verify:** `npm test` passes, `npx tsc --noEmit` passes, and `git status` doesn't show `.env`.

### 2.2 Kokoro client ✅
`src/tts/kokoro.ts`: `synthesize({ text, voice, speed, stream })` → an audio stream; `listVoices()`.
- **Verify:** an integration test against the running container returns non-empty PCM, and `listVoices()` includes `af_bella`.

### 2.3 Phrase list ✅
`config/phrases.txt` from PRD Appendix A, corrected by Youmu and the friend.
- **Verify:** Youmu confirms the list.

### 2.4 ffmpeg pitch filter (pure part) ✅
`src/tts/audio.ts`: `buildFilter({ semitones })` returns the `asetrate/aresample/atempo` string.
- **Verify:** unit tests for 0, +2, and −2 semitones.

### 2.5 🧑‍🎓 Render script ✅
`spikes/render-presets.ts`: for each candidate preset × each phrase, call Kokoro, apply pitch with ffmpeg, and write `evals/voice-quality/clips/<preset>/<phrase>.ogg`. Also render the short-utterance variants from ARCHITECTURE section 3 (plain, "!", ".").
- **Verify:** clip count = presets × phrases × variants, and a few are spot-played.

### 2.6 🧑‍🎓 Voice-quality eval (E2) ✅
`evals/voice-quality/ratings.csv` template (preset, phrase, variant, clarity 1–5, cute 1–5, rater) plus a tiny script that averages ratings per preset.
- **Verify:** the script runs on a sample CSV.

### 2.7 Audition with the friend ✅
- [x] Done 2026-11-01: Youmu picked Yuzu, Ichigo, Suzu by ear; `config/presets.json` written. Youmu waived the E2 clarity ratings (listening was enough) and the asetrate vs rubberband comparison (happy with the sound); PRD AC5.1 changed to 3 presets for now.
The friend and Youmu rate the clips; pick 5–6 presets and names; also compare `asetrate` vs `rubberband` on the top 2 presets.
- **Verify:** `config/presets.json` written; the chosen presets average ≥ 4 clarity (E2); the decision is recorded in `PROGRESS.md`.

---

## Phase 3 — Bot core

All phase 3–4 tasks verified by Youmu in Docker and Discord (2026-11-01).

### 3.1 Discord application (Youmu, by hand) ✅
In the Discord Developer Portal: create an application and a bot, copy the Application ID and token into `.env` (never commit it), turn on the **Message Content** intent, and keep **Public Bot** off. Invite the bot to the server with scopes `bot` + `applications.commands` and permissions View Channel, Send Messages, Read Message History, Connect, Speak.
- **Verify:** the bot shows up (offline) in the server's member list.

### 3.2 Config + logging ✅
`src/config.ts` (validates env, fails fast), `src/log.ts` (JSON lines).
- **Verify:** unit test: a missing `DISCORD_TOKEN` gives a clear error.

### 3.3 Bot container + Compose ✅
`docker/bot.Dockerfile`, `compose.yaml` (kokoro + bot, GPU reservation, healthcheck from 0.6). Startup logs `generateDependencyReport()`.
- **Verify:** `docker compose up` brings both up healthy; the bot logs in; the dependency report lists ffmpeg and `@snazzah/davey`. (AC1.5, part 1)

### 3.4 Slash command registration ✅
`src/discord/registerCommands.ts`: one test server when `DISCORD_GUILD_ID` is set, otherwise global. Start with `/join` and `/leave` only.
- **Verify:** the commands appear in Discord.

### 3.5 Join and leave ✅
`src/voice/connection.ts`.
- **Verify:** AC1.1, AC1.3, and AC1.5 checked manually in a real call; AC1.2 unit test.

### 3.6 Auto-leave when alone ✅
- **Verify:** AC1.4, manually (leave the bot alone for 2 min).

### 3.7 Settings DB ✅
`src/store/db.ts` + `settings.ts` with migrations, plus `/tts on|off` (per server).
- **Verify:** AC2.1 unit tests (using a temp DB file); the setting survives a container restart.

### 3.8 Message filter ✅
`src/discord/onMessage.ts` as a pure decision function: speak or not, and why.
- **Verify:** AC2.3, AC2.4, AC2.5, and AC2.7 (channel choice) unit tests.

### 3.9 Queue ✅
`src/voice/queue.ts`: in-order, newest, max size, error skip, prefetch next.
- **Verify:** AC3.1–AC3.4 unit tests with a fake player and fake TTS.

### 3.10 End-to-end speak ✅
Wire filter → (basic) normalize → Kokoro → ffmpeg → player, with the default preset.
- **Verify:** AC2.2 manually: the friend types in the VC chat and everyone hears it. Note the rough latency from the logs.

### 3.11 Skip and queue mode ✅
`/skip`, `/skip all`, `/queue mode:`.
- **Verify:** AC4.1 manually; AC4.2 and AC3.5 unit tests.

### 3.12 Name prefix + `/channel` ✅
Prefix reads "Mika says, ..."; `/tts on name:` sets a per-server nickname (Youmu, 2026-11-01).
- **Verify:** AC2.6 and AC2.7 unit tests, plus a manual check with two speakers.

---

## Phase 4 — Presets and settings

### 4.1 Preset loader ✅
`src/tts/presets.ts` loads and validates `config/presets.json`.
- **Verify:** AC5.1 unit test (a bad preset file is rejected with a clear error).

### 4.2 `/voice` with previews ✅
- **Verify:** AC5.2 manually; AC5.3 and AC5.4 unit tests.

### 4.3 `/speed`, `/pitch`, `/settings` ✅
- **Verify:** AC6.1–AC6.3 unit tests, plus a manual listen.

---

## Phase 5 — Normalization and dictionary

Plan approved by Youmu 2026-11-01 (plan doc: https://claude.ai/artifact/VTnYfWuioV7ENTtZiBX9qp). Intonation: only the cheap fix (5.4); no listening test or per-sentence styling for now. ⏳ = code and unit tests done, waiting for Youmu's check in Discord.

### 5.1 🧑‍🎓 Normalization test table (E3) ✅
Write the tricky-input table first (URLs, mentions, emoji, code blocks, spoilers, all caps, repeats, long text).
- **Verify:** the table exists, and the tests fail for the right reasons.

### 5.2 Normalization rules ⏳
`src/text/normalize.ts` to make 5.1 pass.
- **Verify:** AC7.1–AC7.7 all green; AC7.8 kept or dropped based on the phase-2 finding.

### 5.3 Dictionary ⏳
`src/text/dictionary.ts`, seeded from `config/dictionary.json`; `/dict add|remove|list`.
- **Verify:** AC8.1 and AC8.3 unit tests; AC8.2: Youmu and the friend review the seed list.

### 5.4 Name prefix as its own sentence ⏳
"Mika says. Are you coming?" instead of "Mika says, are you coming?", so Kokoro keeps the question or exclamation sound (Kokoro's intonation comes only from punctuation).
- **Verify:** unit tests; Youmu hears questions and exclamations in Discord.

### 5.5 Friend-group spelling (AC7.9) ⏳
0 as o and 3 as e inside words (`src/text/letters.ts`).
- **Verify:** E3 table rows; Youmu tries "kn0wy" in Discord.

### 5.6 Emoji in /dict + tilde dropped (AC8.3, AC7.10) ⏳
`/dict add word:🍥 say:fishcake`; "~" is never read out.
- **Verify:** unit tests; Youmu tries both in Discord.

---

## Phase R — Reliability and hardening (added 2026-11-02)

From the performance and security review (https://claude.ai/artifact/7NW4zFJK9F1VW2mNf8MWX1). Youmu picked: findings 1–3 (high), 4, 6, 7, Kokoro warm-up, preview cooldown, bot healthcheck. Not picked for now: named Docker volume for the DB (finding 5), `/dict` size cap (8), linter (9), message cache limit, base image digest pin. `npm audit --omit=dev`: 0 vulnerabilities (Youmu, 2026-11-02). Plan approved by Youmu 2026-11-02. All four tasks verified by Youmu in Docker and Discord (2026-11-02).

### R.1 Stay up: voice errors, Kokoro timeout, play watchdog, crash handlers ✅
- `src/voice/connection.ts`: listen for the connection's `error` event and log it (AC10.1). Pulled into a small exported `watchConnection()` so it can be tested with a fake emitter.
- `src/tts/kokoro.ts`: abort the speech request if no response arrives within 5 s; clear the timer once headers arrive, so long messages still stream (AC10.2).
- `src/voice/queue.ts`: optional `playTimeoutMs` (90 s) — if `play()` hasn't finished, call `stopPlayback()` and move on. `src/voice/connection.ts` `#play`: stop the player if it hasn't reached Playing within 10 s (AC10.3).
- New `src/health.ts`: `installCrashHandlers(proc, log, exit)` (AC10.4) and the heartbeat for R.3. One new file, added to ARCHITECTURE section 4.
- **Verify:** unit tests for AC10.1–AC10.4 (fake emitter, local HTTP server that never answers, fake player that never finishes, fake process); `npm test`, `npm run typecheck`.

### R.2 Cheaper message path ✅
- `src/discord/messages.ts`: bot/channel/opt-in checks before dictionary and normalize; empty check after normalize (AC10.5, AC2.3–AC2.5 unchanged).
- `src/text/dictionary.ts`: a per-server cache of the merged dictionary and its compiled pattern; `/dict add|remove` clears that server's entry.
- **Verify:** unit tests (a not-opted-in message never reads `/dict` rows; cache cleared after `/dict add`); existing E3 table still green; `latency_ms` in the bot log compared before/after (expected change: tiny, it's about not doing work for messages that aren't read).

### R.3 Container and Discord safety ✅
- `compose.yaml`: log rotation for both services; bot gets `security_opt: no-new-privileges`, `cap_drop: [ALL]`, `read_only: true`, `tmpfs: /tmp` (AC10.6).
- `src/index.ts`: `allowedMentions: { parse: [] }` on the client (AC10.7).
- Heartbeat: while the client is ready, touch `/tmp/yuyu-heartbeat` every 30 s; compose healthcheck checks it is less than 90 s old with `node -e` (AC10.10). No new port, no new dependency.
- **Verify:** `docker compose up -d --build`; `docker compose ps` shows the bot healthy; `docker inspect` shows the log, capability and read-only settings; ffmpeg still plays with the read-only root; `/dict add word:pingtest say:@everyone` shows no ping.

### R.4 Kokoro warm-up and preview cooldown ✅
- `src/index.ts` (+ a small helper in `src/tts/speech.ts`): after startup, one short throwaway clip per preset in the background, logging `warmup_ms` per preset (AC10.8).
- `src/discord/commands/voice.ts`: pure `previewCooldown(lastAt, now)` helper, 5 s per user (AC10.9).
- **Verify:** unit test for the cooldown; bot log shows warm-up lines; the first real message's `latency_ms` after a restart, compared with one before this change.

### R.5 Cleanup after phase R ✅
From the cleanup review (https://claude.ai/artifact/B2pVEtumcAC85u9qkJN2ox), approved by Youmu 2026-11-02: items 1–8 and 11 (9 and 10 skipped). No behaviour change.
- One name per meaning: Kokoro's HTTP body type becomes `KokoroSpeechBody`; `SpeakItem` builds on the speech `SpeechRequest`.
- One helper (`speechFor`) turns a resolved voice into a speech request, used by messages, previews and warm-up (warm-up goes through `resolveVoice` like real messages).
- Remove the unused `langCode` option and the unused `numberLetters` re-export.
- `settings.getMember()` reads the opt-in row once (replaces `isOptedIn` + `getSpokenName`).
- `/join`: a `NOT_IN_VOICE` message constant instead of `joinError()`; `Sessions.leave()` returns nothing.
- One `ProblemsError` base class for `ConfigError`, `PresetError`, `DictionaryError` (same messages).
- `FFMPEG_PATH` goes through `config.ts` like every other setting; `audio.ts` takes the path as an option.
- **Verify:** `npm test`, `npm run typecheck`; one message and one preview in Discord.

---

## Phase 6 — Evals and phrase cache

### 6.1 🧑‍🎓 Latency bench (E1)
`evals/latency/`: offline bench over short/medium/long sets, printing p50/p95 per set, plus a log-parsing script for live sessions.
- **Verify:** a baseline is recorded in `PROGRESS.md`; short p95 < 1.0 s, or a task is added to fix it.

### 6.2 Phrase cache
`src/tts/cache` (or `src/cache/`): key = (text, voice, speed, pitch), < 20 chars, warmed at startup from `config/phrases.txt`.
- **Verify:** AC9.1–AC9.3 tests.

### 6.3 🧑‍🎓 Cache impact (E4)
Run E1 with the cache on and off.
- **Verify:** AC9.4: results are in `PROGRESS.md`, and a keep-or-remove decision is made.

### 6.4 Live latency check
One real game session with logging on.
- **Verify:** live p50/p95 are recorded and compared with the offline bench.

---

## Later (not scheduled)

- VOICEVOX "fun mode" (Japanese only; needs per-character credit).
- Style-Bert-VITS2 community models with clear licenses.
- A desktop shortcut or script to start and stop the stack.
