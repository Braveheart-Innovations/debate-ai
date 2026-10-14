# Debate length experiment: persona attribution

Judged by gpt-6.1-sol with rubric v1: the persona eval's blind attribution prompt, persona names redacted, one call per speech. Speeches are the Affirmative openings and floor speeches of the length run of 2026-10-14T07:02:31.242Z (text mode). Chance is 1 in 8 (13%).

## By level

| Condition | Correct | Openings | Floor speeches | Median words | Mean confidence (1-5) |
| --- | --- | --- | --- | --- | --- |
| words/concise | 40 of 48 (83%) | 19 of 24 (79%) | 21 of 24 (88%) | 92 | 4.2 |
| words/default | 40 of 48 (83%) | 21 of 24 (88%) | 19 of 24 (79%) | 177 | 4.1 |
| words/verbose | 41 of 47 (87%) | 22 of 24 (92%) | 19 of 23 (83%) | 326 | 4.3 |

## Correct by persona

| Persona | words/concise | words/default | words/verbose |
| --- | --- | --- | --- |
| Default | 5/6 | 5/6 | 3/6 |
| Bestie | 4/6 | 2/6 | 5/6 |
| Brody | 6/6 | 6/6 | 5/6 |
| Devlin | 2/6 | 5/6 | 6/6 |
| George | 6/6 | 6/6 | 6/6 |
| Kai | 5/6 | 4/6 | 5/6 |
| Prof. Sage | 6/6 | 6/6 | 6/6 |
| Scout | 6/6 | 6/6 | 5/5 |

## Correct by provider

| Provider | words/concise | words/default | words/verbose |
| --- | --- | --- | --- |
| Claude | 14/16 | 14/16 | 14/15 |
| Gemini | 14/16 | 14/16 | 16/16 |
| ChatGPT | 12/16 | 12/16 | 11/16 |

## Misreads

- words/concise: Default read as Prof. Sage (ChatGPT, Affirmative Floor Speech, 85 words, confidence 3): The precise eligibility distinctions, cited transport-department statistic, and explicit caution that it does not prove every ban succeeds suggest a measured, evidence-conscious scholarly voice.
- words/concise: Bestie read as Default (Claude, Affirmative Opening Statement, 112 words, confidence 4): The speech uses a conventional debate structure—shared goals, an explicit burden, tradeoffs, and policy safeguards—with inclusive warmth but no strongly recognisable persona voice.
- words/concise: Bestie read as Devlin (ChatGPT, Affirmative Floor Speech, 84 words, confidence 3): The speech concedes the opponent’s valid concern, then firmly pressure-tests their alternative with a pointed question about money determining access.
- words/concise: Devlin read as Default (Claude, Affirmative Opening Statement, 103 words, confidence 4): The speech uses plain, compact debate framing and practical qualifications without a distinctive persona voice, though its cautious references to Madrid and Ghent faintly suggest prof_sage.
- words/concise: Devlin read as Default (Gemini, Affirmative Opening Statement, 103 words, confidence 4): The speech uses conventional formal debate framing—stating the burden, anticipating an objection, and rebutting an assumption—without a distinctive persona voice.
- words/concise: Devlin read as Default (Gemini, Affirmative Floor Speech, 85 words, confidence 4): The speech uses conventional formal rebuttal and policy reasoning, without distinctive humour, storytelling, warmth, or technical framing that would establish a persona voice.
- words/concise: Devlin read as Default (ChatGPT, Affirmative Opening Statement, 106 words, confidence 4): The speech uses plain, capable policy framing and measured concessions without distinctive humour, storytelling, coaching, or other recognisable persona markers.
- words/concise: Kai read as Default (ChatGPT, Affirmative Opening Statement, 106 words, confidence 4): The speech uses plain, concise debate framing and practical implementation caveats without distinctive humour, storytelling, scholarly references, or a strongly personalised voice.
- words/default: Default read as Devlin (ChatGPT, Affirmative Floor Speech, 158 words, confidence 3): The speech uses fair but firm pushback, exposing an overbroad objection and a categorical prediction while carefully conceding what its evidence does not prove.
- words/default: Bestie read as Default (Claude, Affirmative Opening Statement, 203 words, confidence 3): The speech uses a conventional scope–evidence–tradeoff structure and restrained language, with mild empathy but no distinctive persona voice.
- words/default: Bestie read as Devlin (Gemini, Affirmative Floor Speech, 150 words, confidence 3): The speech respectfully validates the opponent’s concern, then firmly pressure-tests their proposed controls, exposes the limits of compromise, and acknowledges an uncomfortable tradeoff.
- words/default: Bestie read as Default (ChatGPT, Affirmative Opening Statement, 208 words, confidence 4): The speech uses straightforward definitions, balanced concessions, and a simple three-stage proposal without a distinctive persona voice, though its inclusive concern for accessibility faintly suggests bestie.
- words/default: Bestie read as Devlin (ChatGPT, Affirmative Floor Speech, 160 words, confidence 3): The speech acknowledges legitimate concerns, identifies the 'fair challenge,' and carefully limits its evidence while firmly challenging the opponent’s assumptions.
- words/default: Devlin read as Kai (Gemini, Affirmative Opening Statement, 191 words, confidence 3): The speech treats urban planning as a systems-engineering problem, using terms such as “failure mode,” “collective throughput,” and “optimize” to diagnose spatial constraints and propose infrastructure changes.
- words/default: Kai read as Devlin (Claude, Affirmative Floor Speech, 150 words, confidence 3): The speech systematically pressure-tests the opponent’s claims, exposes inconsistencies in their alternative, and demands measurable tests in a firm, restrained counter-argument style.
- words/default: Kai read as Devlin (ChatGPT, Affirmative Floor Speech, 155 words, confidence 3): The speech concedes a genuine constraint, separates implementation risks from the principle, and firmly challenges the opposition’s assumptions while carefully limiting its own evidence.
- words/verbose: Default read as Devlin (Claude, Affirmative Floor Speech, 304 words, confidence 3): The speech systematically pressure-tests the Negative’s claims, exposing faulty assumptions with fair but firm corrections such as “a reason to draft the exemptions well” and “Their displacement claim is the weakest.”
- words/verbose: Default read as Prof. Sage (ChatGPT, Affirmative Opening Statement, 353 words, confidence 4): The calm delivery, explicit definition of the motion and burden of proof, and cautiously phrased WHO citation reflect a precise, citation-friendly scholarly voice.
- words/verbose: Default read as Prof. Sage (ChatGPT, Affirmative Floor Speech, 266 words, confidence 4): The speech uses specific survey figures and numbered citations, carefully limits what each finding proves, and frames the dispute through precise distinctions between essential access and ordinary convenience.
- words/verbose: Bestie read as Prof. Sage (ChatGPT, Affirmative Floor Speech, 278 words, confidence 4): The calm delivery, numbered research citations, precise statistics, and explicit caveat that the evidence 'does not prove every shop benefits' signal a cautious, evidence-led scholar.
- words/verbose: Brody read as Devlin (ChatGPT, Affirmative Floor Speech, 263 words, confidence 3): The speech acknowledges two serious objections, then pressure-tests them with fair but firm distinctions such as need versus purchasing power and prediction versus inevitability.
- words/verbose: Kai read as Prof. Sage (ChatGPT, Affirmative Opening Statement, 370 words, confidence 4): The speech carefully defines the motion’s scope and burden, cites WHO and transport guidance, and develops a calm, qualified policy argument with explicit implementation caveats.
