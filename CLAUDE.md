# CLAUDE.md — YuyuTTS working rules

Claude Code loads this file automatically at the start of every session. It holds the rules for how we work on this project. The *what* lives in `PRD.md`, the *how* in `ARCHITECTURE.md`, the *order* in `TASKS.md`, and the *where we left off* in `PROGRESS.md`.

## Project in one paragraph

YuyuTTS is a self-hosted Discord bot that reads a mute friend's text messages aloud in our voice channel, fast enough for live game comms, using cute anime-style voice presets. It runs on Youmu's Windows PC (RTX 4070) with Docker Desktop (WSL2): a Node/TypeScript bot container (discord.js + @discordjs/voice with DAVE) and a Kokoro-FastAPI GPU container. It only runs while Youmu is online. It is also a learning project for **spec-driven development** and **evals**.

## Start of every session

1. Read `PROGRESS.md` to see what's done, what broke, and what's next.
2. Read the current task in `TASKS.md` and its acceptance criteria in `PRD.md`.
3. Say which task you're picking up before doing anything else.

## The loop (one task at a time)

For each task in `TASKS.md`:

1. **Investigate.** Read the relevant code and docs. Check current library docs (see "Verify, don't assume").
2. **Plan.** Write a short plan: files to touch, approach, how it will be verified.
3. **Wait for Youmu's approval** of the plan.
4. **Implement** the smallest change that meets the acceptance criteria.
5. **Verify.** Run the tests, evals, or manual check named in the task. Show the output.
6. **Summarize** what changed and why, in plain language.
7. **Update `PROGRESS.md`** (done / broke and why / next).

Only work on one task at a time. If a task turns out to be too big, stop and propose splitting it in `TASKS.md`.

## Docs first, code second

- Don't write code for a task until the task is in `TASKS.md` and its acceptance criteria are in `PRD.md`.
- If something new comes up mid-task, add it to `TASKS.md` (and `PRD.md` if it's a feature) and ask before doing it.
- If the code and the docs disagree, stop and ask which one is right. Then fix the other one.

## Teaching mode

Youmu is learning, so:

- **Explain the "why".** For audio- or AI-specific decisions (Opus encoding, sample rates, streaming vs. full-file, buffering, latency trade-offs, voice blending), give a brief plain-language explanation. Assume full-stack web experience, not audio experience.
- **Let Youmu write some of it.** For evals especially, **ask each time** whether Youmu wants:
  - (a) a skeleton plus a description of what to implement, or
  - (b) the full implementation.
- When offering a skeleton, include the function signatures, types, and `TODO` comments describing the expected behaviour, plus how to run it.

## Verify, don't assume

- Check current docs for **discord.js**, **@discordjs/voice**, and **Kokoro-FastAPI** before using an API. Many older Discord voice tutorials are broken since DAVE (end-to-end encryption) became mandatory on 2026-03-01.
- Prefer the official docs and the library's own source/README over blog posts.
- When you rely on a version number or API shape, say where you checked it.
- After installing or changing voice dependencies, check `generateDependencyReport()` from `@discordjs/voice` inside the container and confirm a DAVE library is listed.

## Coding style

- TypeScript in `strict` mode. No `any` unless there's a comment explaining why.
- Small modules with one job each (e.g. normalization, TTS client, queue, voice, settings). Pure functions where possible, so they're easy to unit test.
- Config comes from environment variables, validated once at startup. Fail fast with a clear message if something is missing.
- Errors: never crash the bot on one bad message. Log it, skip it, keep going.
- Logs are short and useful: what happened, which message/user id, how long it took. Never log the bot token.
- Tests sit next to what they test or in a `tests/` folder (decided in `ARCHITECTURE.md`); every normalization rule has a test.
- Follow the folder structure in `ARCHITECTURE.md`. Changing it is an architecture change and needs approval.

## Smallest useful step

- No speculative architecture: build what the current task needs, not what a future task might need.
- No new dependency without saying why it's needed and what the smaller alternative was.
- Fix root causes, not symptoms. If a workaround is unavoidable, say so and add a task to fix it properly.

## Never

- Never commit the bot token, `.env`, or any secret. `.env` stays in `.gitignore`; keep a `.env.example` with empty values instead.
- Never add paid APIs or paid services.
- Never add LLMs or Ollama. This project is TTS only.
- Never use voice models cloned from real people or from existing characters. Only use models whose license and training data are clearly stated and allow this use.
- Never mark a task done without verifying it, and showing how it was verified.
- Never make large refactors that weren't asked for.
- Never push, open a PR, or change anything outside the repo without asking first.
