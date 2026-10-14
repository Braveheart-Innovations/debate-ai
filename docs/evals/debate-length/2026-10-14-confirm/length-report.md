# Debate length experiment

Run 2026-10-14T07:02:31.242Z. Motion: "This house would ban private cars from city centres". Oxford 1v1, text mode (output-token safety cap 6144), web search as in the app. Each debate ran both openings and the Affirmative floor speech; the Negative is always Default. 72 debates, 215 calls, 214 speeches measured. "Ratio" is words divided by the level's target (1.00 = on target); "within" counts speeches within 20% of target. "Cut off" counts turns that stopped on the token limit or failed, plus speeches whose spoken text ends mid-sentence. "Over audio limit" counts speeches whose spoken text exceeds the 3000-character text-to-speech budget, which the app trims to the last full sentence. `current` is today's prompt, measured against the default targets.

## By condition

| Mechanism | Level | Opening target | Opening words: median (range) | Floor target | Floor words: median (range) | Median ratio | Within | Cut off | Over audio limit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| words | concise | 100 | 104 (95-114) | 80 | 83 (75-89) | 1.04 | 72/72 | 0/72 | 0/72 (longest 824) |
| words | default | 190 | 200.5 (180-215) | 150 | 157 (145-173) | 1.05 | 72/72 | 0/72 | 0/72 (longest 1578) |
| words | verbose | 350 | 358 (324-412) | 260 | 265 (248-304) | 1.02 | 70/70 | 1/71 | 0/70 (longest 2784) |

Cut-off speeches:

- words/verbose/scout-on-claude, Negative Opening Statement: interrupted (token_limit)

## Does the level move the length?

| Mechanism | Levels | Opening | Floor speech |
| --- | --- | --- | --- |
| words | concise to verbose | 3.4x (target 3.5x) | 3.2x (target 3.3x) |

## Median ratio by provider

| Condition | Claude | Gemini | ChatGPT |
| --- | --- | --- | --- |
| words/concise | 1.04 | 1.02 | 1.06 |
| words/default | 1.07 | 1.00 | 1.06 |
| words/verbose | 1.11 | 0.98 | 1.02 |

## Median ratio by persona (Affirmative speeches; Negative is Default)

| Condition | Default | Bestie | Brody | Devlin | George | Kai | Prof. Sage | Scout | Negative (Default) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| words/concise | 1.05 | 1.05 | 1.02 | 1.04 | 1.04 | 1.04 | 1.05 | 1.02 | 1.04 |
| words/default | 1.05 | 1.06 | 1.03 | 1.06 | 1.06 | 1.04 | 1.05 | 1.05 | 1.05 |
| words/verbose | 1.02 | 1.02 | 1.01 | 1.06 | 1.02 | 1.06 | 1.01 | 1.02 | 1.03 |

Stopped debates: words/verbose/scout-on-claude (Negative Opening Statement interrupted: token_limit).
