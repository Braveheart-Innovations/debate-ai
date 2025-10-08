import { PromptBuilder, PromptContext } from '../PromptBuilder';
import { AI, Message } from '../../../types';
import { PersonalityOption } from '../../../config/personalities';

const ai: AI = {
  id: 'ai-1',
  name: 'Alpha',
  provider: 'openai',
  model: 'gpt-4',
};

const personality: PersonalityOption = {
  id: 'charismatic',
  name: 'Charismatic Debater',
  emoji: '✨',
  tagline: 'Engaging and inspiring',
  description: 'Engaging and persuasive',
  bio: 'Thrives in lively debates with inspiring rhetoric.',
  systemPrompt: 'You are charismatic.',
  debatePrompt: 'Command the audience with vibrant rhetoric.',
  chatGuidance: 'Be engaging and positive.',
  debateGuidance: 'Use rhetoric and appeal to emotion.',
  compareGuidance: 'Highlight differences clearly.',
  signatureMoves: ['Deliver quotable lines.'],
  tone: { formality: 0.6, humor: 0.7, energy: 0.6, empathy: 0.8, technicality: 0.5 },
};

const messages: Message[] = [
  { id: '1', sender: 'Moderator', senderType: 'ai', content: '[DEBATE MODE] Welcome', timestamp: 1 },
  { id: '2', sender: 'Beta', senderType: 'ai', content: 'I disagree because...', timestamp: 2 },
];

const context: PromptContext = {
  isFirstAI: false,
  isDebateMode: true,
  lastSpeaker: 'Beta',
  lastMessage: 'I disagree because...',
  conversationHistory: messages,
  mentions: [],
};

describe('PromptBuilder', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-04-10T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('buildAIPrompt handles first AI vs subsequent with debate and personality', () => {
    const firstContext: PromptContext = {
      ...context,
      isFirstAI: true,
      lastSpeaker: undefined,
      lastMessage: undefined,
    };

    const firstPrompt = PromptBuilder.buildAIPrompt('Hello world', firstContext, ai, personality);
    expect(firstPrompt).toContain('[DEBATE MODE ACTIVE]');
    expect(firstPrompt).toContain('Persona focus');

    const followUp = PromptBuilder.buildAIPrompt('ignored', context, ai, personality);
    expect(followUp).toContain('Beta just responded');
    expect(followUp).toContain('[DEBATE MODE ACTIVE]');
  });

  it('buildEnrichedPrompt appends persona guidance when provided', () => {
    const enriched = PromptBuilder.buildEnrichedPrompt('user prompt', 'ai prompt', personality, true);
    expect(enriched.aiProcessingPrompt).toContain('Persona focus');
    expect(enriched.hasPersonality).toBe(true);
    expect(enriched.hasDebateMode).toBe(true);
  });

  describe('appendPersonaGuidance', () => {
    it('returns original prompt for default persona', () => {
      const prompt = PromptBuilder.appendPersonaGuidance('Hello', { ...personality, id: 'default' }, 'chat');
      expect(prompt).toBe('Hello');
    });

    it('appends guidance based on mode', () => {
      expect(PromptBuilder.appendPersonaGuidance('Hello', personality, 'debate')).toContain(personality.debateGuidance!);
      expect(PromptBuilder.appendPersonaGuidance('Hello', personality, 'compare')).toContain(personality.compareGuidance!);
      expect(PromptBuilder.appendPersonaGuidance('Hello', { ...personality, debateGuidance: undefined }, 'debate')).toContain(personality.chatGuidance);
    });
  });

  it('buildRoundRobinPrompt references last speaker and message', () => {
    const prompt = PromptBuilder.buildRoundRobinPrompt('Beta', 'An argument');
    expect(prompt).toContain('Beta just responded');
    expect(prompt).toContain('respond to what Beta just said');
  });

  it('applyDebateMode builds appropriate context', () => {
    const result = PromptBuilder.applyDebateMode('Base prompt', ai, context);
    expect(result).toContain('Debate context');
    expect(result).toContain('Your role');

    const initialContext: PromptContext = {
      ...context,
      isFirstAI: true,
    };
    const initial = PromptBuilder.applyDebateMode('Base prompt', ai, initialContext);
    expect(initial).toContain('Recent context');
  });

  it('buildMentionPrompt emphasizes mention and persona guidance', () => {
    const prompt = PromptBuilder.buildMentionPrompt('User question', 'Alpha', personality);
    expect(prompt).toContain('specifically mentioned');
    expect(prompt).toContain('Persona focus');
  });

  it('buildContextSummary condenses long conversations', () => {
    const longMessages: Message[] = Array.from({ length: 12 }, (_, idx) => ({
      id: `${idx}`,
      sender: idx % 2 ? 'Alpha' : 'You',
      senderType: idx % 2 ? 'ai' : 'user',
      content: `Message ${idx}`,
      timestamp: idx,
    }));

    const summary = PromptBuilder.buildContextSummary(longMessages, 10);
    expect(summary).toContain('[... 4 messages ...]');
    expect(summary).toContain('Message 0');
    expect(summary).toContain('Message 11');
  });

  describe('validatePrompt', () => {
    it('rejects empty prompt', () => {
      expect(PromptBuilder.validatePrompt('')).toEqual({
        isValid: false,
        warnings: ['Empty prompt'],
        estimatedTokens: 0,
      });
    });

    it('returns warnings for long prompts', () => {
      const longPrompt = 'x'.repeat(17000);
      const result = PromptBuilder.validatePrompt(longPrompt);
      expect(result.isValid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  it('formatConversationHistory trims and formats entries', () => {
    const history = PromptBuilder.formatConversationHistory(messages, {
      includeTimestamps: true,
      maxMessages: 1,
      excludeUser: false,
    });
    expect(history).toContain('Beta');
    expect(history.split('\n')).toHaveLength(1);
  });

  describe('buildSystemPrompt', () => {
    it('uses personality prompt when provided', () => {
      const prompt = PromptBuilder.buildSystemPrompt(ai, personality, true);
      expect(prompt).toContain(personality.systemPrompt);
      expect(prompt).toContain('Debate Style: Command the audience with vibrant rhetoric.');
    });

    it('adds debate guidance when no persona provided', () => {
      const prompt = PromptBuilder.buildSystemPrompt(ai, undefined, true);
      expect(prompt).toContain('You are in debate mode');
    });
  });

  it('analyzePrompt extracts metadata', () => {
    const analysis = PromptBuilder.analyzePrompt('Debate about AI now! @Alpha What do you think?');
    expect(analysis).toEqual({
      hasQuestions: true,
      hasMentions: true,
      isDebateStart: true,
      topics: expect.any(Array),
      urgency: 'high',
      estimatedComplexity: 'simple',
    });
    expect(analysis.topics.length).toBeGreaterThan(0);
  });
});
