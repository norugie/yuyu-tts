# YuyuTTS

A self-hosted Discord bot that reads people's text messages aloud in a voice channel, fast enough for live game comms, using cute anime-style voices. Made for a friend who can't talk in voice chat.

It runs on your own PC with two Docker containers: the bot (Node.js, discord.js + @discordjs/voice with DAVE encryption) and [Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI) for text-to-speech on the GPU. Everything is free and local; the bot is online only while the containers run.

## Requirements

**Software**

- **Windows 10 or 11** with **WSL2**
- **Docker Desktop** using the WSL2 backend. GPU access works out of the box there: no NVIDIA Container Toolkit needed.
- A current **NVIDIA driver** (it includes WSL2 GPU support)
- **Git**, to clone the repo
- For development only: **Node.js 24** and **ffmpeg** (the Docker image has its own ffmpeg)

**Hardware**

| | Minimum | Notes |
|---|---|---|
| GPU | NVIDIA, GTX 900 series through RTX 40 series | The pinned image (`kokoro-fastapi-gpu:v0.9.0`, CUDA 12.6) covers these. RTX 50 series needs the `v0.9.0-cu128` tag in `compose.yaml`. Tested on an RTX 4070. |
| VRAM | about 4 GB | Kokoro's README measured 3.1 GB in use for short clips and 4.0 GB for long ones. |
| RAM | 8 GB (estimate) | Not stated by Kokoro. The bot itself is a small Node process. |
| Disk | about 10 GB free (estimate) | Mostly the Kokoro GPU image (CUDA + PyTorch). The bot image and its data are small. |
| Network | Internet for Discord | The bot only makes outgoing connections; no ports need to be opened. |

## Install

1. **Create the Discord bot.** In the [Developer Portal](https://discord.com/developers/applications), make a new application.
   - **Bot** tab: copy the token, turn **Message Content Intent** on, and turn **Public Bot** off.
   - **General Information**: copy the Application ID.
2. **Invite it** to your server (replace `CLIENT_ID`):
   ```
   https://discord.com/oauth2/authorize?client_id=CLIENT_ID&scope=bot+applications.commands&permissions=2150697984
   ```
   This gives View Channel, Send Messages, Read Message History, Connect, Speak and Use Application Commands.
3. **Clone and configure.**
   ```powershell
   git clone https://github.com/norugie/yuyu-tts.git
   cd yuyu-tts
   copy .env.example .env
   ```
   Fill in `DISCORD_TOKEN` and `DISCORD_CLIENT_ID` in `.env`. Leave `DISCORD_GUILD_ID` empty for global commands, or set it to a test server's ID for instant command updates.
4. **Start it.**
   ```powershell
   docker compose up -d --build
   ```
   The first start downloads Kokoro and loads the model, which takes a few minutes. `docker compose ps` shows both containers as **healthy** when it's ready.

Stop with `docker compose down`. Logs: `docker compose logs -f bot`. Settings are kept in `data/yuyu.db`.

## Using it

Join a voice channel, run `/join`, then `/tts on`. From then on, the bot reads what you type in that voice channel's chat.

| Command | What it does |
|---|---|
| `/join` · `/leave` | Join your voice channel, or leave and clear the queue. The bot also leaves after 2 minutes alone. |
| `/tts on [name:]` · `/tts off` | Turn reading your messages on or off in this server. `name` sets what the bot calls you. |
| `/voice` | Pick a voice (Yuzu, Ichigo or Suzu), with previews. |
| `/speed value:` | Your speaking speed, 0.5–2.0. |
| `/pitch value:` | Your pitch, −4 to +4. |
| `/settings` · `/settings reset:True` | Show or reset your voice, speed and pitch. |
| `/skip` · `/skip all:True` | Skip the current message, or everything waiting. |
| `/queue mode:` | `in-order` (every message) or `newest` (drop the backlog). |
| `/prefix mode:` | When to say who's talking: `always`, `on-change` or `never`. |
| `/channel set` · `/channel reset` | Read a dedicated text channel instead of the voice channel's chat, or go back. |
| `/dict add` · `/dict remove` · `/dict list` | Words or emoji to say differently in this server (e.g. "omw" → "on my way"). |

Your voice, speed and pitch follow you across servers. `/tts on` and the server settings are per server, and anyone can change the server settings.

## Development

```powershell
npm install
npm test            # unit tests
npm run typecheck
npm run test:int    # integration tests (need ffmpeg; some need Kokoro running)
```

How it's built: see [ARCHITECTURE.md](ARCHITECTURE.md).

## Voices

The voices are blends of Kokoro's built-in voices (Apache-2.0), with pitch adjusted by ffmpeg. They aren't cloned from any real person or character.
