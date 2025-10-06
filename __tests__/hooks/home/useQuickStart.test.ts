import { act } from '@testing-library/react-native';
import { renderHookWithProviders } from '../../../test-utils/renderHookWithProviders';
import { useQuickStart } from '@/hooks/home/useQuickStart';
import { QuickStartService } from '@/services/home/QuickStartService';
import type { QuickStartTopic } from '@/components/organisms';

jest.mock('@/services/home/QuickStartService', () => ({
  QuickStartService: {
    getTopics: jest.fn(),
    validateTopicSelection: jest.fn(),
    validateWizardCompletion: jest.fn(),
    preparePromptData: jest.fn(),
    enrichPromptForTopic: jest.fn(),
    isQuickStartAvailable: jest.fn(),
    getTopicById: jest.fn(),
    searchTopics: jest.fn(),
    getTopicPrompt: jest.fn(),
    getTopicCount: jest.fn(),
  },
}));

describe('useQuickStart', () => {
  const mockGetTopics = QuickStartService.getTopics as jest.MockedFunction<typeof QuickStartService.getTopics>;
  const mockValidateTopicSelection = QuickStartService.validateTopicSelection as jest.MockedFunction<typeof QuickStartService.validateTopicSelection>;
  const mockValidateWizardCompletion = QuickStartService.validateWizardCompletion as jest.MockedFunction<typeof QuickStartService.validateWizardCompletion>;
  const mockPreparePromptData = QuickStartService.preparePromptData as jest.MockedFunction<typeof QuickStartService.preparePromptData>;
  const mockEnrichPromptForTopic = QuickStartService.enrichPromptForTopic as jest.MockedFunction<typeof QuickStartService.enrichPromptForTopic>;
  const mockIsQuickStartAvailable = QuickStartService.isQuickStartAvailable as jest.MockedFunction<typeof QuickStartService.isQuickStartAvailable>;
  const mockGetTopicById = QuickStartService.getTopicById as jest.MockedFunction<typeof QuickStartService.getTopicById>;
  const mockSearchTopics = QuickStartService.searchTopics as jest.MockedFunction<typeof QuickStartService.searchTopics>;
  const mockGetTopicPrompt = QuickStartService.getTopicPrompt as jest.MockedFunction<typeof QuickStartService.getTopicPrompt>;
  const mockGetTopicCount = QuickStartService.getTopicCount as jest.MockedFunction<typeof QuickStartService.getTopicCount>;

  const mockTopics: QuickStartTopic[] = [
    { id: 'climate', title: 'Climate Debate', subtitle: 'Discuss policy ideas', emoji: '🌎' },
    { id: 'ethics', title: 'AI Ethics', subtitle: 'Explore dilemmas', emoji: '🤖' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetTopics.mockReturnValue(mockTopics);
    mockValidateTopicSelection.mockImplementation(topic => !!topic && topic.id === 'climate');
    mockValidateWizardCompletion.mockReturnValue(true);
    mockPreparePromptData.mockImplementation((topic, userInput) => ({
      topicId: topic.id,
      topicTitle: topic.title,
      basePrompt: 'Base prompt',
      userInput: userInput || '',
      enrichedPrompt: userInput ? `Base prompt ${userInput}` : 'Base prompt',
    }));
    mockEnrichPromptForTopic.mockImplementation((_topicId, prompt) => `enriched::${prompt}`);
    mockIsQuickStartAvailable.mockReturnValue(true);
    mockGetTopicById.mockImplementation(id => mockTopics.find(topic => topic.id === id) || null);
    mockSearchTopics.mockReturnValue(mockTopics);
    mockGetTopicPrompt.mockReturnValue('Base prompt');
    mockGetTopicCount.mockReturnValue(mockTopics.length);
  });

  it('loads topics, validates selection, and exposes wizard controls', () => {
    const { result } = renderHookWithProviders(() => useQuickStart());

    expect(result.current.topics).toEqual(mockTopics);
    expect(result.current.topicCount).toBe(mockTopics.length);
    expect(result.current.hasSelectedTopic).toBe(false);
    expect(result.current.enrichPrompt('no topic')).toBe('no topic');

    act(() => {
      result.current.selectTopic(mockTopics[0]);
    });

    expect(mockValidateTopicSelection).toHaveBeenCalledWith(mockTopics[0]);
    expect(result.current.selectedTopic).toEqual(mockTopics[0]);
    expect(result.current.showWizard).toBe(true);

    const status = result.current.getStatus();
    expect(status).toEqual({
      hasSelectedTopic: true,
      wizardVisible: true,
      topicCount: mockTopics.length,
      selectedTopicId: 'climate',
    });

    act(() => {
      result.current.closeWizard();
    });

    expect(result.current.showWizard).toBe(false);

    act(() => {
      result.current.reset();
    });

    expect(result.current.selectedTopic).toBeNull();
    expect(result.current.hasSelectedTopic).toBe(false);
    expect(result.current.getStatus().selectedTopicId).toBeNull();
  });

  it('delegates prompt preparation, enrichment, and availability helpers', () => {
    const { result } = renderHookWithProviders(() => useQuickStart());

    act(() => {
      result.current.selectTopic(mockTopics[0]);
    });

    expect(result.current.getCurrentTopicPrompt()).toBe('Base prompt');
    expect(mockGetTopicPrompt).toHaveBeenCalledWith('climate');

    expect(result.current.enrichPrompt('User input')).toBe('enriched::User input');
    expect(mockEnrichPromptForTopic).toHaveBeenCalledWith('climate', 'User input');

    expect(result.current.enrichPrompt('   ')).toBe('enriched::   ');
    expect(mockEnrichPromptForTopic).toHaveBeenLastCalledWith('climate', '   ');

    const prepared = result.current.preparePromptData(mockTopics[0], 'custom');
    expect(prepared).toEqual({
      topicId: 'climate',
      topicTitle: 'Climate Debate',
      basePrompt: 'Base prompt',
      userInput: 'custom',
      enrichedPrompt: 'Base prompt custom',
    });
    expect(mockPreparePromptData).toHaveBeenCalledWith(mockTopics[0], 'custom');

    expect(result.current.validateCompletion('prompt', 'enriched')).toBe(true);
    expect(mockValidateWizardCompletion).toHaveBeenCalledWith('prompt', 'enriched');

    expect(result.current.isAvailable(1)).toBe(true);
    expect(mockIsQuickStartAvailable).toHaveBeenCalledWith(1);

    expect(result.current.getTopicById('ethics')).toEqual(mockTopics[1]);
    expect(result.current.searchTopics('AI')).toEqual(mockTopics);
  });

  it('ignores invalid topic selections', () => {
    const { result } = renderHookWithProviders(() => useQuickStart());
    const invalidTopic = { ...mockTopics[1], id: 'unknown' };

    act(() => {
      result.current.selectTopic(invalidTopic);
    });

    expect(result.current.selectedTopic).toBeNull();
    expect(result.current.showWizard).toBe(false);
  });
});
