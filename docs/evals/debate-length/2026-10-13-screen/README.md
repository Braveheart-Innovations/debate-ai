# Debate length screen: 2026-10-13

Which way of stating speech length holds across providers and personas, at two brevity levels?
Run with `npm run test:debate-length:live` (defaults: mechanisms current, words, time and structure;
levels concise and verbose; personas Default, Brody and Kai). 63 debates and 189 calls on
claude-sonnet-5-5, gpt-6.1-sol and gemini-3.8-flash, each provider debating once per side. Prompts are
as of `master` at `ab841866`; only the turn prompt's "Length guidance" line (and, except for `current`,
the system prompt's "compact" line) changes per condition.

| Mechanism | What the turn prompt says (opening, concise) | Within 20% of target |
| --- | --- | --- |
| current | Today's text: "Keep this as a compact opening. Make the core case in 2-3 short paragraphs…" | 4 of 27 (median 1.59x the default target) |
| words | "about 100 words (between 85 and 115)" | 54 of 54 |
| time | "you have 40 seconds of speaking time…" | 52 of 54 |
| structure | "one paragraph of 5 sentences" | 7 of 54 |

Word targets moved length 3.4x from concise to verbose (intended 3.5x) and held on every provider and
persona tested. No speech mentioned its word count or time. None of the 189 speeches was cut off: no
turn stopped on the token limit and every spoken text ends on a full sentence. Limits: one motion, one
run, text mode only (output-token safety cap 6144), three personas, and persona voice at each level is
not yet judged. See `length-report.md` for the full tables; `npm run test:debate-length:report` with
`DEBATE_EVAL_OUT` set to this folder re-renders it from `length.json` without calling any model.

## Earlier word limits and cut-off speeches

Numeric limits were in the prompt twice before, and both times they shipped next to a tight token cap:

- Until `b02dd8e6` (2025-09-12) the prompt said "concise (120-180 words)" and Gemini had a default
  2048-token output cap. That commit removed both, with the comment "Do not enforce numeric word bounds;
  keep guidance general to avoid truncation".
- `314f89db` (2026-05-24) added "Length: 154-220 words maximum" together with a token cap of
  `max(320, 2.2 x maxWords)`, 484 tokens for an opening, which could only lower any existing cap.
  `3072243a` (2026-05-26) replaced the numbers with qualitative text and raised the text cap to 6144.
- `8afe6796` (2026-06-02) diagnosed voice speeches cut off mid-sentence: the voice cap (2.5 x maxWords)
  "was used as a length control in the wrong unit". Since then the cap is a fixed safety net (6144 text,
  1536 voice), and a token-limit finish pauses the debate on a retry card instead of showing a partial.

In each case the word limit and the cap changed together, so the history alone cannot say which one cut
speeches off. This screen separates them for text mode: word targets with the current cap cut nothing.
Voice mode is not yet tested; there the 1536-token cap may also have to cover reasoning tokens on
ChatGPT and Gemini (the adapters send it as `max_output_tokens` / `maxOutputTokens`).
