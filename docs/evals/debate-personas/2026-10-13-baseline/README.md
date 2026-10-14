# Debate persona eval: 2026-10-13 baseline

The reference run for debate persona and length changes. Prompts are as of `master` at `ab841866`
(after PR #256); compare later runs against these files.

## What ran

- **capture/**: `npm run test:debate-prompts:capture` (no network). Every persona as Affirmative
  against a Default Negative on the Claude, ChatGPT and Gemini default models, plus George vs Kai in
  text and voice mode. `summary.md` holds the composition, sampling and voice tables; `prompts/`
  holds the full system and turn prompts per speech. The raw `captures.json` is not kept: re-running
  the capture at this commit reproduces it.
- **live/**: `npm run test:debate-personas:live` then `npm run test:debate-personas:judge`, rubric v1.
  Motion "This house would ban private cars from city centres", Oxford 1v1, text mode, web search on.
  Each persona (Default as control) argued Affirmative against a Default Negative on
  claude-sonnet-5-5 and gemini-3.8-flash: both openings plus the persona's first floor speech,
  16 debates and 48 calls. gpt-6.1-sol judged the 32 Affirmative speeches in 64 calls.

## Headline results

| Measure | Result |
| --- | --- |
| Blind persona attribution | 29 of 32 correct (91%; chance 13%) |
| Stance held | 32 of 32 |
| Lists or headings | 0 of 32 |
| Speeches over the word guidance | 48 of 48 (openings 237-437 words vs 154-220; floor speeches 272-477 vs 126-180) |
| Weakest persona | Bestie: 3.3 of 5 in character, one speech read as Default |
| Persona vs format conflicts | Devlin broke the opening rule 2 of 2 times; Kai's table move appeared 0 of 4 times |

Full analysis: the "Prompt capture results" and "Live eval baseline" sections of the
[handoff doc](https://claude.ai/code/artifact/19f82867-37ba-46b0-934b-ed627481764b).

## Comparing a new run

Run the same commands with `DEBATE_EVAL_OUT` (live) or `DEBATE_PROMPT_CAPTURE_OUT` (capture) set to a
new folder, keep the motion, providers and `RUBRIC_VERSION` unchanged, and compare `report.md` and
`summary.md` table by table. A rubric change needs a new baseline judged with the new rubric.
