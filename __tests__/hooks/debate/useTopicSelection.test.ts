import { act, renderHook } from '@testing-library/react-native';
import { useTopicSelection } from '@/hooks/debate/useTopicSelection';

const mockGenerateRandomTopicString = jest.fn();

jest.mock('@/services/debate/TopicService', () => ({
  TopicService: {
    generateRandomTopicString: (...args: unknown[]) => mockGenerateRandomTopicString(...args),
  },
}));

describe('useTopicSelection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGenerateRandomTopicString.mockReturnValue('Random Motion');
  });

  it('manages preset and custom topic modes', () => {
    const { result } = renderHook(() => useTopicSelection('Initial Motion'));

    expect(result.current.finalTopic).toBe('Initial Motion');
    expect(result.current.isTopicSelected).toBe(true);

    act(() => {
      result.current.setTopicMode('custom');
      result.current.setCustomTopic('Custom Motion');
    });

    expect(result.current.topicMode).toBe('custom');
    expect(result.current.finalTopic).toBe('Custom Motion');

    act(() => {
      result.current.setSelectedTopic('Preset Motion');
    });

    expect(result.current.selectedTopic).toBe('Preset Motion');
    expect(result.current.isTopicSelected).toBe(true);
  });

  it('supports random topic selection, validation, and reset', () => {
    const { result } = renderHook(() => useTopicSelection());

    expect(result.current.isTopicSelected).toBe(false);

    act(() => {
      result.current.selectRandomTopic();
    });

    expect(mockGenerateRandomTopicString).toHaveBeenCalled();
    expect(result.current.selectedTopic).toBe('Random Motion');
    expect(result.current.showTopicDropdown).toBe(false);

    expect(result.current.validateCurrentTopic()).toEqual({ valid: true });

    act(() => {
      result.current.reset();
    });

    expect(result.current.selectedTopic).toBe('');
    expect(result.current.customTopic).toBe('');
    expect(result.current.showTopicDropdown).toBe(false);
    expect(result.current.validateCurrentTopic()).toEqual({ valid: false, error: 'Please select or enter a motion' });
  });
});
