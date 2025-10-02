jest.mock('@/config/quickStartTopics', () => ({
  QUICK_START_TOPICS: [
    { id: 'focus', emoji: '🎯', title: 'Focus Session', subtitle: 'Regain concentration' },
    { id: 'relax', emoji: '🧘', title: 'Relaxation', subtitle: 'Wind down gently' },
  ],
  TOPIC_PROMPTS: {
    focus: 'Help me focus on important tasks.',
  },
}));

import { QuickStartService } from '@/services/home/QuickStartService';
import { QUICK_START_TOPICS } from '@/config/quickStartTopics';

const focusTopic = QUICK_START_TOPICS[0];
const relaxTopic = QUICK_START_TOPICS[1];

describe('QuickStartService', () => {
  it('returns topics and validates selections', () => {
    expect(QuickStartService.getTopics()).toEqual(QUICK_START_TOPICS);
    expect(QuickStartService.validateTopicSelection(focusTopic)).toBe(true);
    expect(QuickStartService.validateTopicSelection({ ...focusTopic, id: 'unknown' })).toBe(false);
    expect(QuickStartService.validateTopicSelection(null)).toBe(false);
  });

  it('validates topic structure against home constants', () => {
    expect(QuickStartService.validateTopicStructure(focusTopic)).toBe(true);

    const invalid = { ...focusTopic, title: '' };
    expect(QuickStartService.validateTopicStructure(invalid)).toBe(false);
  });

  it('provides prompts and prepares prompt data for wizard', () => {
    expect(QuickStartService.getTopicPrompt('focus')).toBe('Help me focus on important tasks.');
    expect(QuickStartService.getTopicPrompt('relax')).toContain("Let's have a conversation");

    const data = QuickStartService.preparePromptData(focusTopic, 'Add breathing exercise');
    expect(data).toEqual({
      topicId: 'focus',
      topicTitle: 'Focus Session',
      basePrompt: 'Help me focus on important tasks.',
      userInput: 'Add breathing exercise',
      enrichedPrompt: 'Help me focus on important tasks. Add breathing exercise',
    });
  });

  it('enriches user prompts and checks availability', () => {
    expect(QuickStartService.enrichPromptForTopic('focus', 'Stay away from distractions')).toBe(
      'Help me focus on important tasks. Specifically: Stay away from distractions'
    );
    expect(QuickStartService.enrichPromptForTopic('focus', '   ')).toBe('Help me focus on important tasks.');

    expect(QuickStartService.isQuickStartAvailable(1)).toBe(true);
    expect(QuickStartService.isQuickStartAvailable(0)).toBe(false);
  });

  it('finds topics by id, supports search, and counts topics', () => {
    expect(QuickStartService.getTopicById('focus')).toEqual(focusTopic);
    expect(QuickStartService.getTopicById('missing')).toBeNull();

    expect(QuickStartService.searchTopics('relax')).toEqual([relaxTopic]);
    expect(QuickStartService.searchTopics('')).toEqual(QUICK_START_TOPICS);

    expect(QuickStartService.getTopicCount()).toBe(QUICK_START_TOPICS.length);
  });

  it('validates wizard completion data', () => {
    expect(QuickStartService.validateWizardCompletion('user', 'enriched')).toBe(true);
    expect(QuickStartService.validateWizardCompletion('', 'enriched')).toBe(false);
    expect(QuickStartService.validateWizardCompletion('user', '')).toBe(false);
  });
});
