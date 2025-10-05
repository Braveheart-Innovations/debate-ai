import { renderHook } from '@testing-library/react-native';
import { useDebateValidation } from '@/hooks/debate/useDebateValidation';
import { createMockDebater, createMockPersonality, buildPersonalityMap } from '../../../test-utils/hooks/debateFixtures';
import type { AIDebater, Personality, ValidationResult } from '@/types/debate';

const mockValidateTopic = jest.fn<ValidationResult, [string]>();
const mockValidateSelection = jest.fn<ValidationResult, [AIDebater[]]>();
const mockValidatePersonalities = jest.fn<ValidationResult, [Map<string, Personality>]>();
const mockGetTopicCategory = jest.fn<string | null, [string]>();

jest.mock('@/services/debate/TopicService', () => ({
  TopicService: {
    validateCustomTopic: (...args: unknown[]) => mockValidateTopic(...(args as [string])),
    getTopicCategory: (...args: unknown[]) => mockGetTopicCategory(...(args as [string])),
  },
}));

jest.mock('@/services/debate/DebaterSelectionService', () => ({
  DebaterSelectionService: {
    validateSelection: (...args: unknown[]) => mockValidateSelection(...(args as [AIDebater[]])),
  },
}));

jest.mock('@/services/debate/PersonalityService', () => ({
  PersonalityService: {
    validatePersonalitySelection: (...args: unknown[]) => mockValidatePersonalities(...(args as [Map<string, Personality>])),
  },
}));

describe('useDebateValidation', () => {
  const debaterA = createMockDebater({ id: 'ai-1', provider: 'anthropic' });
  const debaterB = createMockDebater({ id: 'ai-2', provider: 'anthropic', name: 'Second' });
  const personalityOne = createMockPersonality({ id: 'p1' });
  const personalityTwo = createMockPersonality({ id: 'p2' });

  beforeEach(() => {
    jest.clearAllMocks();

    mockValidateTopic.mockImplementation((topic: string) =>
      topic ? { isValid: true, errors: [], warnings: [], message: 'Topic ok' } : {
        isValid: false,
        errors: ['Topic is required'],
        warnings: [],
        message: 'Topic missing',
      }
    );

    mockValidateSelection.mockImplementation((ais: AIDebater[]) =>
      ais.length >= 2 ? {
        isValid: true,
        errors: [],
        warnings: ais.every(ai => ai.provider === ais[0].provider) ? ['Consider diverse providers'] : [],
        message: 'Selection ok',
      } : {
        isValid: false,
        errors: ['Select two debaters'],
        warnings: [],
        message: 'Need more debaters',
      }
    );

    mockValidatePersonalities.mockImplementation((map: Map<string, Personality>) =>
      map.size >= 2 ? {
        isValid: true,
        errors: [],
        warnings: [],
        message: 'All personalities set',
      } : {
        isValid: false,
        errors: ['Assign personalities'],
        warnings: [],
        message: 'Missing personalities',
      }
    );

    mockGetTopicCategory.mockReturnValue('Philosophy');
  });

  it('surfaces blocking errors and next actions for incomplete setups', () => {
    const { result, rerender } = renderHook(({ topic, ais, personalities }) =>
      useDebateValidation(topic, ais, personalities), {
      initialProps: {
        topic: '',
        ais: [] as AIDebater[],
        personalities: buildPersonalityMap([]),
      },
    });

    expect(result.current.topicValidation.isValid).toBe(false);
    expect(result.current.getNextAction()).toBe('Select or enter a valid debate motion');
    expect(result.current.isStepValid('ai')).toBe(false);

    rerender({
      topic: 'Should AI govern?',
      ais: [debaterA, debaterB],
      personalities: buildPersonalityMap([[debaterA.id, personalityOne]]),
    });

    expect(result.current.topicValidation.isValid).toBe(true);
    expect(result.current.aiValidation.isValid).toBe(true);
    expect(result.current.personalityValidation.isValid).toBe(false);
    expect(result.current.overallValidation.isValid).toBe(false);
    expect(result.current.overallValidation.warnings).toEqual(expect.arrayContaining([
      'Consider selecting AIs from different providers for more diverse perspectives',
    ]));
    expect(result.current.getNextAction()).toBe('Assign personalities to all selected AIs');
    expect(result.current.validationErrors).toContain('Assign personalities');
  });

  it('returns positive validation summary once all requirements met', () => {
    const { result, rerender } = renderHook(({ topic, ais, personalities }) =>
      useDebateValidation(topic, ais, personalities), {
      initialProps: {
        topic: 'Should AI govern?',
        ais: [debaterA, debaterB],
        personalities: buildPersonalityMap([[debaterA.id, personalityOne]]),
      },
    });

    expect(result.current.canStartDebate).toBe(false);

    rerender({
      topic: 'Should AI govern?',
      ais: [debaterA, debaterB],
      personalities: buildPersonalityMap([
        [debaterA.id, personalityOne],
        [debaterB.id, personalityTwo],
      ]),
    });

    expect(result.current.overallValidation.isValid).toBe(true);
    expect(result.current.canStartDebate).toBe(true);
    expect(result.current.getNextAction()).toBeNull();
    expect(result.current.getValidationSummary().canProceed).toBe(true);
    expect(result.current.isStepValid('review')).toBe(true);
  });
});
