# Debate length experiment

Run 2026-10-14T02:18:36.416Z. Motion: "This house would ban private cars from city centres". Oxford 1v1, text mode, web search as in the app. Each debate ran both openings and the Affirmative floor speech; the Negative is always Default. 63 debates, 189 calls, 189 speeches measured. "Ratio" is words divided by the level's target (1.00 = on target); "within" counts speeches within 20% of target. `current` is today's prompt, measured against the default targets.

## By condition

| Mechanism | Level | Opening target | Opening words: median (range) | Floor target | Floor words: median (range) | Median ratio | Within |
| --- | --- | --- | --- | --- | --- | --- | --- |
| current | default | 190 | 266.5 (204-391) | 150 | 273 (235-350) | 1.59 | 4/27 |
| words | concise | 100 | 104 (96-108) | 80 | 82 (78-95) | 1.04 | 27/27 |
| words | verbose | 350 | 355 (323-404) | 260 | 270 (254-300) | 1.02 | 27/27 |
| time | concise | 100 | 103.5 (92-168) | 80 | 85 (70-92) | 1.05 | 25/27 |
| time | verbose | 350 | 343.5 (293-395) | 260 | 257 (226-292) | 0.99 | 27/27 |
| structure | concise | 100 | 159.5 (131-262) | 80 | 144 (126-246) | 1.67 | 0/27 |
| structure | verbose | 350 | 470 (315-546) | 260 | 367 (283-505) | 1.34 | 7/27 |

## Does the level move the length?

| Mechanism | Levels | Opening | Floor speech |
| --- | --- | --- | --- |
| words | concise to verbose | 3.4x (target 3.5x) | 3.3x (target 3.3x) |
| time | concise to verbose | 3.3x (target 3.5x) | 3.0x (target 3.3x) |
| structure | concise to verbose | 2.9x (target 3.5x) | 2.5x (target 3.3x) |

## Median ratio by provider

| Condition | Claude | Gemini | ChatGPT |
| --- | --- | --- | --- |
| current/default | 1.95 | 1.51 | 1.25 |
| words/concise | 1.03 | 1.02 | 1.05 |
| words/verbose | 1.13 | 0.98 | 1.02 |
| time/concise | 1.07 | 0.99 | 1.05 |
| time/verbose | 1.09 | 0.95 | 0.97 |
| structure/concise | 2.37 | 1.60 | 1.58 |
| structure/verbose | 1.41 | 1.32 | 1.25 |

## Median ratio by persona (Affirmative speeches; Negative is Default)

| Condition | Default | Brody | Kai | Negative (Default) |
| --- | --- | --- | --- | --- |
| current/default | 1.78 | 1.57 | 1.91 | 1.39 |
| words/concise | 1.05 | 1.01 | 1.06 | 1.02 |
| words/verbose | 1.03 | 1.01 | 1.03 | 1.02 |
| time/concise | 1.02 | 1.06 | 1.04 | 1.04 |
| time/verbose | 1.03 | 0.97 | 1.02 | 0.99 |
| structure/concise | 1.78 | 1.47 | 2.04 | 1.64 |
| structure/verbose | 1.38 | 1.14 | 1.54 | 1.34 |

All debates completed.
