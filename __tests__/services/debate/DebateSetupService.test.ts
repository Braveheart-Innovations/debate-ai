import { DebateSetupService } from '@/services/debate/DebateSetupService';
import { PersonalityService } from '@/services/debate/PersonalityService';
import type { DebateConfig, AIDebater, Personality } from '@/types/debate';
import { DEBATE_SETUP_CONFIG } from '@/config/debate/debateSetupConfig';

describe('DebateSetupService', () => {
  const debater = (id: string, name: string): AIDebater => ({
    id,
    name,
    provider: 'claude',
    model: 'claude-3',
    iconType: 'letter',
    icon: name[0],
  });
  const [defaultPersonality, secondaryPersonality = PersonalityService.getDefaultPersonality()] =
    PersonalityService.getAvailablePersonalities();

  const buildConfig = (overrides?: Partial<DebateConfig>): DebateConfig => {
    const personalities = new Map<string, Personality>();
    personalities.set('claude', defaultPersonality);
    personalities.set('gpt', secondaryPersonality);

    return {
      topic: 'The house believes AI should assist in education.',
      topicMode: DEBATE_SETUP_CONFIG.DEFAULT_TOPIC_MODE,
      debaters: [debater('claude', 'Claude'), { ...debater('gpt', 'GPT-4o'), provider: 'openai' }],
      personalities,
      settings: {
        maxRounds: 3,
        turnDuration: 120,
        allowInterruptions: false,
        moderationLevel: 'light',
        isPremium: true,
      },
      createdAt: Date.now(),
      estimatedDuration: 10,
      ...overrides,
    };
  };

  it('validates full debate configuration and aggregates warnings', () => {
    const config = buildConfig();
    const validation = DebateSetupService.validateDebateConfiguration(config);

    expect(validation.isValid).toBe(true);
    expect(validation.errors).toHaveLength(0);
    expect(validation.warnings.length).toBeGreaterThanOrEqual(0);
  });

  it('throws when creating session with invalid configuration', () => {
    const invalidConfig = buildConfig({ debaters: [] });
    expect(() => DebateSetupService.createDebateSession(invalidConfig)).toThrow('Invalid debate configuration');
  });

  it('creates debate session snapshot when configuration is valid', () => {
    const config = buildConfig();
    const session = DebateSetupService.createDebateSession(config);

    expect(session.id).toMatch(/^debate_/);
    expect(session.participants).toHaveLength(2);
    expect(session.status).toBe('setup');
  });

  it('estimates duration based on topic length and personalities', () => {
    const topic = 'Should we allow AI tutors in every public school classroom to improve personalized learning outcomes?';
    const time = DebateSetupService.calculateEstimatedDuration(topic, [
      { ...debater('claude', 'Claude'), personality: 'analyst' },
      { ...debater('gpt', 'GPT-4o'), personality: 'default' },
    ]);

    expect(time % 5).toBe(0);
    expect(time).toBeGreaterThanOrEqual(DEBATE_SETUP_CONFIG.ESTIMATED_DURATION.MEDIUM_TOPIC);
  });

  it('summarizes configuration and detects missing elements in preview', () => {
    const config = buildConfig();
    const summary = DebateSetupService.getConfigurationSummary(config);
    expect(summary.topic).toBe(config.topic);
    expect(summary.debaterCount).toBe(2);
    expect(summary.hasCustomPersonalities).toBe(true);

    const preview = DebateSetupService.previewDebate({
      topic: '',
      debaters: [debater('claude', 'Claude')],
      personalities: new Map(),
    });
    expect(preview.canStart).toBe(false);
    expect(preview.missingElements).toContain('Topic selection');
  });
});
