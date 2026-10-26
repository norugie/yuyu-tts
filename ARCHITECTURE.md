# ARCHITECTURE — YuyuTTS

Status: **approved** · Last updated: 2026-10-25

This file says *how* the PRD gets built. Versions below were checked on 2026-10-25 (sources at the end). Re-check them before upgrading.

## 1. Stack

| Part | Choice | Why |
|---|---|---|
| Runtime | **Node.js 24 LTS** ("Krypton", 24.22.x) | `@discordjs/voice` 0.19 needs Node ≥ 22.12.0. 24 is the current LTS; 26 is not LTS yet. |
| Language | **TypeScript**, run directly by Node's built-in type stripping; `tsc --noEmit` for type checking only | No build step and no `tsx`/`ts-node` dependency. Rule that follows: only "erasable" TS syntax (no `enum`, no `namespace`, no parameter properties). Use union types and `as const` objects instead. |
| Discord API | **discord.js 14.27** | Slash commands, events, message parsing. |
| Voice | **@discordjs/voice 0.19.2** | Joins voice, sends Opus audio, and handles DAVE. It now lists `@snazzah/davey` as a normal dependency, so the old "dev-dependency only" warning no longer applies. We still check `generateDependencyReport()` at startup (PRD AC1.5). |
| TTS engine | **Kokoro-FastAPI v0.9.0**, image `ghcr.io/remsky/kokoro-fastapi-gpu:v0.9.0` (CUDA 12.6) | Pinned tag, as its README recommends, instead of `:latest`. The cu126 image covers GTX 900 through RTX 40, which includes the 4070. |
| Audio processing | **ffmpeg** (Debian package in the bot image) | Pitch/speed effects and encoding to Opus in one process. |
| Settings storage | **SQLite** via **better-sqlite3 13** | One file, no server, synchronous API that's easy to reason about. Alternative considered: Node's built-in `node:sqlite` (zero dependencies, but still marked "active development" in Node 24). |
| Tests | **`node:test`** + `node:assert` | Built into Node, no extra dependency. Enough for table-driven unit tests. |
| Packaging | **Docker Compose**: `bot` + `kokoro` | One command starts everything on Windows (Docker Desktop, WSL2 backend). |

**Not used, on purpose:** `@discordjs/opus` / `opusscript` (ffmpeg encodes Opus for us), `ffmpeg-static` (the image has system ffmpeg), any web framework, any LLM.

## 2. Data flow

```
Discord gateway
  │ messageCreate
  ▼
[1] Filter ── not a bot? author opted in? in the channel we read? bot in voice?
  │
  ▼
[2] Normalize ── Discord-specific cleanup (mentions, URLs, emoji, caps, length)
  │             then game-term dictionary
  ▼
[3] Queue (one per server) ── in-order (default) or newest; max 10 waiting
  │   starts generating audio for the NEXT item while the current one plays
  ▼
[4] TTS ── phrase cache hit? → cached Opus file
  │        miss → POST kokoro:8880/v1/audio/speech  (stream, pcm, 24 kHz mono)
  ▼
[5] ffmpeg ── pitch + speed effects → Ogg Opus, 48 kHz, 20 ms pages
  │
  ▼
[6] @discordjs/voice ── AudioPlayer plays an AudioResource(OggOpus)
  │                     DAVE-encrypted packets → voice channel
  ▼
Everyone in VC hears it
```

### Why these audio choices (plain language)

- **Discord voice only carries Opus.** Opus is a compressed audio format built for live speech. Every voice packet is a 20 ms Opus frame at 48 kHz. Whatever Kokoro produces must end up as that.
- **Kokoro → raw PCM, not mp3/opus.** Raw PCM ("pcm": uncompressed 16-bit samples, 24 kHz, mono) can be piped straight into ffmpeg with nothing to decode first. Asking Kokoro for mp3 would mean compressing, then decompressing, then compressing again.
- **ffmpeg does effects and Opus encoding together.** We need ffmpeg for pitch anyway, so it also resamples 24 kHz → 48 kHz and encodes Opus. `@discordjs/voice` then only has to unwrap Ogg pages (`StreamType.OggOpus`) and doesn't need its own Opus encoder. That's one fewer native dependency.
- **Streaming instead of full file.** With `stream: true` Kokoro sends audio as it's generated, roughly sentence by sentence. For short callouts the gain is small, but for long messages the first words play while the rest is still being made. ffmpeg is told to flush small Ogg pages (`-page_duration 20000`, one Opus frame) so it doesn't hold audio back to fill a bigger page.
- **Generate the next item early.** While message A plays, the queue already requests audio for message B. When A ends, B starts at once instead of waiting for Kokoro.

### Pitch and speed

- **Speed:** sent to Kokoro as `speed` (the model speaks faster or slower natively, which sounds better than stretching audio afterwards).
- **Pitch:** done in ffmpeg. First choice: `asetrate=24000*k,aresample=48000,atempo=1/k`, where `k = 2^(semitones/12)` (asetrate rounded to whole Hz; limited to ±12 semitones because atempo only accepts 0.5–2.0). This raises pitch *and* shifts formants a little (the slight "chipmunk" effect), which helps the cute/anime sound. No extra library needed.
- **Alternative to compare in phase 2:** ffmpeg's `rubberband` filter (`rubberband=pitch=k`), which keeps formants for a more natural sound. We use it only if the friend prefers it in the voice-quality eval (E2) and the Debian ffmpeg build includes it (check with `ffmpeg -filters | grep rubberband`).

### Normalization: ours vs Kokoro's

Kokoro-FastAPI v0.9.0 has its own normalizer (numbers, dashes, emoji, phone numbers, all caps). We leave it **on** for general text, and our code only does what Kokoro can't know about: Discord mentions, custom emoji ids, URLs → "link", spoilers, code blocks, spam collapsing, length cap, and the game-term dictionary. PRD AC7.8 (all caps) is tested end to end in phase 2. If Kokoro already handles it well, we drop our own rule.

## 3. Short-utterance weakness (PRD risk)

Kokoro sounds best around 100–200 tokens and can be weak on very short input, which is exactly what callouts are. The phase-2 spike renders the Appendix A phrase list per preset and compares:

1. Plain text ("left").
2. Light punctuation tricks ("Left!", "Left.").
3. Different blends for the same preset.
4. The phrase cache. It doesn't change quality, but if a phrase is short and common, we can choose the best-sounding render once and reuse it.

We pick based on the E2 ratings, not by guessing.

## 4. Folder structure

```
yuyu-tts/
├── CLAUDE.md  PRD.md  ARCHITECTURE.md  TASKS.md  PROGRESS.md  README.md
├── compose.yaml
├── .env.example                  # names only, no values
├── docker/
│   └── bot.Dockerfile
├── config/
│   ├── presets.json              # preset name → voice/blend, pitch, speed
│   ├── dictionary.json           # starter game terms (seed for the DB table)
│   └── phrases.txt               # phrase list for E2 + cache warm-up
├── src/
│   ├── index.ts                  # wiring only: config, client, events
│   ├── config.ts                 # read + validate env, fail fast
│   ├── log.ts                    # one-line JSON logs (timing fields for E1)
│   ├── discord/
│   │   ├── commands/             # one file per slash command
│   │   ├── registerCommands.ts   # script: register guild commands
│   │   └── onMessage.ts          # step [1] filter → hand to queue
│   ├── text/
│   │   ├── normalize.ts          # step [2], pure functions
│   │   └── dictionary.ts
│   ├── tts/
│   │   ├── kokoro.ts             # step [4] HTTP client
│   │   ├── audio.ts              # step [5] ffmpeg spawn + filter strings
│   │   └── presets.ts            # load + validate presets.json
│   ├── voice/
│   │   ├── connection.ts         # join/leave, auto-leave when alone
│   │   └── queue.ts              # step [3]+[6], one per server
│   └── store/
│       ├── db.ts                 # open SQLite, run migrations
│       └── settings.ts           # user + server settings
├── tests/                        # node:test, mirrors src/ (e.g. tests/text/normalize.test.ts)
├── spikes/
│   ├── candidates.ts             # phase 2: candidate presets to audition
│   ├── phrases.ts                # read phrases.txt, name clip files
│   └── render-presets.ts         # phase 2: render phrases × presets to files
├── evals/
│   ├── latency/                  # E1 + E4 harness and results
│   └── voice-quality/            # E2: README, ratings.ts + summarize.ts, reels/ + clips/ (.ogg, committed), ratings.csv
└── data/                         # SQLite file + cache (Docker volume, gitignored)
```

Rule: `text/` and `tts/audio.ts` filter-string builders stay **pure** (no I/O), so most logic is unit tested without Discord or a GPU.

## 5. Docker Compose

```yaml
# compose.yaml (sketch; the real file is written in TASKS)
services:
  kokoro:
    image: ghcr.io/remsky/kokoro-fastapi-gpu:v0.9.0
    ports: ["127.0.0.1:8880:8880"]    # local only, for the spike and the web UI
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]
    healthcheck: { test: ..., ... }    # GET /health (confirmed in phase 0)
    restart: unless-stopped

  bot:
    build: { context: ., dockerfile: docker/bot.Dockerfile }
    env_file: .env
    environment:
      KOKORO_URL: http://kokoro:8880
    volumes: ["./data:/app/data"]
    depends_on:
      kokoro: { condition: service_healthy }
    restart: unless-stopped
```

- The bot talks to Kokoro over the Compose network (`http://kokoro:8880`), so no port needs to be open to the internet. The bot only makes **outgoing** connections to Discord.
- `bot.Dockerfile`: `node:24-bookworm-slim` + `apt-get install ffmpeg`, `npm ci --omit=dev`, `CMD ["node", "src/index.ts"]`.
- Start: `docker compose up -d`. Stop: `docker compose down`. That matches "runs only while I'm online".

## 6. Settings storage

SQLite file at `data/yuyu.db`, created on first start. Tables:

| Table | Columns |
|---|---|
| `user_settings` | `user_id` PK, `opted_in` (0/1), `preset`, `speed`, `pitch`, `updated_at` |
| `guild_settings` | `guild_id` PK, `queue_mode` (`in-order`/`newest`), `name_prefix` (`always`/`on-change`/`never`), `read_channel_id` (null = voice channel chat), `max_chars` |
| `dictionary` | `guild_id`, `word`, `spoken`, PK (`guild_id`, `word`) |
| `schema_version` | single row; migrations are numbered SQL strings in `db.ts` |

Settings are per user across servers, since it's one group. Presets live in `config/presets.json` (version controlled), not in the DB, so changing a preset is a reviewed change.

## 7. Discord setup

- **Gateway intents:** `Guilds`, `GuildVoiceStates`, `GuildMessages`, `MessageContent`. MessageContent is "privileged": turn it on in the Developer Portal. Bots in fewer than 100 servers don't need verification for it.
- **Bot permissions** (invite link): View Channel, Send Messages, Read Message History, Connect, Speak, Use Application Commands.
- **Slash commands** are registered **per guild** (instant updates) by `registerCommands.ts`, not globally.
- **Which channel is read (PRD Q1, decided):** default is the text chat of the voice channel the bot is in. Voice channels have built-in chat, and discord.js sees those messages as `messageCreate` with `message.channelId` equal to the voice channel id. Optional override: `read_channel_id` in `guild_settings`.

## 8. Latency budget and measurement (E1)

Target: **p95 < 1.0 s** from `messageCreate` received to the first audio packet, for messages under 20 characters.

| Step | Rough budget |
|---|---|
| Filter + normalize | < 5 ms |
| Kokoro time to first audio (GPU, short text) | ~100–300 ms (README reports ~300 ms first audio for 400-char input) |
| ffmpeg startup + first Opus page | ~50–100 ms |
| Player start + network | ~50–100 ms |
| Waiting behind other messages | Not counted. Measured separately as queue wait. |

`log.ts` writes one JSON line per message with timestamps for each step (`t_received`, `t_tts_first_byte`, `t_ffmpeg_first_page`, `t_playing`). "First audio frame sent" is approximated by the moment the `AudioPlayer` enters the `Playing` state. The E1 harness has two parts:

1. **Offline bench** (`evals/latency/`): runs steps [2]–[5] directly against Kokoro with the fixed message sets and reports p50/p95. It's repeatable and needs no Discord.
2. **Live numbers**: the same report, computed from the bot's real logs during a game session.

E4 (cache impact) is the offline bench run with the cache on and off.

## 9. Key trade-offs

| Decision | Chosen | Rejected | Why |
|---|---|---|---|
| TTS engine | Kokoro-FastAPI (local GPU) | Cloud TTS, Piper, VOICEVOX | Free, good quality, OpenAI-style API, fast on a 4070, Apache-2.0. VOICEVOX stays a later "fun mode" option. |
| Language | TypeScript, our own bot | Self-host Discord-TTS/Bot (Rust) | It's a learning project, and it's Youmu's main language. The Rust bot is a reference for queue and normalization ideas only. |
| Opus encoding | ffmpeg → Ogg Opus | Raw PCM → `@discordjs/opus` | One native dependency fewer, and ffmpeg is needed for pitch anyway. |
| Streaming | Kokoro `stream: true` | Wait for the full file | Earlier first sound on longer messages. The same code path covers short ones. |
| Storage | SQLite (better-sqlite3) | JSON file, Postgres | Safe concurrent writes and simple queries, no server. Postgres would be overkill for 6 people. |
| TS execution | Node type stripping | tsc build, tsx | No build step, no dependency. The cost is avoiding `enum`, which is easy. |
| Command scope | Guild commands | Global commands | Instant updates while developing; there's only one server. |

## 10. Things to confirm while building

- ~~Kokoro-FastAPI health endpoint path~~ Confirmed in phase 0: `GET /health`.
- ~~Exact `/v1/audio/speech` fields~~ Confirmed in phase 0; full list in `PROGRESS.md`. `stream` defaults to `true`; `caps_normalization` and `url_normalization` are on by default.
- Whether Debian's ffmpeg includes `rubberband` (only matters if we want the alternative pitch method).
- `generateDependencyReport()` inside the bot container lists `@snazzah/davey`.

## Sources (checked 2026-10-25)

- npm registry: `@discordjs/voice` 0.19.2 (engines `node >=22.12.0`, depends on `@snazzah/davey ^0.1.9`), `discord.js` 14.27.0, `better-sqlite3` 13.0.3 (`node >=22`).
- nodejs.org release index: 24.22.1 is the current LTS (Krypton); 26.x is "Current", not LTS.
- Kokoro-FastAPI README and releases: v0.9.0 is the latest release; it recommends pinning a release tag; GPU image ships cu126; `pcm` streaming at 24 kHz mono 16-bit; weighted blends like `af_bella(2)+af_heart(1)`; `/v1/audio/voices` lists voices.
- ghcr.io tag list for `remsky/kokoro-fastapi-gpu`: `v0.9.0` and `v0.9.0-cu126` exist.
- Discord blog: DAVE required for all voice calls since 2026-03-01.
