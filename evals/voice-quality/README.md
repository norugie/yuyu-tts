# Voice-quality eval (E2)

Goal: pick 5–6 presets your friend likes, using scores instead of gut feeling, and keep the clips so later changes can be compared.

## 1. Render

With Kokoro running and ffmpeg installed:

```powershell
npm run render
```

This creates `reels/`, `clips/`, `ratings-template.csv` and `render-latency.csv` here. The candidates are listed in `spikes/candidates.ts`.

### Quick check

`npm run render -- --quick` renders one line per voice into `line/` (add `--batch 4` for one batch, or `--line "text"` for your own line). Much faster than every phrase.

## 2. Shortlist with the reels

Each file in `reels/` is about 10 phrases from `config/phrases.txt` in one voice. Listen to all 7 together and drop the ones that are clearly out.

## 3. Rate the clips

1. Copy `ratings-template.csv` to `ratings.csv` (open it in Excel or Google Sheets).
2. For each shortlisted candidate, play the clips in `clips/<candidate>/` and fill in:
   - `clarity_1to5`: could you understand it instantly, as if in the middle of a game? (5 = perfectly clear)
   - `cute_1to5`: is this the kind of voice you'd like? (5 = love it)
   - `rater`: your name. Each person rates on their own rows (duplicate the rows for a second rater).
   - `notes`: anything odd ("mumbles the 'h'", "too robotic").
3. Skip rows you don't want to rate. Empty rows are ignored.

The short phrases (12 characters or fewer) also have `-exclaim` and `-period` versions, to check whether punctuation helps Kokoro with very short text.

## 4. Summarize

```powershell
npm run eval:voices
```

This prints average clarity and cuteness per candidate, per variant, and per rater. The PRD target is **clarity ≥ 4** for the chosen presets.

## 5. Decide (task 2.7)

Pick the presets and their final names, then record them in `config/presets.json` and the decision in `PROGRESS.md`. Keep `ratings.csv` and the clips committed so a future change can be compared against them.
