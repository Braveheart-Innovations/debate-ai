# Debate prompt capture after word targets: 2026-10-14

`npm run test:debate-prompts:capture` (no network) on release/2.4 after the length change (Phases 1
and 2), at the default Speech length. Same runs as the
[2026-10-13 baseline](../2026-10-13-baseline/README.md); compare `capture/` file by file.

Against the baseline only two prompt lines changed, in every run:

- the turn prompt's length line: openings "about 190 words (between 162 and 218)", floor speeches
  "about 150 words (between 128 and 173)", closings "about 130 words (between 111 and 150)", each
  "in natural prose with no headings or lists, then stop.", replacing the qualitative text;
- the system prompt's "Keep each scheduled speech compact and follow the turn-specific length
  guidance." became "Follow the turn-specific length guidance."

Everything else in `summary.md` and `prompts/` follows from those two lines: system prompts are 6
words shorter, so the total and format word counts drop by 6. Sampling, token caps (6144 text, 1536
voice) and persona text are unchanged. The capture does not record the new Gemini reasoning hint; the
orchestrator tests and the live run in `docs/evals/debate-length/2026-10-14-gemini-low/` cover it.
