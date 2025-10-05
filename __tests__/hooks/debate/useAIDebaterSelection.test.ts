import { act, renderHook } from '@testing-library/react-native';
import { useAIDebaterSelection } from '@/hooks/debate/useAIDebaterSelection';
import { createMockDebater } from '../../../test-utils/hooks/debateFixtures';
import type { AIDebater } from '@/types/debate';

const mockValidateSelection = jest.fn();
const mockGetSelectionSummary = jest.fn();
const mockIsAISelected = jest.fn();
const mockGetRecommendedPairs = jest.fn();
const mockGetOptimalDebaters = jest.fn();
const mockConvertToDebater = jest.fn();

jest.mock('@/services/debate/DebaterSelectionService', () => ({
  DebaterSelectionService: {
    validateSelection: (...args: unknown[]) => mockValidateSelection(...args),
    getSelectionSummary: (...args: unknown[]) => mockGetSelectionSummary(...args),
    isAISelected: (...args: unknown[]) => mockIsAISelected(...args),
    getRecommendedPairs: (...args: unknown[]) => mockGetRecommendedPairs(...args),
    getOptimalDebaters: (...args: unknown[]) => mockGetOptimalDebaters(...args),
    convertToDebater: (...args: unknown[]) => mockConvertToDebater(...(args as [AIDebater])),
  },
}));

describe('useAIDebaterSelection', () => {
  const debaterOne = createMockDebater({ id: 'ai-1', provider: 'claude', name: 'Claude' });
  const debaterTwo = createMockDebater({ id: 'ai-2', provider: 'openai', name: 'GPT-4' });
  const debaterThree = createMockDebater({ id: 'ai-3', provider: 'google', name: 'Gemini' });

  beforeEach(() => {
    jest.clearAllMocks();

    mockValidateSelection.mockImplementation((selected: AIDebater[]) => ({
      isValid: selected.length === 2,
      message: selected.length === 2 ? undefined : 'Select 2 debaters',
      errors: selected.length === 2 ? [] : ['Select 2 debaters'],
      warnings: [],
    }));

    mockGetSelectionSummary.mockImplementation((selected: AIDebater[]) => ({
      count: selected.length,
      providers: selected.map(ai => ai.provider),
      isValid: selected.length === 2,
      canProceed: selected.length === 2,
    }));

    mockIsAISelected.mockImplementation((selected: AIDebater[], id: string) =>
      selected.some(ai => ai.id === id)
    );

    mockGetRecommendedPairs.mockImplementation((available: AIDebater[]) =>
      available.length >= 2 ? [[available[0], available[1]]] : []
    );

    mockGetOptimalDebaters.mockImplementation((_topic: string, available: AIDebater[]) => available);
    mockConvertToDebater.mockImplementation((ai: AIDebater) => ({ ...ai, converted: true }));
  });

  it('adds and removes debaters while enforcing selection limits', () => {
    const { result } = renderHook(() => useAIDebaterSelection([], 2));

    act(() => {
      result.current.toggleAI(debaterOne);
      result.current.toggleAI(debaterTwo);
    });

    expect(result.current.selectedAIs).toHaveLength(2);
    expect(result.current.canProceed).toBe(true);
    expect(result.current.maxReached).toBe(true);
    expect(result.current.selectionSummary.count).toBe(2);

    act(() => {
      result.current.toggleAI(debaterThree);
    });

    expect(result.current.selectedAIs).toHaveLength(2);

    act(() => {
      result.current.toggleAI(debaterOne);
    });

    expect(result.current.selectedAIs).toEqual([debaterTwo]);
    expect(result.current.isValidSelection).toBe(false);
    expect(result.current.validationMessage).toBe('Select 2 debaters');
  });

  it('supports direct add/remove helpers and recommended selections', () => {
    const { result } = renderHook(() => useAIDebaterSelection([debaterOne], 3));

    act(() => {
      const added = result.current.addAI(debaterTwo);
      expect(added).toBe(true);
    });

    expect(result.current.selectedAIs).toHaveLength(2);

    act(() => {
      const removed = result.current.removeAI(debaterOne.id);
      expect(removed).toBe(true);
    });

    expect(result.current.selectedAIs).toEqual([debaterTwo]);

    act(() => {
      result.current.selectRecommendedPair([debaterTwo, debaterThree]);
    });

    expect(result.current.selectedAIs).toEqual([debaterTwo, debaterThree]);
    expect(result.current.selectionSummary.providers).toEqual(['openai', 'google']);
  });

  it('optimizes selection for a topic and clears as needed', () => {
    mockGetOptimalDebaters.mockReturnValueOnce([debaterThree, debaterTwo, debaterOne]);

    const { result } = renderHook(() => useAIDebaterSelection([debaterOne], 2));

    act(() => {
      result.current.optimizeForTopic('Future of AI', [debaterOne, debaterTwo, debaterThree]);
    });

    expect(mockGetOptimalDebaters).toHaveBeenCalledWith('Future of AI', [debaterOne, debaterTwo, debaterThree]);
    expect(result.current.selectedAIs).toEqual([debaterThree, debaterTwo]);
    expect(result.current.isAISelected('ai-3')).toBe(true);

    act(() => {
      result.current.clearSelection();
    });

    expect(result.current.selectedAIs).toHaveLength(0);
  });
});
