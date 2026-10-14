# Gemini reasoning under word targets: 2026-10-14

Why did a verbose Gemini turn in the [confirming run](../2026-10-14-confirm/) stop on the 6144-token
limit after 201 words? Gemini 3.8 Flash against itself, text mode, all 8 personas, today's prompt
(`current`) against word targets at default and verbose: 24 debates, 68 calls (two debates stopped
early). The harness recorded each response's reasoning and visible tokens from the raw API body.

    DEBATE_LENGTH_MECHANISMS=current,words DEBATE_LENGTH_LEVELS=default,verbose \
      DEBATE_LENGTH_PERSONAS=default,bestie,brody,devlin,george,kai,prof_sage,scout \
      DEBATE_LENGTH_PAIRINGS=google-google npm run test:debate-length:live

| Condition | Reasoning tokens per turn: median (max) | Turns stopped on the token limit | Within 20% of target |
| --- | --- | --- | --- |
| Today's prompt | 904 (7004) | 0 of 24 | 2 of 24 |
| Word target, default | 2280.5 (18172) | 1 of 22 | 21 of 21 |
| Word target, verbose | 3394 (16353) | 1 of 22 | 21 of 21 |

Word targets make Gemini reason 2.5 to 3.8 times longer than today's qualitative text. The two stopped
turns: George's default opening after 5899 reasoning and 241 visible tokens (6140 of 6144), and Kai's
verbose opening after 16353 reasoning tokens and no visible text. Across every run so far, word targets
stopped 3 of 134 Gemini text turns (screen, confirming run and this one); today's prompt stopped none
of 57 (persona baseline, screen and this one).

In text mode the app sets no Gemini thinking level (`geminiGenerationConfig.ts` sets one only under a
2048-token cap); voice mode runs at "low", and the 2026-10-14 voice check had no stopped turns.

Unexplained: five responses reported more reasoning tokens than the 6144 cap and still finished
normally (one under today's prompt). All five were Affirmative openings, the first speech of a
debate, where web search runs; how Gemini counts reasoning across search steps is not established.

This also bears on the history in the [2026-10-13 screen](../2026-10-13-screen/README.md): the earlier
word limits shipped with tight caps (Gemini 2048 in 2025), and on Gemini word targets themselves
raise the reasoning that such a cap has to cover.
