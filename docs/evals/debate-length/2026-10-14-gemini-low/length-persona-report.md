# Debate length experiment: persona attribution

Judged by gpt-6.1-sol with rubric v1: the persona eval's blind attribution prompt, persona names redacted, one call per speech. Speeches are the Affirmative openings and floor speeches of the length run of 2026-10-14T22:01:45.727Z (text mode). Chance is 1 in 8 (13%).

## By level

| Condition | Correct | Openings | Floor speeches | Median words | Mean confidence (1-5) |
| --- | --- | --- | --- | --- | --- |
| current/concise | 15 of 16 (94%) | 7 of 8 (88%) | 8 of 8 (100%) | 94 | 4.4 |
| current/default | 14 of 16 (88%) | 8 of 8 (100%) | 6 of 8 (75%) | 173 | 4.5 |
| current/verbose | 16 of 16 (100%) | 8 of 8 (100%) | 8 of 8 (100%) | 293 | 4.5 |

## Correct by persona

| Persona | current/concise | current/default | current/verbose |
| --- | --- | --- | --- |
| Default | 2/2 | 2/2 | 2/2 |
| Bestie | 2/2 | 2/2 | 2/2 |
| Brody | 2/2 | 2/2 | 2/2 |
| Devlin | 1/2 | 1/2 | 2/2 |
| George | 2/2 | 2/2 | 2/2 |
| Kai | 2/2 | 1/2 | 2/2 |
| Prof. Sage | 2/2 | 2/2 | 2/2 |
| Scout | 2/2 | 2/2 | 2/2 |

## Correct by provider

| Provider | current/concise | current/default | current/verbose |
| --- | --- | --- | --- |
| Gemini | 15/16 | 14/16 | 16/16 |

## Misreads

- current/concise: Devlin read as Default (Gemini, Affirmative Opening Statement, 105 words, confidence 4): The speech uses conventional debate framing and impersonal policy language without a distinctive persona voice, though its opening concession followed by a challenged assumption mildly suggests Devlin.
- current/default: Devlin read as Default (Gemini, Affirmative Floor Speech, 152 words, confidence 3): The speech uses conventional formal rebuttal and empirical examples without a distinctive persona voice, though its focus on a hidden assumption and a failure mode faintly suggests Devlin.
- current/default: Kai read as Default (Gemini, Affirmative Floor Speech, 145 words, confidence 3): The speech uses conventional formal rebuttal and empirical examples without a distinctive persona voice, though its emphasis on throughput, capacity, and network constraints faintly suggests kai.
