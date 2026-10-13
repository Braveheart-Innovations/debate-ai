import { DebatePromptBuilder } from '@/services/debate/DebatePromptBuilder';
import { DEBATE_CONSTANTS } from '@/config/debateConstants';
import type { AI, Message } from '@/types';
import {
  LINCOLN_DOUGLAS_FORMAT,
  OXFORD_FORMAT,
  POLICY_FORMAT,
  SOCRATIC_FORMAT,
} from '@/config/debate/formats';

describe('DebatePromptBuilder', () => {
  const builder = new DebatePromptBuilder();
  const claude: AI = { id: 'claude', provider: 'claude', name: 'Claude', model: 'claude-3' };
  const gpt: AI = { id: 'gpt4', provider: 'openai', name: 'GPT-4o', model: 'gpt-4o' };

  it('creates phase-aware prompts with stance guidance', () => {
    const prompt = builder.buildTurnPrompt({
      topic: 'AI should assist in education.',
      phase: 'rebuttal',
      previousMessage: 'The opponent argued that AI removes teachers.',
      isFinalRound: false,
      guidance: 'Stay factual and cite evidence.',
      format: OXFORD_FORMAT,
      presetId: 'short',
    });

    expect(prompt).toContain('Turn: Rebuttal');
    expect(prompt).toContain('Directly refute');
    expect(prompt).toContain('AI should assist in education.');
    // Personas live in the system prompt, the same way for every persona; the turn prompt
    // carries no persona text and no intensity line that could compete with it.
    expect(prompt).not.toContain('satire');
    expect(prompt).not.toContain('Debate intensity');
    expect(prompt).toContain('Length guidance: Keep this rebuttal brief and targeted');
    expect(prompt).not.toContain('words maximum');
    expect(prompt).toContain(DEBATE_CONSTANTS.PROMPT_MARKERS.PREVIOUS_SPEAKER);
  });

  it('includes orchestrator-provided role briefs in turn prompts', () => {
    const prompt = builder.buildTurnPrompt({
      topic: 'Privacy is dead in the digital age.',
      phase: 'rebuttal',
      format: OXFORD_FORMAT,
      messageLabel: 'Second Affirmative Speech',
      roleBrief: [
        'Role brief: You are the Second Affirmative speaker for Affirmative (FOR).',
        'Teammate: Claude.',
        'Opposing team: GPT-4o, Gemini.',
        'Coordinate with your teammate by extending the shared team case instead of repeating it.',
      ].join('\n'),
    });

    expect(prompt).toContain('Turn: Second Affirmative Speech');
    expect(prompt).toContain('Second Affirmative speaker');
    expect(prompt).toContain('Teammate: Claude');
    expect(prompt).toContain('Opposing team: GPT-4o, Gemini');
    expect(prompt).toContain('Oxford floor debate');
  });

  it('adds Lincoln-Douglas value and criterion constraints', () => {
    const prompt = builder.buildTurnPrompt({
      topic: 'Civil disobedience is morally justified.',
      phase: 'constructive',
      format: LINCOLN_DOUGLAS_FORMAT,
    });

    expect(prompt).toContain('central value and criterion');
    expect(prompt).toContain('Do not drift into a policy plan');
  });

  it('adds Lincoln-Douglas speech-specific contracts for AC, NC/1NR, 1AR, and 2AR', () => {
    const ac = builder.buildTurnPrompt({
      topic: 'Civil disobedience is morally justified.',
      phase: 'constructive',
      format: LINCOLN_DOUGLAS_FORMAT,
      messageLabel: 'Affirmative Constructive (AC)',
    });
    const nc = builder.buildTurnPrompt({
      topic: 'Civil disobedience is morally justified.',
      phase: 'constructive',
      format: LINCOLN_DOUGLAS_FORMAT,
      messageLabel: 'Negative Constructive / 1NR (NC/1NR)',
    });
    const firstAffirmativeRebuttal = builder.buildTurnPrompt({
      topic: 'Civil disobedience is morally justified.',
      phase: 'rebuttal',
      format: LINCOLN_DOUGLAS_FORMAT,
      messageLabel: 'First Affirmative Rebuttal (1AR)',
    });
    const secondAffirmativeRebuttal = builder.buildTurnPrompt({
      topic: 'Civil disobedience is morally justified.',
      phase: 'final_rebuttal',
      format: LINCOLN_DOUGLAS_FORMAT,
      messageLabel: 'Second Affirmative Rebuttal (2AR)',
    });

    expect(ac).toContain('name one central value, state a criterion');
    expect(ac).toContain('Do not offer a policy plan');
    expect(nc).toContain('answer the affirmative value and criterion');
    expect(firstAffirmativeRebuttal).toContain('rebuild the affirmative case');
    expect(firstAffirmativeRebuttal).toContain('Do not add new contention shells');
    expect(secondAffirmativeRebuttal).toContain('give the judge a clear reason for the affirmative ballot');
  });

  it('adds Policy cross-examination and weighing constraints', () => {
    const cxPrompt = builder.buildTurnPrompt({
      topic: 'The city should adopt congestion pricing.',
      phase: 'cross_examination',
      cxRole: 'questioner',
      format: POLICY_FORMAT,
    });
    const rebuttalPrompt = builder.buildTurnPrompt({
      topic: 'The city should adopt congestion pricing.',
      phase: 'rebuttal',
      previousMessage: 'The plan creates enforcement costs.',
      format: POLICY_FORMAT,
    });

    expect(cxPrompt).toContain('clarify plan text');
    expect(cxPrompt).toContain('impact chain');
    expect(rebuttalPrompt).toContain('compare impacts');
    expect(rebuttalPrompt).toContain('decision rule');
  });

  it('adds Policy speech-specific contracts for 1AC, 2AC, 2NR, and 2AR', () => {
    const firstAffirmativeConstructive = builder.buildTurnPrompt({
      topic: 'The city should adopt congestion pricing.',
      phase: 'constructive',
      format: POLICY_FORMAT,
      messageLabel: '1AC',
    });
    const secondAffirmativeConstructive = builder.buildTurnPrompt({
      topic: 'The city should adopt congestion pricing.',
      phase: 'constructive',
      format: POLICY_FORMAT,
      messageLabel: '2AC',
    });
    const secondNegativeRebuttal = builder.buildTurnPrompt({
      topic: 'The city should adopt congestion pricing.',
      phase: 'rebuttal',
      format: POLICY_FORMAT,
      messageLabel: '2NR',
    });
    const secondAffirmativeRebuttal = builder.buildTurnPrompt({
      topic: 'The city should adopt congestion pricing.',
      phase: 'closing',
      format: POLICY_FORMAT,
      messageLabel: '2AR',
    });

    expect(firstAffirmativeConstructive).toContain('state the plan text');
    expect(firstAffirmativeConstructive).toContain('harms, inherency or burden, solvency, and impact links');
    expect(secondAffirmativeConstructive).toContain('rebuild plan solvency');
    expect(secondNegativeRebuttal).toContain('identify dropped arguments');
    expect(secondAffirmativeRebuttal).toContain('handle dropped arguments');
    expect(secondAffirmativeRebuttal).toContain('explain why the plan wins');
  });

  it('keeps Socratic turns question-led and assumption-focused', () => {
    const prompt = builder.buildTurnPrompt({
      topic: 'Technology makes us less free.',
      phase: 'question',
      format: SOCRATIC_FORMAT,
    });

    expect(prompt).toContain('question-led');
    expect(prompt).toContain('surface assumptions');
  });

  it('treats Oxford question turns as audience question responses', () => {
    const prompt = builder.buildTurnPrompt({
      topic: 'Public transit should be free.',
      phase: 'question',
      format: OXFORD_FORMAT,
      messageLabel: 'Affirmative Audience Question Response',
      audienceQuestion: 'How would you fund the program?',
    });

    expect(prompt).toContain('Turn: Affirmative Audience Question Response');
    expect(prompt).toContain('Answer the audience question directly');
    expect(prompt).toContain('Audience question for your side: "How would you fund the program?"');
    expect(prompt).toContain('Oxford audience Q&A');
    expect(prompt).not.toContain('Pose one focused question');
  });

  it('extracts previous opponent message while skipping current speaker', () => {
    const messages: Message[] = [
      {
        id: '1',
        sender: 'Claude',
        senderType: 'ai',
        content: 'Opening statement.',
        timestamp: 1,
      },
      {
        id: '2',
        sender: 'GPT-4o',
        senderType: 'ai',
        content: 'Rebuttal point.',
        timestamp: 2,
      },
    ];

    expect(builder.extractPreviousMessage(messages, claude)).toBe('Rebuttal point.');
    expect(builder.extractPreviousMessage(messages, gpt)).toBe('Opening statement.');
  });

  it('tells closing speakers not to repeat their own earlier speech', () => {
    const prompt = builder.buildTurnPrompt({
      topic: 'AI should assist in education.',
      phase: 'closing',
      format: OXFORD_FORMAT,
      messageLabel: 'Affirmative Summary Speech',
      sameSpeakerPreviousMessage: 'The first argument centered on personalized tutoring and teacher time.',
    });

    expect(prompt).toContain('Earlier speech by you to avoid repeating');
    expect(prompt).toContain('personalized tutoring and teacher time');
    expect(prompt).toContain('Do not restate that speech');
  });

  it('ensures debate mode marker is present and validates prompt content', () => {
    const rawPrompt = 'Continue debating the motion.';
    const withMarker = builder.addDebateModeMarker(rawPrompt);
    expect(withMarker.startsWith(DEBATE_CONSTANTS.PROMPT_MARKERS.DEBATE_MODE)).toBe(true);

    const validation = builder.validatePrompt(withMarker);
    expect(validation.valid).toBe(true);

    const invalid = builder.validatePrompt('');
    expect(invalid.valid).toBe(false);
    expect(invalid.errors).toContain('Prompt cannot be empty');
  });
});
