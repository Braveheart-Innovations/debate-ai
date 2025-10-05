import { act, renderHook } from '@testing-library/react-native';
import { useDebateSetup } from '@/hooks/debate/useDebateSetup';
import type { UseDebateValidationReturn } from '@/types/debate';
import { createMockDebater, createMockPersonality, buildPersonalityMap } from '../../../test-utils/hooks/debateFixtures';

const mockUseSelector = jest.fn();

jest.mock('react-redux', () => ({
  useSelector: (selector: (state: unknown) => unknown) => mockUseSelector(selector),
}));

const mockUseDebateSteps = jest.fn();
const mockUseDebateTopic = jest.fn();
const mockUseAIDebaterSelection = jest.fn();
const mockUsePersonalitySelection = jest.fn();
const mockUseDebateValidation = jest.fn();

jest.mock('@/hooks/debate/useDebateSteps', () => ({
  useDebateSteps: (...args: unknown[]) => mockUseDebateSteps(...args),
}));

jest.mock('@/hooks/debate/useDebateTopic', () => ({
  useDebateTopic: (...args: unknown[]) => mockUseDebateTopic(...args),
}));

jest.mock('@/hooks/debate/useAIDebaterSelection', () => ({
  useAIDebaterSelection: (...args: unknown[]) => mockUseAIDebaterSelection(...args),
}));

jest.mock('@/hooks/debate/usePersonalitySelection', () => ({
  usePersonalitySelection: (...args: unknown[]) => mockUsePersonalitySelection(...args),
}));

jest.mock('@/hooks/debate/useDebateValidation', () => ({
  useDebateValidation: (...args: unknown[]) => mockUseDebateValidation(...args),
}));

const mockCalculateEstimatedDuration = jest.fn();
const mockValidateDebateConfiguration = jest.fn();
const mockPreviewDebate = jest.fn();

jest.mock('@/services/debate/DebateSetupService', () => ({
  DebateSetupService: {
    calculateEstimatedDuration: (...args: unknown[]) => mockCalculateEstimatedDuration(...args),
    validateDebateConfiguration: (...args: unknown[]) => mockValidateDebateConfiguration(...args),
    previewDebate: (...args: unknown[]) => mockPreviewDebate(...args),
  },
}));

const mockConvertToDebater = jest.fn();

jest.mock('@/services/debate/DebaterSelectionService', () => ({
  DebaterSelectionService: {
    convertToDebater: (...args: unknown[]) => mockConvertToDebater(...args),
  },
}));

describe('useDebateSetup', () => {
  const navigation = { navigate: jest.fn() };
  const debaterA = createMockDebater({ id: 'ai-1' });
  const debaterB = createMockDebater({ id: 'ai-2', provider: 'openai' });
  const personality = createMockPersonality({ id: 'p1' });

  const stepManagement = {
    currentStep: 'topic',
    goToStep: jest.fn(),
    nextStep: jest.fn(),
    previousStep: jest.fn(),
    resetSteps: jest.fn(),
    markStepCompleted: jest.fn(),
  };

  const topicManagement = {
    selectedTopic: 'Saved Topic',
    topicMode: 'custom',
    customTopic: 'Saved Topic',
    suggestedTopics: [],
    currentTopic: 'Saved Topic',
    setCustomTopic: jest.fn(),
    selectSuggestedTopic: jest.fn(),
    setTopicMode: jest.fn(),
    resetTopic: jest.fn(),
  };

  const aiSelection = {
    selectedAIs: [debaterA],
    toggleAI: jest.fn(),
    clearSelection: jest.fn(),
    selectionSummary: { count: 1 },
    canProceed: false,
  };

  const personalitySelection = {
    selectedPersonalities: buildPersonalityMap([[debaterA.id, personality]]),
    setPersonality: jest.fn(),
    resetPersonalities: jest.fn(),
  };

  let validation: UseDebateValidationReturn & {
    canStartDebate: boolean;
    getNextAction: jest.Mock;
    isStepValid: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    validation = {
      validateTopic: jest.fn(),
      validateAISelection: jest.fn(),
      validatePersonalities: jest.fn(),
      canStartDebate: true,
      validationErrors: [],
      overallValidation: { isValid: true, errors: [], warnings: [], message: 'ok' },
      topicValidation: { isValid: true, errors: [], warnings: [] },
      aiValidation: { isValid: true, errors: [], warnings: [] },
      personalityValidation: { isValid: true, errors: [], warnings: [] },
      getValidationSummary: jest.fn().mockReturnValue({ canProceed: true, nextAction: null }),
      getNextAction: jest.fn().mockReturnValue(null),
      isStepValid: jest.fn().mockReturnValue(true),
    };

    mockUseSelector.mockImplementation((selector: (state: unknown) => unknown) =>
      selector({ debateStats: { preservedTopic: 'Saved Topic', preservedTopicMode: 'custom' } })
    );

    mockUseDebateSteps.mockReturnValue(stepManagement);
    mockUseDebateTopic.mockImplementation((initialTopic, initialMode) => {
      expect(initialTopic).toBe('Saved Topic');
      expect(initialMode).toBe('custom');
      return topicManagement;
    });
    mockUseAIDebaterSelection.mockReturnValue(aiSelection);
    mockUsePersonalitySelection.mockReturnValue(personalitySelection);
    mockUseDebateValidation.mockReturnValue(validation);

    mockCalculateEstimatedDuration.mockReturnValue(30);
    mockValidateDebateConfiguration.mockReturnValue({ isValid: true, errors: [] });
    mockPreviewDebate.mockReturnValue({ canStart: true, missingElements: [], recommendations: [], warnings: [] });
    mockConvertToDebater.mockImplementation(ai => ({ ...ai, converted: true }));
  });

  it('coordinates step transitions, topic updates, and start flow', async () => {
    const { result } = renderHook(() => useDebateSetup(navigation, true));

    act(() => {
      result.current.actions.updateTopic('New Topic', 'preset');
    });

    expect(topicManagement.selectSuggestedTopic).toHaveBeenCalledWith('New Topic');
    expect(topicManagement.setTopicMode).toHaveBeenCalledWith('preset');

    act(() => {
      result.current.actions.toggleAI(debaterB);
    });
    expect(mockConvertToDebater).toHaveBeenCalledWith(debaterB);
    expect(aiSelection.toggleAI).toHaveBeenCalledWith({ ...debaterB, converted: true });

    validation.isStepValid.mockReturnValueOnce(true);
    act(() => {
      result.current.actions.nextStep();
    });
    expect(validation.isStepValid).toHaveBeenCalledWith('topic');
    expect(stepManagement.markStepCompleted).toHaveBeenCalledWith('topic');
    expect(stepManagement.nextStep).toHaveBeenCalled();

    act(() => {
      result.current.actions.previousStep();
      result.current.actions.resetSetup();
    });
    expect(stepManagement.previousStep).toHaveBeenCalled();
    expect(stepManagement.resetSteps).toHaveBeenCalled();
    expect(topicManagement.resetTopic).toHaveBeenCalled();
    expect(aiSelection.clearSelection).toHaveBeenCalled();
    expect(personalitySelection.resetPersonalities).toHaveBeenCalled();

    await act(async () => {
      await result.current.actions.startDebate();
    });

    expect(mockCalculateEstimatedDuration).toHaveBeenCalledWith('Saved Topic', aiSelection.selectedAIs);
    expect(mockValidateDebateConfiguration).toHaveBeenCalled();
    expect(navigation.navigate).toHaveBeenCalledWith('Debate', {
      selectedAIs: aiSelection.selectedAIs,
      topic: 'Saved Topic',
      personalities: Object.fromEntries(personalitySelection.selectedPersonalities),
    });

    const summary = result.current.getConfigurationSummary();
    expect(mockPreviewDebate).toHaveBeenCalled();
    expect(summary.canStart).toBe(true);
    expect(result.current.getEstimatedDuration()).toBe(30);
    expect(result.current.canProceed).toBe(true);
  });

  it('prevents navigation when validation fails', async () => {
    validation.canStartDebate = false;
    validation.getNextAction.mockReturnValue('Fix something');

    const { result } = renderHook(() => useDebateSetup(navigation, false));

    await expect(result.current.actions.startDebate()).rejects.toThrow('Cannot start debate: Fix something');
    expect(navigation.navigate).not.toHaveBeenCalled();
  });
});
