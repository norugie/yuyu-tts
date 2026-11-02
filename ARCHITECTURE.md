# ARCHITECTURE — YuyuTTS

Last updated: 2026-11-02 (v1.0). Versions below were checked on 2026-10-25 (sources at the end). Re-check them before upgrading.

## 1. Stack

| Part | Choice | Why |
|---|---|---|
| Runtime | **Node.js 24 LTS** | `@discordjs/voice` 0.19 needs Node ≥ 22.12.0. 24 is the current LTS. |
| Language | **TypeScript**, run directly by Node's built-in type stripping; `tsc` for type checking only | No build step and no `tsx`/`ts-node`. Rule that follows: only "erasable" TS syntax (no `enum`, no `namespace`, no parameter properties). Use union types and `as const` objects instead. |
| Discord API | **discord.js 14.27.0** (pinned) | Slash commands, events, message parsing. |
| Voice | **@discordjs/voice 0.19.2** | Joins voice, sends Opus audio, and handles DAVE (via its `@snazzah/davey` dependency). `generateDependencyReport()` is logged at startup. |
| TTS engine | **Kokoro-FastAPI v0.9.0**, image `ghcr.io/remsky/kokoro-fastapi-gpu:v0.9.0` (CUDA 12.6) | Pinned tag instead of `:latest`. Covers GTX 900 through RTX 40, which includes the 4070. |
| Audio processing | **ffmpeg** (Debian package in the bot image) | Pitch effects and Opus encoding in one process. |
| Settings storage | **SQLite** via **better-sqlite3 13** | One file, no server, synchronous API. |
| Tests | **`node:test`** + `node:assert` | Built into Node, no extra dependency. |
| Packaging | **Docker Compose**: `bot` + `kokoro` | One command starts everything on Windows (Docker Desktop, WSL2 backend). |

**Not used, on purpose:** `@discordjs/opus` / `opusscript` (ffmpeg encodes Opus), `ffmpeg-static` (the image has system ffmpeg), any web framework, any LLM.

## 2. Data flow

```
Discord gateway
  │ messageCreate
  ▼
[1] Filter ── not a bot? in the channel we read? author opted in? bot in voice?
  │
  ▼
[2] Normalize ── Discord-specific cleanup (mentions, URLs, emoji, caps, length)
  │             then the dictionary, then the name prefix ("Mika says.")
  ▼
[3] Queue (one per server) ── in-order (default) or newest; max 10 waiting
  │   starts generating audio for the NEXT item while the current one plays
  ▼
[4] TTS ── POST kokoro:8880/v1/audio/speech  (stream, pcm, 24 kHz mono)
  ▼
[5] ffmpeg ── pitch effect → Ogg Opus, 48 kHz, 20 ms pages
  │
  ▼
[6] @discordjs/voice ── AudioPlayer plays an AudioResource(OggOpus)
  │                     DAVE-encrypted packets → voice channel
  ▼
Everyone in VC hears it
```

The filter runs before normalization, so messages that won't be read never touch the dictionary.

### Why these audio choices

- **Discord voice only carries Opus.** Every voice packet is a 20 ms Opus frame at 48 kHz, so whatever Kokoro produces must end up as that.
- **Kokoro → raw PCM.** Uncompressed 16-bit samples (24 kHz, mono) pipe straight into ffmpeg with nothing to decode first.
- **ffmpeg does effects and Opus encoding together.** It applies pitch, resamples 24 kHz → 48 kHz and encodes Opus. `@discordjs/voice` only unwraps Ogg pages (`StreamType.OggOpus`), so it needs no Opus encoder of its own.
- **Streaming.** With `stream: true` Kokoro sends audio as it's generated, so on long messages the first words play while the rest is still being made. ffmpeg flushes small Ogg pages (`-page_duration 20000`) so it doesn't hold audio back.
- **Generate the next item early.** While message A plays, the queue already requests audio for message B, and pipes ffmpeg's output into a buffer so it isn't lost if ffmpeg finishes first.

### Voices, pitch and speed

- **Presets** live in `config/presets.json` (version controlled): Yuzu (default), Ichigo, Suzu. Each is a Kokoro voice blend plus pitch and speed.
- **Speed** is sent to Kokoro as `speed` (the model speaks faster natively, which sounds better than stretching audio). A user's `/speed` multiplies the preset's speed.
- **Pitch** is done in ffmpeg: `asetrate=24000*k,aresample=48000,atempo=1/k`, where `k = 2^(semitones/12)` (limited to ±12 semitones). This raises pitch *and* formants a little, which helps the cute sound. A user's `/pitch` adds semitones to the preset's. Presets can also set `extraPitch`, which uses ffmpeg's `rubberband` filter (formants kept); it needs an ffmpeg build with librubberband, and all current presets have it at 0.

### Normalization: ours vs Kokoro's

Kokoro-FastAPI has its own normalizer (numbers, dashes, phone numbers, all caps), which we leave on. Our code only does what Kokoro can't know about: Discord mentions, custom emoji, URLs → "link", spoilers, code blocks, repeated letters and punctuation, shouted messages, 0/3 as o/e inside words, the length cap, and the dictionary (`config/dictionary.json` plus each server's `/dict` changes). Every rule has a row in `tests/text/normalize.test.ts`.

## 3. Folder structure

```
yuyu-tts/
├── CLAUDE.md  ARCHITECTURE.md  README.md
├── compose.yaml
├── .env.example                  # names only, no values
├── docker/
│   └── bot.Dockerfile
├── config/
│   ├── presets.json              # preset name → voice/blend, pitch, speed
│   ├── dictionary.json           # starter words; the DB table holds each server's /dict changes
│   └── phrases.txt               # phrase list for the render script and voice-quality eval
├── src/
│   ├── index.ts                  # wiring only: config, client, events
│   ├── config.ts                 # read + validate env, fail fast
│   ├── log.ts                    # one-line JSON logs (with timing fields)
│   ├── health.ts                 # crash safety net + heartbeat file for the Docker healthcheck
│   ├── discord/
│   │   ├── commands/             # slash commands, grouped by topic (join, tts, queue, voice, dict)
│   │   ├── interactions.ts       # routes commands, menus and buttons
│   │   ├── messages.ts           # messageCreate → filter → normalize → queue
│   │   ├── registerCommands.ts   # script: register slash commands (one test server or global)
│   │   └── onMessage.ts          # step [1] filter + name prefix
│   ├── text/
│   │   ├── normalize.ts          # step [2], pure functions
│   │   ├── letters.ts            # 0 as o, 3 as e inside words
│   │   └── dictionary.ts         # whole-word replacement; defaults + per-server /dict changes
│   ├── tts/
│   │   ├── kokoro.ts             # step [4] HTTP client
│   │   ├── audio.ts              # step [5] ffmpeg spawn + filter strings
│   │   ├── speech.ts             # steps [4]+[5] glued together, cancellable
│   │   └── presets.ts            # load + validate presets.json
│   ├── voice/
│   │   ├── connection.ts         # join/leave, auto-leave when alone
│   │   └── queue.ts              # steps [3]+[6], one per server
│   └── store/
│       ├── db.ts                 # open SQLite, run migrations
│       └── settings.ts           # user + server settings
├── tests/                        # node:test, mirrors src/ (*.test.ts unit, *.int.ts integration)
├── spikes/                       # render script used to audition voices (npm run render)
├── evals/
│   └── voice-quality/            # listening eval: README, ratings + summarize scripts, clips
└── data/                         # SQLite file (Docker volume, gitignored)
```

Rule: `text/` and the filter-string builders in `tts/audio.ts` stay **pure** (no I/O), so most logic is unit tested without Discord or a GPU.

## 4. Docker Compose

`compose.yaml` runs two services:

- **kokoro**: the pinned GPU image, healthcheck on `GET /health`, port 8880 bound to `127.0.0.1` only (for the render script and Kokoro's web UI).
- **bot**: built from `docker/bot.Dockerfile` (`node:24-bookworm-slim` + ffmpeg, `npm ci --omit=dev --ignore-scripts`). Talks to Kokoro over the Compose network (`http://kokoro:8880`) and only makes outgoing connections to Discord. Hardened: `no-new-privileges`, `cap_drop: ALL`, read-only filesystem except `data/` and `/tmp`. Healthy while the heartbeat file in `/tmp` is fresh, which it only is while logged in to Discord.

Both use log rotation (3 files of 10 MB). Start: `docker compose up -d --build`. Stop: `docker compose down`.

## 5. Settings storage

SQLite file at `data/yuyu.db`, created on first start. Tables:

| Table | Columns |
|---|---|
| `user_settings` | `user_id` PK, `preset`, `speed`, `pitch`, `updated_at` (shared across servers) |
| `guild_opt_in` | `guild_id`, `user_id`, `opted_in` (0/1), `spoken_name` (nickname for the prefix, null = display name), `updated_at`, PK (`guild_id`, `user_id`) |
| `guild_settings` | `guild_id` PK, `queue_mode` (`in-order`/`newest`), `name_prefix` (`always`/`on-change`/`never`), `read_channel_id` (null = voice channel chat), `max_chars` |
| `dictionary` | `guild_id`, `word`, `spoken`, PK (`guild_id`, `word`); `spoken` = '' switches a starter word off for that server |
| `schema_version` | single row; migrations are numbered SQL strings in `db.ts` |

Voice, speed and pitch are per user and shared across servers. `/tts on|off` is per server: turning it on in one server never makes the bot read you in another.

## 6. Discord setup

- **Gateway intents:** `Guilds`, `GuildVoiceStates`, `GuildMessages`, `MessageContent`. MessageContent is privileged: turn it on in the Developer Portal (no verification needed under 100 servers).
- **Bot permissions** (invite link): View Channel, Send Messages, Read Message History, Connect, Speak, Use Application Commands.
- **Slash commands** register on startup (or with `npm run register`): to one test server when `DISCORD_GUILD_ID` is set (instant updates), otherwise globally.
- **Which servers:** "Public Bot" stays off, so only Youmu can add the bot, to servers Youmu manages. One process can be in voice in several servers at once.
- **Which channel is read:** the text chat of the voice channel the bot is in, by default (discord.js sees those as `messageCreate` with `channelId` equal to the voice channel id). `/channel set` picks a text channel instead.
- **Replies** are ephemeral except `/join` and `/leave`, and never ping anyone (`allowedMentions: { parse: [] }`).

| Command | What it does |
|---|---|
| `/join` · `/leave` | Join your voice channel / leave and clear the queue. Leaves by itself after 2 minutes alone. |
| `/tts on [name:]` · `/tts off` | Turn auto-read on or off for yourself in this server; optionally set the name said before your messages. |
| `/voice` | Pick a voice preset, with previews (one preview per person every 5 s). |
| `/speed value:` · `/pitch value:` | Your speed (0.5–2.0 × the preset) and pitch (−4 to +4 semitones on top of the preset). |
| `/settings` · `/settings reset:True` | Show or reset your settings. |
| `/skip` · `/skip all:True` | Skip the current message, or everything. |
| `/queue mode:` | Server queue mode: `in-order` or `newest`. |
| `/prefix mode:` | When to say who's talking: `always`, `on-change` (default) or `never`. |
| `/channel set` · `/channel reset` | Read a dedicated text channel, or go back to the voice channel's chat. |
| `/dict add` · `/dict remove` · `/dict list` | Words (or emoji) to say differently in this server. |

Anyone in the server can change server settings (`/queue`, `/prefix`, `/channel`, `/dict`).

## 7. Reliability

- One bad message never stops the bot: TTS failures are logged and skipped; voice connection errors are logged; unhandled rejections are logged; an uncaught exception is logged and the process exits so Docker restarts it.
- Timeouts: Kokoro must start answering within 5 s; audio that hasn't started within 10 s, or plays longer than 90 s, is stopped and the queue moves on.
- At startup, one warm-up clip per preset is made in the background, because Kokoro's first clip is slower.

## 8. Latency

Target: **p95 < 1.0 s** from `messageCreate` to the first audio, for short messages. `log.ts` writes one JSON line per message with timing fields (`t_received`, `t_tts_first_byte`, `t_playing`, `latency_ms`); "first audio" is the moment the `AudioPlayer` enters `Playing`. Measured on the 4070: Kokoro's first audio arrives after about 200 ms for a short line.

## 9. Key trade-offs

| Decision | Chosen | Rejected | Why |
|---|---|---|---|
| TTS engine | Kokoro-FastAPI (local GPU) | Cloud TTS, Piper, VOICEVOX, Kokoro + RVC | Free, good quality, OpenAI-style API, fast on a 4070, Apache-2.0. An RVC voice-conversion spike was tried and dropped (slower, extra container). |
| Language | TypeScript, our own bot | Self-host Discord-TTS/Bot (Rust) | Youmu's main language. |
| Opus encoding | ffmpeg → Ogg Opus | Raw PCM → `@discordjs/opus` | One native dependency fewer, and ffmpeg is needed for pitch anyway. |
| Streaming | Kokoro `stream: true` | Wait for the full file | Earlier first sound on longer messages. |
| Storage | SQLite (better-sqlite3) | JSON file, Postgres | Safe writes and simple queries, no server. |
| TS execution | Node type stripping | tsc build, tsx | No build step, no dependency. The cost is avoiding `enum`. |
| Command scope | Global, or one test server when `DISCORD_GUILD_ID` is set | Always per guild | Works in every server Youmu adds it to; the test-server mode keeps instant updates while developing. |

## Kokoro API notes

- Health: `GET /health`. Voices: `GET /v1/audio/voices`. Blends are written like `af_nicole(1)+af_bella(1)`.
- `POST /v1/audio/speech` fields (checked against the running v0.9.0 container): `model`, `input`, `voice`, `response_format`, `speed`, `stream` (default `true`), `lang_code`, `volume_multiplier`, `normalization_options` { `normalize`, `url_normalization`, `caps_normalization`, `phone_normalization`, … }, plus a few we don't use.

## Sources (checked 2026-10-25)

- npm registry: `@discordjs/voice` 0.19.2 (engines `node >=22.12.0`, depends on `@snazzah/davey ^0.1.9`), `discord.js` 14.27.0, `better-sqlite3` 13.0.3 (`node >=22`).
- nodejs.org release index: 24.x is the current LTS.
- Kokoro-FastAPI README and releases: v0.9.0, pin a release tag, GPU image ships cu126, `pcm` streaming at 24 kHz mono 16-bit, weighted blends.
- Discord blog: DAVE required for all voice calls since 2026-03-01.
