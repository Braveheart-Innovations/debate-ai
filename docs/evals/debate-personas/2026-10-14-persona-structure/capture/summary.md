# Debate persona prompt capture

Captured 2026-10-14T22:35:51.222Z by `__tests__/integration/debatePromptCapture.test.ts`. Motion: "This house would ban private cars from city centres". Oxford 1v1, all 6 speeches per run. Each persona argues Affirmative against a Default Negative; `george-vs-kai-*` pairs two personas.

## System prompt composition (Affirmative Opening Statement, Default opponent)

| Persona | Total words | Format words | Own persona words | Opponent words | Tone tags |
| --- | --- | --- | --- | --- | --- |
| Default | 207 | 205 | 0 (0%) | 2 | none |
| Bestie | 410 | 205 | 183 (45%) | 2 | [Style: serious, focused responses; prioritize emotional acknowledgment; keep explanations accessible] [Debate style: use emotional appeals and narrative; gentle, collaborative approach] |
| Brody | 340 | 205 | 114 (34%) | 2 | [Style: casual, conversational language; serious, focused responses; enthusiastic, energetic; keep explanations accessible] [Debate style: use emotional appeals and narrative] |
| Devlin | 397 | 205 | 168 (42%) | 2 | [Style: formal, professional tone; serious, focused responses; use technical depth] [Debate style: focus on logical arguments and evidence; stand firm on positions] |
| George | 413 | 205 | 182 (44%) | 2 | [Style: casual, conversational language; include wit and humor; enthusiastic, energetic] [Debate style: use emotional appeals and narrative; assertive, direct challenges; stand firm on positions] |
| Kai | 383 | 205 | 158 (41%) | 2 | [Style: formal, professional tone; serious, focused responses; use technical depth] [Debate style: focus on logical arguments and evidence] |
| Prof. Sage | 385 | 205 | 160 (42%) | 2 | [Style: formal, professional tone; serious, focused responses; use technical depth] [Debate style: focus on logical arguments and evidence] |
| Scout | 347 | 205 | 129 (37%) | 2 | [Style: prioritize emotional acknowledgment] [Debate style: balance logic with emotional resonance] |

With a persona opponent (George vs Kai), George's opening system prompt is 426 words: 182 his own persona, 15 Kai's.

## Temperature sent on each provider default model

| Persona | Persona temperature | Claude (claude-sonnet-5-5) | ChatGPT (gpt-6.1-sol) | Gemini (gemini-3.8-flash) |
| --- | --- | --- | --- | --- |
| Default | 0.7 | not sent | 1 | 0.7 |
| Bestie | 0.75 | not sent | 1 | 0.7 |
| Brody | 0.8 | not sent | 1 | 0.7 |
| Devlin | 0.65 | not sent | 1 | 0.7 |
| George | 0.9 | not sent | 1 | 0.7 |
| Kai | 0.5 | not sent | 1 | 0.7 |
| Prof. Sage | 0.4 | not sent | 1 | 0.7 |
| Scout | 0.8 | not sent | 1 | 0.7 |

## Chat text in debate prompts

0 of 156 speeches carry chat or compare persona text (system prompts, chat guidance, signature moves, card notes, chat samples) in their system prompt.

## Turn prompts

0 of 75 persona speeches have the persona's name anywhere in the turn prompt.

## Voice mode vs text mode (George vs Kai, Claude vs Gemini)

| Speech | System prompt | Turn prompt | maxTokens text | maxTokens voice |
| --- | --- | --- | --- | --- |
| Affirmative Opening Statement | same | same | 6144 | 1536 |
| Negative Opening Statement | same | same | 6144 | 1536 |
| Affirmative Floor Speech | same | same | 6144 | 1536 |
| Negative Floor Speech | same | same | 6144 | 1536 |
| Affirmative Closing Speech | same | same | 6144 | 1536 |
| Negative Closing Speech | same | same | 6144 | 1536 |
