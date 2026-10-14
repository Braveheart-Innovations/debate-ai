# Debate length experiment

Run 2026-10-14T06:55:42.931Z. Motion: "This house would ban private cars from city centres". Oxford 1v1, voice mode (output-token safety cap 1536), web search as in the app. Each debate ran both openings and the Affirmative floor speech; the Negative is always Default. 27 debates, 81 calls, 81 speeches measured. "Ratio" is words divided by the level's target (1.00 = on target); "within" counts speeches within 20% of target. "Cut off" counts turns that stopped on the token limit or failed, plus speeches whose spoken text ends mid-sentence. "Over audio limit" counts speeches whose spoken text exceeds the 3000-character text-to-speech budget, which the app trims to the last full sentence. `current` is today's prompt, measured against the default targets.

## By condition

| Mechanism | Level | Opening target | Opening words: median (range) | Floor target | Floor words: median (range) | Median ratio | Within | Cut off | Over audio limit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| words | concise | 100 | 102 (92-111) | 80 | 88 (76-93) | 1.04 | 27/27 | 0/27 | 0/27 (longest 759) |
| words | default | 190 | 200.5 (181-211) | 150 | 154 (147-163) | 1.04 | 27/27 | 0/27 | 0/27 (longest 1545) |
| words | verbose | 350 | 351.5 (329-395) | 260 | 264 (252-305) | 1.01 | 27/27 | 0/27 | 0/27 (longest 2683) |

## Does the level move the length?

| Mechanism | Levels | Opening | Floor speech |
| --- | --- | --- | --- |
| words | concise to verbose | 3.4x (target 3.5x) | 3.0x (target 3.3x) |

## Median ratio by provider

| Condition | Claude | Gemini | ChatGPT |
| --- | --- | --- | --- |
| words/concise | 1.02 | 1.02 | 1.05 |
| words/default | 1.07 | 1.01 | 1.05 |
| words/verbose | 1.09 | 0.97 | 1.01 |

## Median ratio by persona (Affirmative speeches; Negative is Default)

| Condition | Default | Brody | Kai | Negative (Default) |
| --- | --- | --- | --- | --- |
| words/concise | 1.03 | 1.08 | 1.06 | 1.02 |
| words/default | 1.03 | 1.01 | 1.07 | 1.05 |
| words/verbose | 1.01 | 1.02 | 1.05 | 1.00 |

All debates completed.
