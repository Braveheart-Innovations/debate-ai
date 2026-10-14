# Debate persona prompt capture

Captured 2026-10-14T22:01:52.987Z by `__tests__/integration/debatePromptCapture.test.ts`. Motion: "This house would ban private cars from city centres". Oxford 1v1, all 6 speeches per run. Each persona argues Affirmative against a Default Negative; `george-vs-kai-*` pairs two personas.

## System prompt composition (Affirmative Opening Statement, Default opponent)

| Persona | Total words | Format words | Own persona words | Opponent words | Tone tags |
| --- | --- | --- | --- | --- | --- |
| Default | 239 | 205 | 15 (6%) | 12 | [Style: formal, professional tone; serious, focused responses] |
| Bestie | 390 | 205 | 153 (39%) | 12 | [Style: serious, focused responses; prioritize emotional acknowledgment; keep explanations accessible] [Debate style: use emotional appeals and narrative; gentle, collaborative approach] |
| Brody | 391 | 205 | 155 (40%) | 12 | [Style: casual, conversational language; serious, focused responses; enthusiastic, energetic; keep explanations accessible] [Debate style: use emotional appeals and narrative] |
| Devlin | 383 | 205 | 144 (38%) | 12 | [Style: formal, professional tone; serious, focused responses; use technical depth] [Debate style: focus on logical arguments and evidence; stand firm on positions] |
| George | 436 | 205 | 195 (45%) | 12 | [Style: casual, conversational language; include wit and humor; enthusiastic, energetic] [Debate style: use emotional appeals and narrative; assertive, direct challenges; stand firm on positions] |
| Kai | 394 | 205 | 159 (40%) | 12 | [Style: formal, professional tone; serious, focused responses; use technical depth] [Debate style: focus on logical arguments and evidence] |
| Prof. Sage | 384 | 205 | 149 (39%) | 12 | [Style: formal, professional tone; serious, focused responses; use technical depth] [Debate style: focus on logical arguments and evidence] |
| Scout | 360 | 205 | 132 (37%) | 12 | [Style: prioritize emotional acknowledgment] [Debate style: balance logic with emotional resonance] |

With a persona opponent (George vs Kai), George's opening system prompt is 583 words: 195 his own persona, 159 Kai's.

## Temperature sent on each provider default model

| Persona | Persona temperature | Claude (claude-sonnet-5-5) | ChatGPT (gpt-6.1-sol) | Gemini (gemini-3.8-flash) |
| --- | --- | --- | --- | --- |
| Default | 0.7 | not sent | 1 | 0.7 |
| Bestie | 0.75 | not sent | 1 | 0.75 |
| Brody | 0.8 | not sent | 1 | 0.8 |
| Devlin | 0.65 | not sent | 1 | 0.65 |
| George | 0.9 | not sent | 1 | 0.9 |
| Kai | 0.5 | not sent | 1 | 0.5 |
| Prof. Sage | 0.4 | not sent | 1 | 0.4 |
| Scout | 0.8 | not sent | 1 | 0.8 |

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
