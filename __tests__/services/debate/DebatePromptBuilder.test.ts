import { DebatePromptBuilder } from '@/services/debate/DebatePromptBuilder';
import { DEBATE_CONSTANTS } from '@/config/debateConstants';
import type { AI, Message } from '@/types';
import { OXFORD_FORMAT } from '@/config/debate/formats';

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
      civilityLevel: 4,
      format: OXFORD_FORMAT,
      personalityId: 'george',
    });

    expect(prompt).toContain('Turn: Rebuttal');
    expect(prompt).toContain('Directly refute');
    expect(prompt).toContain('AI should assist in education.');
    expect(prompt).toContain('Use observational, PG humor');
    expect(prompt).toContain('Tone: neutral and professional');
    expect(prompt).toContain(DEBATE_CONSTANTS.PROMPT_MARKERS.PREVIOUS_SPEAKER);
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
