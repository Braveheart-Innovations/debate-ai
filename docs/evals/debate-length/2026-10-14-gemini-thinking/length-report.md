# Debate length experiment

Run 2026-10-14T07:24:46.786Z. Motion: "This house would ban private cars from city centres". Oxford 1v1, text mode (output-token safety cap 6144), web search as in the app. Each debate ran both openings and the Affirmative floor speech; the Negative is always Default. 24 debates, 68 calls, 66 speeches measured. "Ratio" is words divided by the level's target (1.00 = on target); "within" counts speeches within 20% of target. "Cut off" counts turns that stopped on the token limit or failed, plus speeches whose spoken text ends mid-sentence. "Over audio limit" counts speeches whose spoken text exceeds the 3000-character text-to-speech budget, which the app trims to the last full sentence. `current` is today's prompt, measured against the default targets.

## By condition

| Mechanism | Level | Opening target | Opening words: median (range) | Floor target | Floor words: median (range) | Median ratio | Within | Cut off | Over audio limit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| current | default | 190 | 269 (207-304) | 150 | 294.5 (214-314) | 1.44 | 2/24 | 0/24 | 0/24 (longest 2247) |
| words | default | 190 | 188.5 (181-199) | 150 | 146 (137-151) | 0.99 | 21/21 | 1/22 | 0/21 (longest 1515) |
| words | verbose | 350 | 338.5 (327-353) | 260 | 253 (242-265) | 0.97 | 21/21 | 1/22 | 0/21 (longest 2580) |

Cut-off speeches:

- words/default/george-on-google, Affirmative Opening Statement: interrupted (token_limit)
- words/verbose/kai-on-google, Affirmative Opening Statement: interrupted (token_limit)

## Does the level move the length?

| Mechanism | Levels | Opening | Floor speech |
| --- | --- | --- | --- |
| words | default to verbose | 1.8x (target 1.8x) | 1.7x (target 1.7x) |

## Output tokens against the 6144-token cap

Per provider response: median hidden reasoning tokens (max), and the largest reasoning plus visible output. Claude runs without extended thinking, so it reports no reasoning.

| Condition | Gemini |
| --- | --- |
| current/default | 904 (max 7004); peak 7358 |
| words/default | 2280.5 (max 18172); peak 18402 |
| words/verbose | 3394 (max 16353); peak 16353 |

Responses that did not finish normally:

- words/default/george-on-google, Affirmative Opening Statement: google finished "MAX_TOKENS" after 5899 reasoning and 241 visible tokens
- words/verbose/kai-on-google, Affirmative Opening Statement: google finished "MAX_TOKENS" after 16353 reasoning and 0 visible tokens

## Median ratio by provider

| Condition | Gemini |
| --- | --- |
| current/default | 1.44 |
| words/default | 0.99 |
| words/verbose | 0.97 |

## Median ratio by persona (Affirmative speeches; Negative is Default)

| Condition | Default | Bestie | Brody | Devlin | George | Kai | Prof. Sage | Scout | Negative (Default) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| current/default | 1.58 | 1.67 | 1.41 | 1.51 | 1.80 | 1.81 | 1.76 | 1.55 | 1.36 |
| words/default | 0.98 | 0.97 | 0.97 | 0.99 | n/a | 0.97 | 0.96 | 1.02 | 1.01 |
| words/verbose | 0.94 | 1.01 | 0.98 | 1.00 | 0.98 | n/a | 0.97 | 0.95 | 0.96 |

Stopped debates: words/default/george-on-google (Affirmative Opening Statement interrupted: token_limit); words/verbose/kai-on-google (Affirmative Opening Statement interrupted: token_limit).
