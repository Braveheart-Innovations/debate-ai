# Debate length confirming run: 2026-10-14

Do word targets hold for all eight personas at concise, default and verbose, and do the personas stay
recognisable at each length? Text mode, the `words` mechanism, default at the app's intended length
(openings 190 words, floor speeches 150). 72 debates on claude-sonnet-5-5, gpt-6.1-sol and
gemini-3.8-flash, each provider debating once per side; 215 debate calls (one debate stopped early).
Then gpt-6.1-sol judged the 143 Affirmative speeches blind with the persona eval's rubric v1
attribution prompt: 143 calls.

    DEBATE_LENGTH_MECHANISMS=words DEBATE_LENGTH_LEVELS=concise,default,verbose \
      DEBATE_LENGTH_PERSONAS=default,bestie,brody,devlin,george,kai,prof_sage,scout \
      npm run test:debate-length:live
    npm run test:debate-length:judge

## Length

| Level | Opening: median words (target) | Floor speech: median words (target) | Within 20% | Cut off |
| --- | --- | --- | --- | --- |
| concise | 104 (100) | 83 (80) | 72 of 72 | 0 |
| default | 200.5 (190) | 157 (150) | 72 of 72 | 0 |
| verbose | 358 (350) | 265 (260) | 70 of 70 | 1 (token limit) |

Every persona stayed within 1.01-1.06x of target at every level. One turn stopped on the 6144-token
limit: the Default Negative's verbose opening on Gemini, after 201 words of speech (roughly 260
tokens), so most of the budget went to something other than visible text; hidden reasoning is the
likely sink. In text mode the app sets no Gemini thinking level (`geminiGenerationConfig.ts` only sets
one under a 2048-token cap). This run did not record reasoning tokens, so neither the sink nor whether
the word target drove it is established. The length harness records them from 2026-10-14 on.

## Persona attribution (blind, rubric v1; chance 13%)

| Level | All providers | Claude and Gemini only |
| --- | --- | --- |
| concise | 40 of 48 (83%) | 28 of 32 |
| default | 40 of 48 (83%) | 28 of 32 |
| verbose | 41 of 47 (87%) | 30 of 31 |

The 2026-10-13 baseline (today's prompt, 237-477 words, Claude and Gemini only) scored 29 of 32, so
shorter speeches did not measurably flatten the personas. ChatGPT, which did not debate in the
baseline, is the weakest debater here (12, 12 and 11 of 16). George, Prof. Sage, Scout and Brody were
recognised almost every time; Devlin read as Default in 4 of 6 concise speeches; Bestie was the weakest
overall (11 of 18), read as Default or Devlin; Default itself read as Prof. Sage or Devlin in 3 of 6
verbose speeches. Each persona has 6 speeches per level, so a difference of one or two is noise.
