# PRD — YuyuTTS

Status: **approved** · Owner: Youmu · Last updated: 2026-10-25

## 1. Problem

A friend in our gaming group is mute. We play voice-heavy co-op games (mostly **Lethal Company** and **Helldivers 2**) in a Discord voice channel. They can type, but in the middle of a game nobody is looking at Discord chat, so their messages get missed. The public "TTS Bot" works but has no voices they like.

Other friends sometimes join muted too, so the same problem applies to them.

## 2. Users

| User | Need |
|---|---|
| **Primary speaker** (our mute friend) | Have their typed messages spoken in VC quickly, in a voice they like. |
| **Occasional speakers** (other muted friends) | Turn reading on for themselves when they need it, and off again. |
| **Listeners** (everyone in VC, 5–6 people) | Hear messages clearly, in order, and tell who's speaking. |
| **Host** (Youmu) | Start/stop the bot on their PC, configure it, and not babysit it. |

## 3. Goals

- G1. Messages from opted-in users are spoken in VC fast enough for live game comms.
- G2. A small set of cute, anime-style voice presets the friend actually likes.
- G3. Runs free on Youmu's PC (RTX 4070), only while Youmu is online.
- G4. Learning: every feature has testable acceptance criteria, and quality is measured with evals.

## 4. Non-goals

- No 24/7 hosting, no multi-server scaling, no public bot listing.
- No paid APIs or services.
- No LLMs or Ollama (no rewriting, summarizing, or "smart" replies).
- No voices cloned from real people or existing characters.
- No receiving or recording voice audio. The bot only **sends** audio.
- No web dashboard or visual frontend.

## 5. Features

Each acceptance criterion (AC) has an id and says how it's checked: **[unit]** automated test, **[int]** integration test against a running Kokoro container, **[eval]** measured by an eval, **[manual]** checked by hand in Discord.

"Opted-in user" means a user who has turned auto-read on with `/tts on`.
"TTS channel" means the text chat of the voice channel the bot is in, unless a dedicated channel is set with `/channel` (see section 8).

### F1. Join and leave voice (MVP)

- **AC1.1** WHEN a user runs `/join` AND that user is in a voice channel, THE bot SHALL join that voice channel within 5 s and reply with a confirmation. [manual]
- **AC1.2** WHEN a user runs `/join` AND that user is not in a voice channel, THE bot SHALL reply with an ephemeral error saying to join a voice channel first. [unit]
- **AC1.3** WHEN a user runs `/leave`, THE bot SHALL stop playback, clear the queue, and leave the voice channel. [manual]
- **AC1.4** WHILE the bot is the only member left in its voice channel for 2 minutes, THE bot SHALL leave automatically. [manual]
- **AC1.5** THE bot SHALL connect using DAVE end-to-end encryption, and the startup log SHALL show the `@discordjs/voice` dependency report including a DAVE library. [manual]

### F2. Opt-in auto-read (MVP)

- **AC2.1** WHEN a user runs `/tts on`, THE bot SHALL mark that user as opted in, persist it, and reply ephemerally. `/tts off` SHALL reverse it. [unit]
- **AC2.2** WHEN an opted-in user sends a message in the TTS channel AND the bot is in voice, THE bot SHALL speak the normalized message with that user's saved settings. No prefix or command is needed. [int]
- **AC2.3** WHEN a user who is not opted in sends a message, THE bot SHALL NOT speak it. [unit]
- **AC2.4** WHEN a message comes from a bot (including itself), THE bot SHALL NOT speak it. [unit]
- **AC2.5** WHEN a message is empty after normalization (e.g. only an image), THE bot SHALL skip it silently. [unit]
- **AC2.6** WHEN more than one opted-in user is speaking in a session AND the speaker changes, THE bot SHALL prefix the message with the speaker's display name (e.g. "Mika: left door"). This SHALL be configurable (`always` / `on-change` / `never`, default `on-change`). [unit]
- **AC2.7** WHEN a user runs `/channel set channel:<#text-channel>`, THE bot SHALL read from that channel instead of the voice channel's chat; `/channel reset` SHALL go back to the voice channel's chat. Persisted per server. [unit]

### F3. Playback queue (MVP)

- **AC3.1** WHEN several messages arrive while audio is playing, THE bot SHALL play them in the order they were sent (default mode `in-order`). [unit]
- **AC3.2** WHERE the queue mode is `newest`, WHEN a new message arrives while others are waiting, THE bot SHALL drop the waiting (not playing) messages and play the newest next. [unit]
- **AC3.3** THE queue SHALL hold at most a configurable number of waiting messages (default 10); WHEN it is full, THE bot SHALL drop the oldest waiting message and log it. [unit]
- **AC3.4** WHEN TTS generation fails for one message, THE bot SHALL log the error, skip that message, and continue with the next. [unit]
- **AC3.5** The queue mode SHALL be set with `/queue mode:<in-order|newest>` and persisted per server. [unit]

### F4. Skip (MVP)

- **AC4.1** WHEN a user runs `/skip`, THE bot SHALL stop the current message within 300 ms and start the next queued message, if any. [manual]
- **AC4.2** WHEN a user runs `/skip all`, THE bot SHALL stop the current message and clear the queue. [unit]

### F5. Voice presets (MVP)

- **AC5.1** THE bot SHALL offer 5–6 named presets, each defined as a Kokoro voice or blend plus pitch and speed values. Presets are chosen with the friend in phase 2. [unit: preset config validates]
- **AC5.2** WHEN a user runs `/voice`, THE bot SHALL show the presets as a select menu, with a "preview" option that plays a short sample in VC (or attaches it as a file if the bot isn't in VC). [manual]
- **AC5.3** WHEN a user picks a preset, THE bot SHALL save it for that user, and their next message SHALL use it. [unit]
- **AC5.4** WHEN a user has no saved preset, THE bot SHALL use the default preset. [unit]

### F6. Speed and pitch (MVP)

- **AC6.1** WHEN a user runs `/speed value:<0.5–2.0>`, THE bot SHALL save it and apply it on top of the preset. Values outside the range SHALL be rejected with an ephemeral error. [unit]
- **AC6.2** WHEN a user runs `/pitch value:<-4–+4>` (semitones), THE bot SHALL save it and apply it on top of the preset. [unit]
- **AC6.3** `/settings` SHALL show the user's current preset, speed, pitch, and opt-in state, and `/settings reset` SHALL restore defaults. [unit]

### F7. Text normalization (MVP)

- **AC7.1** URLs SHALL be spoken as "link" (or "link to youtube" when the domain is known). [unit]
- **AC7.2** User mentions, role mentions, and channel mentions SHALL be spoken as the display name, role name, or channel name. [unit]
- **AC7.3** Custom emoji SHALL be spoken by name (`<:pog:123>` → "pog"); runs of more than 3 identical emoji SHALL be collapsed to one. [unit]
- **AC7.4** Code blocks SHALL be spoken as "code block". [unit]
- **AC7.5** Spoiler text SHALL be spoken as "spoiler". [unit]
- **AC7.6** Repeated characters SHALL be shortened (`noooooo` → `nooo`, `!!!!!` → `!`). [unit]
- **AC7.7** Messages longer than a configurable limit (default 300 characters) SHALL be cut at a word boundary, ending with "and so on". [unit]
- **AC7.8** WHEN a message is in ALL CAPS, THE bot SHALL lowercase it before TTS, so words aren't spelled out letter by letter. [unit]

### F8. Game-term dictionary (Next)

- **AC8.1** THE bot SHALL replace whole words using a dictionary file (word → spoken form), case-insensitive, before TTS. [unit]
- **AC8.2** THE dictionary SHALL ship with starter entries for Lethal Company and Helldivers 2 that Youmu and the friend review (see Appendix A). [manual]
- **AC8.3** Users SHALL be able to add or remove entries with `/dict add word:<w> say:<spoken>` and `/dict remove word:<w>`, persisted per server. [unit]

### F9. Phrase cache (Next)

The handoff calls this the "callout cache". Since our games rely on game terms more than fixed callouts, it caches whatever short phrases get said most.

- **AC9.1** THE bot SHALL cache generated audio keyed by (normalized text, voice, speed, pitch), for messages under 20 characters. [unit]
- **AC9.2** WHEN a cached message is requested, THE bot SHALL play it without calling Kokoro. [unit]
- **AC9.3** The cache SHALL be pre-warmed at startup from a phrase list file, for each preset in use. [int]
- **AC9.4** The cache SHALL be kept only if the latency eval (E4) shows a measurable p95 improvement for short messages. [eval]

## 6. Evals

| Id | What | How | Target |
|---|---|---|---|
| **E1** Latency | Time from Discord `messageCreate` received → first audio packet sent to voice. | Log timestamps per message; harness sends a fixed set of short (<20 chars), medium (20–100), and long (100–300) messages and reports p50/p95. | **p95 < 1.0 s for short messages.** Medium and long measured and recorded, target set after the first baseline. |
| **E2** Voice quality | How each preset sounds on our real messages. | Fixed list of 20–30 short phrases and game terms (Appendix A) rendered per preset, saved as clips, rated 1–5 by the friend and Youmu on clarity and "cuteness". Clips are kept so changes can be compared. | Chosen presets average ≥ 4 on clarity. |
| **E3** Normalization | Correctness of F7/F8 rules. | Unit test table of tricky inputs → expected spoken text. | 100% passing. |
| **E4** Cache impact | Whether F9 is worth keeping. | Run E1 with cache on vs. off on the short set. | Keep if p95 improves noticeably (threshold set after the E1 baseline). |

## 7. Bot UX

**Tone:** short, friendly, a little cute, never spammy. Command replies are **ephemeral** (only the person who ran it sees them), except `/join` and `/leave`, which are public so everyone knows the bot's state. No emoji spam: at most one per reply.

**Slash commands**

| Command | What it does |
|---|---|
| `/join` | Join your voice channel. |
| `/leave` | Leave voice and clear the queue. |
| `/tts on` · `/tts off` | Turn auto-read on or off for yourself. |
| `/voice` | Pick a voice preset, with previews. |
| `/speed value:` | Set your speaking speed (0.5–2.0). |
| `/pitch value:` | Set your pitch (−4 to +4). |
| `/settings` · `/settings reset` | Show or reset your settings. |
| `/skip` · `/skip all` | Skip the current message, or everything. |
| `/queue mode:` | Set queue mode for the server: `in-order` or `newest`. |
| `/channel set` · `/channel reset` | Read from a dedicated text channel, or go back to the voice channel's chat. |
| `/dict add` · `/dict remove` · `/dict list` | Manage the game-term dictionary (Next). |

**Example replies**

- `/join` → "Joined **General**! I'll read messages from this voice channel's chat ♪"
- `/tts on` → "Okay! I'll read your messages in #tts out loud."
- `/voice` saved → "Voice set to **Sakura**."
- `/join` error → "Hop into a voice channel first, then try again."

**Preset names (placeholders until phase 2):** Sakura, Momo, Yuzu, Hoshi, Kiki, Mochi. Final names are picked with the friend once the voices are chosen.

## 8. Decisions (answered 2026-10-25)

- **Q1. Which text channel?** The voice channel's built-in text chat by default; a dedicated `#tts` channel can be set with `/channel` (AC2.7).
- **Q2. Name prefix:** `on-change` is the default (AC2.6).
- **Q3. Server settings** (`/queue`, `/dict`, `/channel`): anyone can change them.
- **Q4. Voice presets:** still open, decided in phase 2 by auditioning with the friend.

## Appendix A. Starter phrase list and dictionary (to review)

These are guesses to start from. Youmu and the friend should correct and extend them; this list becomes the E2 eval set.

**Phrases (E2 / cache):** left, right, behind you, help, run, wait, come back, go go go, I'm stuck, on my way, I'm dead, nice, thanks, sorry, lol, yes, no, need ammo, reinforce me, call extract, where's the ship, fire exit, door's locked, it's following me, don't look at it.

**Dictionary seeds**

| Written | Spoken |
|---|---|
| LC | Lethal Company |
| HD2 | Helldivers two |
| fe | fire exit |
| coilhead | coil head |
| bracken | bracken |
| strat / strats | stratagem / stratagems |
| reinf | reinforce |
| exfil / extract | extract |
| SSD | super destroyer |
| bugs / bots / squids | (kept as is) |
| gg | good game |
| brb | be right back |
| omw | on my way |
| ty | thank you |
| np | no problem |
| lol | lol |
