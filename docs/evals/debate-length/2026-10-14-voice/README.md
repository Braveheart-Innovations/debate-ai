# Debate length voice check: 2026-10-14

Do word targets still hold, without cutting speeches off, under voice mode's 1536-token output cap?
Same setup as the [2026-10-13 screen](../2026-10-13-screen/) except: voice mode, the `words` mechanism
only, and all three levels, with default at the app's intended length (openings 190 words, floor
speeches 150). 27 debates and 81 calls on claude-sonnet-5-5, gpt-6.1-sol and gemini-3.8-flash with
Default, Brody and Kai as the Affirmative. Voice mode here changes only the token cap; no audio is
generated. Every request was checked to carry the 1536 cap and its level's length line.

    DEBATE_LENGTH_MECHANISMS=words DEBATE_LENGTH_LEVELS=concise,default,verbose DEBATE_LENGTH_VOICE=1 \
      npm run test:debate-length:live

| Level | Opening: median words (target) | Floor speech: median words (target) | Within 20% | Cut off | Over audio limit |
| --- | --- | --- | --- | --- | --- |
| concise | 102 (100) | 88 (80) | 27 of 27 | 0 | 0 (longest 759 chars) |
| default | 200.5 (190) | 154 (150) | 27 of 27 | 0 | 0 (longest 1545 chars) |
| verbose | 351.5 (350) | 264 (260) | 27 of 27 | 0 | 0 (longest 2683 chars) |

No turn stopped on the token limit, every spoken text ends on a full sentence, and no speech mentioned
its word count or used a list or heading. Verbose's longest speech is 2683 of the 3000 characters one
audio clip allows, so verbose targets much above 350 words would start being trimmed for audio.
Limits: one motion, one run, three personas. See `length-report.md` for the provider and persona tables.
