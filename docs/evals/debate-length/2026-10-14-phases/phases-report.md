# Debate length: phases beyond openings and floor speeches

Run 2026-10-14T22:04:40.588Z. Motion: "This house would ban private cars from city centres". Text mode (output-token safety cap 6144), web search as in the app, Default persona on both sides, the app's own prompt at each Speech length level. Debates: Oxford 2v2 + Q&A through the summaries (audience questions typed in as in the app), the first three speeches of Standard Lincoln-Douglas and Standard Policy (the constructive and its cross-examination), and the whole short Socratic dialogue; each on every pairing below, with the first provider on the Affirmative. 12 debates, 60 calls, 60 speeches measured. "Ratio" is words divided by the turn's target; "within" counts speeches within 20% of it. "Cut off" counts turns that stopped on the token limit or failed, plus speeches whose spoken text ends mid-sentence.

## By turn

| Turn | Level | Target words | Words: median (range) | Median ratio | Within | Cut off | Claude | Gemini | ChatGPT |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Oxford opening | default | 190 | 201 (187-218) | 1.06 | 6/6 | 0/6 | 1.13 | 1.00 | 1.06 |
| Oxford rebuttal | default | 150 | 154.5 (143-167) | 1.03 | 6/6 | 0/6 | 1.08 | 0.98 | 1.03 |
| Oxford audience-question answer | default | 70 | 73.5 (70-81) | 1.05 | 6/6 | 0/6 | 1.01 | 1.11 | 1.06 |
| Oxford closing | default | 130 | 135.5 (133-145) | 1.04 | 6/6 | 0/6 | 1.10 | 1.04 | 1.03 |
| Lincoln-Douglas constructive | default | 190 | 212 (188-224) | 1.12 | 3/3 | 0/3 | 1.18 | 0.99 | 1.12 |
| Lincoln-Douglas cross-examination questions | default | 75 | 80 (74-92) | 1.07 | 2/3 | 0/3 | 1.23 | 0.99 | 1.07 |
| Lincoln-Douglas cross-examination answers | default | 95 | 98 (96-99) | 1.03 | 3/3 | 0/3 | 1.01 | 1.04 | 1.03 |
| Policy constructive | default | 190 | 209 (190-217) | 1.10 | 3/3 | 0/3 | 1.14 | 1.00 | 1.10 |
| Policy cross-examination questions | default | 75 | 76 (69-79) | 1.01 | 3/3 | 0/3 | 1.05 | 0.92 | 1.01 |
| Policy cross-examination answers | default | 95 | 102 (98-103) | 1.07 | 3/3 | 0/3 | 1.07 | 1.08 | 1.03 |
| Socratic opening | default | 75 | 75.5 (70-83) | 1.01 | 6/6 | 0/6 | 1.00 | 1.05 | 1.01 |
| Socratic question | default | 75 | 74 (66-78) | 0.99 | 6/6 | 0/6 | 0.96 | 0.99 | 0.97 |
| Socratic synthesis | default | 95 | 94.5 (92-102) | 0.99 | 6/6 | 0/6 | 1.02 | 1.03 | 0.97 |

## Output tokens against the 6144-token cap

Per provider response: median hidden reasoning tokens (max), and the largest reasoning plus visible output. Claude runs without extended thinking, so it reports no reasoning.

| Provider | Responses | Reasoning tokens: median (max) | Peak tokens |
| --- | --- | --- | --- |
| Claude | 20 | not reported | 868 |
| Gemini | 20 | 0 (max 105) | 328 |
| ChatGPT | 20 | 45 (max 85) | 366 |

All debates completed.
