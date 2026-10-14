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
persona tested. No speech mentioned its word count or time. Limits: one motion, one run, three personas,
and persona voice at each level is not yet judged. See `length-report.md` for the full tables.
