# Gemini at low thinking with word targets: 2026-10-14

The check for the 2.4 length change (Phases 1 and 2): word targets in the turn prompt, the app's
Speech length setting, and debate turns asking Gemini for "low" thinking. It reruns the
[Gemini thinking check](../2026-10-14-gemini-thinking/) on the shipped prompt: Gemini 3.8 Flash
against itself, text mode (6144-token cap), all 8 personas as the Affirmative, `current` (the app's
own prompt) at each Speech length level. 24 debates, 72 calls. Then gpt-6.1-sol judged the 48
Affirmative speeches blind with rubric v1: 48 calls.

    DEBATE_LENGTH_MECHANISMS=current DEBATE_LENGTH_LEVELS=concise,default,verbose \
      DEBATE_LENGTH_PERSONAS=default,bestie,brody,devlin,george,kai,prof_sage,scout \
      DEBATE_LENGTH_PAIRINGS=google-google npm run test:debate-length:live
    npm run test:debate-length:judge

Every request carried the 6144 cap, the `reasoningEffort: 'low'` hint and the app's own length line.

## Length and reasoning

| Level | Opening: median words (target) | Floor speech: median words (target) | Within 20% | Stopped | Reasoning tokens per turn: median (max) |
| --- | --- | --- | --- | --- | --- |
| concise | 102.5 (100) | 86.5 (80) | 24 of 24 | 0 | 0 (0) |
| default | 189 (190) | 150.5 (150) | 24 of 24 | 0 | 0 (0) |
| verbose | 337 (350) | 256 (260) | 24 of 24 | 0 | 0 (0) |

Against the earlier check (no thinking level in text mode): today's qualitative prompt reasoned a
median 904 tokens per turn, word targets 2,280 (default) and 3,394 (verbose), and 2 of 44 word-target
turns stopped on the token limit. At "low", Gemini 3.8 Flash reported no thinking tokens on any of the
72 responses (no `thoughtsTokenCount`), all 72 finished with `STOP`, and the largest response was 449
tokens. The longest verbose speech was 2,599 of the 3,000 characters one audio clip holds.

## Persona attribution (blind, rubric v1; chance 13%)

| Level | This run (Gemini) | Confirming run, Gemini speeches | Confirming run, all providers |
| --- | --- | --- | --- |
| concise | 15 of 16 (94%) | 14 of 16 | 40 of 48 (83%) |
| default | 14 of 16 (88%) | 14 of 16 | 40 of 48 (83%) |
| verbose | 16 of 16 (100%) | 16 of 16 | 41 of 47 (87%) |

Low thinking did not flatten the personas. The three misreads were Devlin (twice) and Kai read as
Default, the confusions the confirming run also showed. Each persona has 2 speeches per level here, so
a difference of one is noise. The judge scores persona voice only, not argument quality.

## A fault in the earlier mirror check

In the earlier Gemini thinking check both debaters had the participant id `google`, so the persona map
collapsed to the Negative's Default: all 68 speeches ran as "Gemini (Default)" (see its transcripts).
Adapters also tell their own speeches from the opponent's by that id, so each side's history (from
the code, not a record) presented the other side's speeches as its own. Its length and token numbers
stand, but it did not vary the persona. The harness now gives mirror and team debaters their own ids
and names ("Gemini 1", "Gemini 2"), as the app does; this run's transcripts show each persona.
