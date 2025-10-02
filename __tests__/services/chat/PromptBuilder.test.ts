import { PromptBuilder } from '@/services/chat/PromptBuilder';
import type { PersonalityOption } from '@/config/personalities';
import type { AI, Message } from '@/types';

const ai: AI = {
  id: 'claude',
  provider: 'claude',
  name: 'Claude',
  model: 'claude-3',
};

const personality: PersonalityOption = {
  id: 'coach',
  name: 'Coach',
  emoji: '🏋️',
  tagline: 'High energy guidance',
  description: 'Keeps the debate lively',
  bio: 'Always ready with a plan.',
  systemPrompt: 'You are Coach.',
  debatePrompt: 'Bring confident arguments.',
  chatGuidance: 'Stay encouraging.',
  debateGuidance: 'Challenge respectfully and push momentum.',
  compareGuidance: 'Lay out tradeoffs clearly.',
  signatureMoves: ['Calls out the next play.'],
};

describe('PromptBuilder', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('builds AI prompt based on round context and persona', () => {
    const history: Message[] = [
      { id: '1', sender: 'You', senderType: 'user', content: 'Start debate', timestamp: 1 },
    ];
    const baseContext = {
      isFirstAI: true,
      isDebateMode: false,
      lastSpeaker: undefined,
      lastMessage: undefined,
      conversationHistory: history,
      mentions: [],
    };

    const firstPrompt = PromptBuilder.buildAIPrompt('Hello there', baseContext, ai);
    expect(firstPrompt).toBe('Hello there');

    const followUpContext = {
      ...baseContext,
      isFirstAI: false,
      lastSpeaker: 'Claude',
      lastMessage: 'Some argument',
    };
    const followPrompt = PromptBuilder.buildAIPrompt('Ignored', followUpContext, ai);
    expect(followPrompt).toContain('Claude just responded');

    const debateContext = {
      ...baseContext,
      isFirstAI: true,
      isDebateMode: true,
    };
    const debatePrompt = PromptBuilder.buildAIPrompt('Initial', debateContext, ai, personality);
    expect(debatePrompt).toContain('[DEBATE MODE ACTIVE]');
    expect(debatePrompt).toContain('Persona focus');
  });

  it('builds enriched prompts and persona guidance', () => {
    const enriched = PromptBuilder.buildEnrichedPrompt('User', 'Base', personality, true);
    expect(enriched.aiProcessingPrompt).toContain('Persona focus');
    expect(enriched.hasPersonality).toBe(true);
    expect(enriched.hasDebateMode).toBe(true);

    const unchanged = PromptBuilder.appendPersonaGuidance('Prompt', { ...personality, id: 'default', signatureMoves: [] }, 'chat');
    expect(unchanged).toBe('Prompt');

    const debateGuided = PromptBuilder.appendPersonaGuidance('Prompt', personality, 'debate');
    expect(debateGuided).toContain('Persona focus: Challenge respectfully');
  });

  it('builds mention prompts and round robin copy', () => {
    const mention = PromptBuilder.buildMentionPrompt('Original', 'Claude', personality);
    expect(mention).toContain('You (Claude)');
    expect(mention).toContain('Persona focus');

    const rr = PromptBuilder.buildRoundRobinPrompt('Claude', 'Argument');
    expect(rr).toContain('Claude just responded');
  });

  it('summarises context for long conversations', () => {
    const messages: Message[] = Array.from({ length: 12 }, (_, idx) => ({
      id: `${idx}`,
      sender: idx % 2 === 0 ? 'You' : 'Claude',
      senderType: idx % 2 === 0 ? 'user' : 'ai',
      content: `Message ${idx}`,
      timestamp: idx,
    }));

    const summary = PromptBuilder.buildContextSummary(messages, 10);
    expect(summary).toContain('[... 4 messages ...]');
    expect(summary).toContain('Message 0');
    expect(summary).toContain('Message 11');
  });

  it('validates prompt size and returns warnings', () => {
    const result = PromptBuilder.validatePrompt('');
    expect(result.isValid).toBe(false);
    expect(result.warnings).toContain('Empty prompt');

    const longPrompt = 'a'.repeat(32050);
    const newlinePrompt = 'line\n'.repeat(150);
    const longResult = PromptBuilder.validatePrompt(longPrompt);
    const newlineResult = PromptBuilder.validatePrompt(newlinePrompt);

    expect(longResult.warnings.some(w => w.includes('token'))).toBe(true);
    expect(newlineResult.warnings.some(w => w.includes('line breaks'))).toBe(true);
  });

  it('formats conversation history with options', () => {
    const messages: Message[] = [
      { id: '1', sender: 'You', senderType: 'user', content: 'Hi', timestamp: 1 },
      { id: '2', sender: 'Claude', senderType: 'ai', content: 'Hello', timestamp: 2 },
      { id: '3', sender: 'Claude', senderType: 'ai', content: 'More', timestamp: 3 },
    ];

    const timeSpy = jest
      .spyOn(Date.prototype, 'toLocaleTimeString')
      .mockReturnValue('12:00 PM');

    const history = PromptBuilder.formatConversationHistory(messages, { includeTimestamps: true, maxMessages: 2, excludeUser: true });

    expect(history.split('\n')).toHaveLength(2);
    expect(history).toContain('Claude:');
    expect(history).toContain('[12:00 PM]');
    timeSpy.mockRestore();
  });

  it('builds system prompts for debate', () => {
    const withPersona = PromptBuilder.buildSystemPrompt(ai, personality, true);
    expect(withPersona).toContain('You are Coach.');
    expect(withPersona).toContain('Debate Style');

    const withoutPersona = PromptBuilder.buildSystemPrompt(ai, undefined, true);
    expect(withoutPersona).toContain('You are Claude');
    expect(withoutPersona).toContain('debate mode');
  });

  it('analyses prompt characteristics', () => {
    const analysis = PromptBuilder.analyzePrompt(
      '@Claude Can we debate climate policy now about taxation, energy security, resilience, adaptation, and mitigation strategies? It is urgent!'
    );

    expect(analysis.hasQuestions).toBe(true);
    expect(analysis.hasMentions).toBe(true);
    expect(analysis.isDebateStart).toBe(true);
    expect(analysis.urgency).toBe('high');
    expect(analysis.estimatedComplexity).toBe('moderate');
    expect(analysis.topics.length).toBeGreaterThan(0);
  });
});
