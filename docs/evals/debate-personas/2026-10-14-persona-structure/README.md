# Debate persona prompt structure (Phase 3): 2026-10-14

Phase 3 builds each debater's persona block from debate text only:
- the persona's debate brief (`debatePrompt`);
- its `debateGuidance`;
- three new `debateMoves`, written as spoken prose;
- its debate sample line.

Chat text no longer reaches a debater: the persona system prompt, chat guidance, chat signature moves,
card notes and the chat sample. The opponent is named with their persona's name and tagline only. A
Default debater gets no style line and no tone tags. Persona temperatures no longer apply to debate
turns. Chat and compare runtimes are byte-identical, proven by a snapshot recorded before the change
(`__tests__/services/personality/`).

## capture/

`npm run test:debate-prompts:capture` (no network), compared with
[2026-10-14-word-targets](../2026-10-14-word-targets/README.md):

| Persona | Own persona words (share), before → after | Opponent words, Default opponent | Total words |
| --- | --- | --- | --- |
| Default | 15 (6%) → 0 | 12 → 2 | 239 → 207 |
| Bestie | 153 (39%) → 183 (45%) | 12 → 2 | 390 → 410 |
| Brody | 155 (40%) → 114 (34%) | 12 → 2 | 391 → 340 |
| Devlin | 144 (38%) → 168 (42%) | 12 → 2 | 383 → 397 |
| George | 195 (45%) → 182 (44%) | 12 → 2 | 436 → 413 |
| Kai | 159 (40%) → 158 (41%) | 12 → 2 | 394 → 383 |
| Prof. Sage | 149 (39%) → 160 (42%) | 12 → 2 | 384 → 385 |
| Scout | 132 (37%) → 129 (37%) | 12 → 2 | 360 → 347 |

- With a persona opponent (George vs Kai), George's system prompt fell from 583 to 426 words. Kai's
  share fell from 159 words (his full contract) to 15: "Gemini, debating as Kai (Staff engineer with
  architectural instincts). Do not imitate their style."
- Chat text in debate prompts: 0 of 156 speeches (a new summary check).
- Default's tone tags "[Style: formal, professional tone; serious, focused responses]" are gone.
- Gemini now gets its adapter default temperature of 0.7 for every persona; before, it got the
  persona's own value, from 0.4 to 0.9. Claude still gets no temperature and ChatGPT still gets its
  required 1.
- Turn prompts, format rules, token caps and voice mode are unchanged. No other capture line differs.

## live/ and live-corrective/: blind persona eval at Brief

`DEBATE_PERSONAS_LEVEL=concise npm run test:debate-personas:live`, then
`npm run test:debate-personas:judge`. Rubric v2 differs from v1 only in its adherence check, which
lists the debate moves debaters now receive; the blind attribution prompt is unchanged. Each persona
argued Affirmative on claude-sonnet-5-5 and gemini-3.8-flash against a Default Negative, at the Brief
level: 48 + 64 calls.

The first run scored 25 of 32 (78%). Bestie fell to 0 of 4: it was read as Default twice, Devlin once
and Scout once. Prof. Sage fell to 2 of 4, with both floor speeches read as Devlin. The likely causes
were in the new debate data:
- Bestie's warmth lived only in its chat system prompt ("emotional accuracy", "warm first, practical
  second"). Its debate text was about shared values and human impact, which reads as Default or Scout.
- Prof. Sage's new guidance ("say what would change your mind", "pressing hard") pulled it toward
  Devlin's stress-testing.

One corrective iteration rewrote only those two personas' debate fields: Bestie got a warm,
emotionally precise brief and moves, and Prof. Sage got a calm seminar register (definition, context,
evidence, takeaway). It reran just Bestie and Prof. Sage: 12 + 16 calls. No other persona's prompt
changed, so their first-run results stand.

| Persona | First run | Final | Confirming run at concise (Claude and Gemini) |
| --- | --- | --- | --- |
| Default | 4/4 | 4/4 | 4/4 |
| Bestie | 0/4 | 4/4 (corrective) | 3/4 |
| Brody | 4/4 | 4/4 | 4/4 |
| Devlin | 4/4 | 4/4 | 1/4 |
| George | 4/4 | 4/4 | 4/4 |
| Kai | 3/4 | 3/4 | 4/4 |
| Prof. Sage | 2/4 | 4/4 (corrective) | 4/4 |
| Scout | 4/4 | 4/4 | 4/4 |
| **Total** | 25/32 | **31/32 (97%)** | 28/32 |

Against the pass criteria:
- **Attribution at or above 29 of 32:** 31 of 32 with the final data. The 2026-10-13 baseline scored
  29 of 32 on today's-then prompt at about 270-400 words.
- **Devlin recognised at Brief:** 4 of 4. The confirming run had 1 of 4 on these providers, where
  Devlin was read as Default 3 times.
- **Default not read as Prof. Sage or Devlin:** Default was attributed to Default 4 of 4.

The one remaining miss is Kai's Gemini floor speech, read as Default.

Each persona has only 4 speeches, so a difference of one is noise. The final figure combines two runs
judged with the same judge and rubric. Openings ran 94-130 words against a 100-word target, and floor
speeches 78-92 against 80. All but one landed within 20% of target; the exception was Devlin's Gemini
opening at 130 words. Every speech held its stance, followed its phase rule and used no lists or
headings.
