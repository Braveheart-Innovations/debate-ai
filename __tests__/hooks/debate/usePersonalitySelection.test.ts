import { act, renderHook } from '@testing-library/react-native';
import { usePersonalitySelection } from '@/hooks/debate/usePersonalitySelection';
import { createMockDebater, createMockPersonality, buildPersonalityMap } from '../../../test-utils/hooks/debateFixtures';
import type { Personality } from '@/types/debate';

const mockGetAvailablePersonalities = jest.fn();
const mockGetDefaultPersonality = jest.fn();
const mockValidatePersonalitySelection = jest.fn();
const mockGetRecommendedCombinations = jest.fn();
const mockGetCompatibilityScore = jest.fn();
const mockGetPersonalityById = jest.fn();

jest.mock('@/services/debate/PersonalityService', () => ({
  PersonalityService: {
    getAvailablePersonalities: (...args: unknown[]) => mockGetAvailablePersonalities(...args),
    getDefaultPersonality: (...args: unknown[]) => mockGetDefaultPersonality(...args),
    validatePersonalitySelection: (...args: unknown[]) => mockValidatePersonalitySelection(...args),
    getRecommendedCombinations: (...args: unknown[]) => mockGetRecommendedCombinations(...args),
    getCompatibilityScore: (...args: unknown[]) => mockGetCompatibilityScore(...args),
    getPersonalityById: (...args: unknown[]) => mockGetPersonalityById(...args),
  },
}));

describe('usePersonalitySelection', () => {
  const debaterA = createMockDebater({ id: 'ai-1' });
  const debaterB = createMockDebater({ id: 'ai-2', provider: 'openai' });

  const defaultPersonality = createMockPersonality({ id: 'default' });
  const fieryPersonality = createMockPersonality({
    id: 'fiery',
    name: 'Fiery Advocate',
    debateModifiers: { argumentStyle: 'emotional', interruption: 0.8, concession: 0.1, aggression: 0.9 },
  });
  const calmPersonality = createMockPersonality({ id: 'calm', name: 'Calm Mediator' });

  let randomSpy: jest.SpyInstance<number, []>;

  beforeEach(() => {
    jest.clearAllMocks();
    randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.25);

    mockGetAvailablePersonalities.mockReturnValue([defaultPersonality, fieryPersonality, calmPersonality]);
    mockGetDefaultPersonality.mockReturnValue(defaultPersonality);
    mockValidatePersonalitySelection.mockImplementation((selection: Map<string, Personality>) => ({
      isValid: selection.size > 0,
      message: selection.size > 0 ? undefined : 'Assign personalities',
      errors: selection.size > 0 ? [] : ['Assign personalities'],
      warnings: [],
    }));
    mockGetRecommendedCombinations.mockReturnValue([
      { id: 'balanced', name: 'Balanced Debate', personalities: ['default', 'calm'] },
    ]);
    mockGetCompatibilityScore.mockImplementation((left: Personality, right: Personality) =>
      left.id === right.id ? 90 : 70
    );
    mockGetPersonalityById.mockImplementation((id: string) =>
      [defaultPersonality, fieryPersonality, calmPersonality].find(p => p.id === id) || null
    );
  });

  afterEach(() => {
    randomSpy.mockRestore();
  });

  it('initializes defaults and tracks custom assignments', () => {
    const { result } = renderHook(() =>
      usePersonalitySelection([debaterA, debaterB], buildPersonalityMap([[debaterA.id, fieryPersonality]]))
    );

    expect(result.current.selectedPersonalities.get(debaterA.id)).toBe(fieryPersonality);
    expect(result.current.selectedPersonalities.get(debaterB.id)).toBe(defaultPersonality);
    expect(result.current.availablePersonalities).toHaveLength(3);

    act(() => {
      result.current.setPersonality(debaterB.id, calmPersonality);
    });

    expect(result.current.hasCustomPersonalities).toBe(true);
    expect(result.current.getCompatibilityScore()).toBeGreaterThan(0);

    const summary = result.current.getSummary();
    expect(summary.totalAssigned).toBe(2);
    expect(summary.isValid).toBe(true);
    expect(summary.hasCustom).toBe(true);
  });

  it('applies recommendations, randomizes, and resets as expected', () => {
    const { result } = renderHook(() => usePersonalitySelection([debaterA, debaterB]));

    act(() => {
      const applied = result.current.applyRecommendedCombination({ personalities: ['default', 'calm'] });
      expect(applied).toBe(true);
    });

    expect(result.current.selectedPersonalities.get(debaterB.id)).toBe(calmPersonality);

    act(() => {
      result.current.randomizePersonalities();
    });

    expect(result.current.selectedPersonalities.size).toBe(2);

    act(() => {
      result.current.resetPersonalities();
    });

    expect(result.current.selectedPersonalities.get(debaterA.id)).toBe(defaultPersonality);
    expect(result.current.selectedPersonalities.get(debaterB.id)).toBe(defaultPersonality);
  });
});
