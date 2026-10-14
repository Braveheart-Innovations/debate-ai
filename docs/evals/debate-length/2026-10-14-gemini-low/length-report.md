# Debate length experiment

Run 2026-10-14T22:01:45.727Z. Motion: "This house would ban private cars from city centres". Oxford 1v1, text mode (output-token safety cap 6144), web search as in the app. Each debate ran both openings and the Affirmative floor speech; the Negative is always Default. 24 debates, 72 calls, 72 speeches measured. "Ratio" is words divided by the level's target (1.00 = on target); "within" counts speeches within 20% of target. "Cut off" counts turns that stopped on the token limit or failed, plus speeches whose spoken text ends mid-sentence. "Over audio limit" counts speeches whose spoken text exceeds the 3000-character text-to-speech budget, which the app trims to the last full sentence. `current` is the app's own prompt at that level's Speech length setting (in runs before 2026-10-14: its qualitative length text, measured against the default targets).

## By condition

| Mechanism | Level | Opening target | Opening words: median (range) | Floor target | Floor words: median (range) | Median ratio | Within | Cut off | Over audio limit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| current | concise | 100 | 102.5 (99-111) | 80 | 86.5 (85-89) | 1.05 | 24/24 | 0/24 | 0/24 (longest 865) |
| current | default | 190 | 189 (182-198) | 150 | 150.5 (143-158) | 1.00 | 24/24 | 0/24 | 0/24 (longest 1523) |
| current | verbose | 350 | 337 (324-351) | 260 | 256 (251-262) | 0.97 | 24/24 | 0/24 | 0/24 (longest 2599) |

## Does the level move the length?

| Mechanism | Levels | Opening | Floor speech |
| --- | --- | --- | --- |
| current | concise to verbose | 3.3x (target 3.5x) | 3.0x (target 3.3x) |

## Output tokens against the 6144-token cap

Per provider response: median hidden reasoning tokens (max), and the largest reasoning plus visible output. Claude runs without extended thinking, so it reports no reasoning.

| Condition | Gemini |
| --- | --- |
| current/concise | 0 (max 0); peak 133 |
| current/default | 0 (max 0); peak 244 |
| current/verbose | 0 (max 0); peak 449 |

## Median ratio by provider

| Condition | Gemini |
| --- | --- |
| current/concise | 1.05 |
| current/default | 1.00 |
| current/verbose | 0.97 |

## Median ratio by persona (Affirmative speeches; Negative is Default)

| Condition | Default | Bestie | Brody | Devlin | George | Kai | Prof. Sage | Scout | Negative (Default) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| current/concise | 1.06 | 1.03 | 1.04 | 1.07 | 1.05 | 1.05 | 1.09 | 1.05 | 1.02 |
| current/default | 0.99 | 1.03 | 1.00 | 1.00 | 1.01 | 0.98 | 0.98 | 1.00 | 0.99 |
| current/verbose | 0.97 | 0.97 | 0.96 | 0.98 | 1.00 | 0.99 | 0.97 | 0.97 | 0.96 |

All debates completed.
