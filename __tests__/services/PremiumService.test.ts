import { hasFeatureAccess, getFeatureLimit, hasReachedLimit, getAvailablePersonalities, isModelAvailable, getPremiumUpsellMessage } from '@/services/PremiumService';
import { mockStoreState } from '../../test-utils/services/state';

describe('PremiumService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('checks feature access by subscription tier', () => {
    const freeSpy = mockStoreState({ auth: { isPremium: false } });
    expect(hasFeatureAccess('customDebateTopics')).toBe(false);
    expect(hasFeatureAccess('debateTopicSuggestions')).toBe(true);
    freeSpy.mockRestore();

    const premiumSpy = mockStoreState({ auth: { isPremium: true } });
    expect(hasFeatureAccess('customDebateTopics')).toBe(true);
    expect(hasFeatureAccess('exportConversations')).toBe(true);
    premiumSpy.mockRestore();
  });

  it('returns feature limits with semantic helpers', () => {
    const freeSpy = mockStoreState({ auth: { isPremium: false } });
    expect(getFeatureLimit('debateTopicSuggestions')).toBe(3);
    expect(getFeatureLimit('aiPersonalities')).toEqual(['neutral', 'friendly', 'professional']);
    freeSpy.mockRestore();

    const premiumSpy = mockStoreState({ auth: { isPremium: true } });
    expect(getFeatureLimit('conversationHistory')).toBe('unlimited');
    expect(getFeatureLimit('aiPersonalities')).toBe('unlimited');
    premiumSpy.mockRestore();
  });

  it('evaluates whether limits are reached', () => {
    const spy = mockStoreState({ auth: { isPremium: false } });
    expect(hasReachedLimit('debateTopicSuggestions', 2)).toBe(false);
    expect(hasReachedLimit('debateTopicSuggestions', 3)).toBe(true);
    expect(hasReachedLimit('aiPersonalities', 10)).toBe(false);
    spy.mockRestore();
  });

  it('lists available personalities based on membership', () => {
    const freeSpy = mockStoreState({ auth: { isPremium: false } });
    expect(getAvailablePersonalities()).toEqual(['neutral', 'friendly', 'professional']);
    freeSpy.mockRestore();

    const premiumSpy = mockStoreState({ auth: { isPremium: true } });
    expect(getAvailablePersonalities()).toHaveLength(12);
    premiumSpy.mockRestore();
  });

  it('validates model availability for free users', () => {
    const freeSpy = mockStoreState({ auth: { isPremium: false } });
    expect(isModelAvailable('gpt-4o-mini')).toBe(true);
    expect(isModelAvailable('gpt-5')).toBe(false);
    freeSpy.mockRestore();

    const premiumSpy = mockStoreState({ auth: { isPremium: true } });
    expect(isModelAvailable('gpt-5')).toBe(true);
    premiumSpy.mockRestore();
  });

  it('returns upsell copy for premium features', () => {
    expect(getPremiumUpsellMessage('customDebateTopics')).toContain('Upgrade to Premium');
    expect(getPremiumUpsellMessage('dailyMessageLimit')).toContain('daily message limit');
    expect(getPremiumUpsellMessage('modelAccess')).toContain('Premium');
  });
});
