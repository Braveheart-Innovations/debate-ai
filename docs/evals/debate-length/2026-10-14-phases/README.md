# Speech length beyond openings and floor speeches: 2026-10-14

The earlier length runs measured only Oxford openings and floor speeches. This check covers the other
turns the 2.4 word targets set without measurement: Oxford audience-question answers and summary
speeches, Lincoln-Douglas and Policy cross-examination, and Socratic turns. The app's own prompt at
the default Speech length, text mode, Default persona on both sides, web search as in the app, on
claude-sonnet-5-5, gemini-3.8-flash and gpt-6.1-sol (each provider on the Affirmative once). 12
debates, 60 calls:

- Oxford 2v2 + Q&A through both summaries (8 speeches; an audience question per side is typed in);
- the first three speeches of Standard Lincoln-Douglas and of Standard Policy (the constructive, then
  its cross-examination questions and answers);
- the whole short Socratic dialogue (6 turns).

      npm run test:debate-length:phases

| Turn | Target words | Median words (range) | Within 20% | Cut off |
| --- | --- | --- | --- | --- |
| Oxford audience-question answer | 70 | 73.5 (70-81) | 6 of 6 | 0 |
| Oxford summary (closing) | 130 | 135.5 (133-145) | 6 of 6 | 0 |
| Cross-examination questions (LD and Policy) | 75 | 77.5 (69-92) | 5 of 6 | 0 |
| Cross-examination answers (LD and Policy) | 95 | 98.5 (96-103) | 6 of 6 | 0 |
| Socratic opening question and response | 75 | 75.5 (70-83) | 6 of 6 | 0 |
| Socratic focused question and answer | 75 | 74 (66-78) | 6 of 6 | 0 |
| Socratic synthesis | 95 | 94.5 (92-102) | 6 of 6 | 0 |
| Openings, constructives and first arguments | 190 / 150 | see report | 18 of 18 | 0 |

59 of 60 speeches landed within 20% of target and none was cut off. The miss was Claude's
Lincoln-Douglas cross-examination questions at 92 words against 75 (1.23x). Claude runs longest
(constructives 1.14-1.18x), Gemini closest to target. Every request carried the 6144 cap, the
`reasoningEffort: 'low'` hint and the length line the app gives that turn. Reasoning stayed small:
Gemini a median 0 tokens (max 105), ChatGPT 45 (max 85). Full tables in `phases-report.md`,
speeches in `phases-transcripts.md`, raw data in `phases.json`.

Not measured: these turns at the Brief and Detailed levels, voice mode, and personas other than
Default. Openings and floor speeches are measured at every level (2026-10-13 screen, 2026-10-14
voice check, confirming run and gemini-low).
