import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useDebateTopic } from '@/hooks/debate/useDebateTopic';
import type { SuggestedTopic } from '@/config/debate/suggestedTopics';

const mockGetSuggestedTopics = jest.fn();
const mockGenerateRandomTopic = jest.fn();
const mockValidateCustomTopic = jest.fn();
const mockGetRelatedTopics = jest.fn();
const mockSearchTopics = jest.fn();
const mockGetTopicCategory = jest.fn();
const mockGetEstimatedDuration = jest.fn();

jest.mock('@/services/debate/TopicService', () => ({
  TopicService: {
    getSuggestedTopics: (...args: unknown[]) => mockGetSuggestedTopics(...args),
    generateRandomTopic: (...args: unknown[]) => mockGenerateRandomTopic(...args),
    validateCustomTopic: (...args: unknown[]) => mockValidateCustomTopic(...args),
    getRelatedTopics: (...args: unknown[]) => mockGetRelatedTopics(...args),
    searchTopics: (...args: unknown[]) => mockSearchTopics(...args),
    getTopicCategory: (...args: unknown[]) => mockGetTopicCategory(...args),
    getEstimatedDuration: (...args: unknown[]) => mockGetEstimatedDuration(...args),
  },
}));

describe('useDebateTopic', () => {
  const suggested: SuggestedTopic[] = [
    { id: '1', topic: 'AI Policy', category: 'Technology', difficulty: 'medium', estimatedDuration: 12, tags: [], popularity: 5 },
    { id: '2', topic: 'Climate Action', category: 'Science', difficulty: 'hard', estimatedDuration: 18, tags: [], popularity: 4 },
  ];

  beforeEach(() => {
    jest.clearAllMocks();

    mockGetSuggestedTopics.mockReturnValue(suggested);
    mockGenerateRandomTopic.mockReturnValue({ id: '3', topic: 'Random Surprise', category: 'Fun & Quirky', difficulty: 'easy', estimatedDuration: 10, tags: [], popularity: 3 });
    mockValidateCustomTopic.mockImplementation((topic: string) => ({
      isValid: topic.length > 0,
      errors: topic.length > 0 ? [] : ['Topic is required'],
      warnings: topic.length > 10 ? ['Long topic'] : [],
      suggestions: [],
    }));
    mockGetRelatedTopics.mockReturnValue([{ id: 'rel', topic: 'AI in Schools', category: 'Technology', difficulty: 'medium', estimatedDuration: 15, tags: [], popularity: 2 }]);
    mockSearchTopics.mockReturnValue([{ id: 'search', topic: 'AI Ethics', category: 'Philosophy', difficulty: 'hard', estimatedDuration: 20, tags: [], popularity: 5 }]);
    mockGetTopicCategory.mockReturnValue('Technology');
    mockGetEstimatedDuration.mockReturnValue(14);
  });

  it('manages preset and custom topic flows with validation', () => {
    const { result } = renderHook(() => useDebateTopic('AI Regulation', 'preset'));

    expect(result.current.suggestedTopics).toEqual(suggested);
    expect(result.current.currentTopic).toBe('AI Regulation');
    expect(result.current.validation.isValid).toBe(true);

    act(() => {
      result.current.setCustomTopic('Should we trust AI?');
    });

    expect(result.current.topicMode).toBe('custom');
    expect(result.current.currentTopic).toBe('Should we trust AI?');
    expect(mockValidateCustomTopic).toHaveBeenCalledWith('Should we trust AI?');

    act(() => {
      result.current.selectSuggestedTopic('AI Policy Debates');
    });

    expect(result.current.topicMode).toBe('preset');
    expect(result.current.currentTopic).toBe('AI Policy Debates');

    act(() => {
      result.current.generateSurpriseTopic();
    });

    expect(result.current.topicMode).toBe('surprise');
    expect(result.current.currentTopic).toBe('Random Surprise');
    expect(result.current.customTopic).toBe('');
  });

  it('provides helpers for related content and history tracking', async () => {
    const { result } = renderHook(() => useDebateTopic('AI Policy', 'preset'));

    expect(result.current.getRelatedTopics(2)).toHaveLength(1);
    expect(result.current.searchTopics('AI')).toHaveLength(1);
    expect(result.current.getTopicCategory()).toBe('Technology');
    expect(result.current.getEstimatedDuration()).toBe(14);

    act(() => {
      result.current.setCustomTopic('');
    });

    expect(result.current.validation.isValid).toBe(false);
    expect(result.current.validationMessage).toBe('Topic is required');

    act(() => {
      result.current.setCustomTopic('Should AI make laws?');
    });

    await waitFor(() => expect(result.current.isValidTopic).toBe(true));

    act(() => {
      const finalized = result.current.finalizeTopic();
      expect(finalized).toBe('Should AI make laws?');
    });

    expect(result.current.topicHistory).toContain('Should AI make laws?');

    act(() => {
      result.current.resetTopic();
    });

    expect(result.current.topicMode).toBe('preset');
    expect(result.current.currentTopic).toBe('');
    expect(result.current.topicHistory).toHaveLength(1);
  });
});
