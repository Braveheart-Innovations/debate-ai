import { renderHook, act } from '@testing-library/react-native';
import { Keyboard } from 'react-native';
import { useChatInput } from '@/hooks/chat/useChatInput';

describe('useChatInput', () => {
  beforeEach(() => {
    jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('tracks user input state and validation', () => {
    const { result } = renderHook(() => useChatInput());

    expect(result.current.isEmpty).toBe(true);
    expect(result.current.isValid).toBe(false);

    act(() => {
      result.current.handleInputChange('Hello world');
    });

    expect(result.current.inputText).toBe('Hello world');
    expect(result.current.characterCount).toBe(11);
    expect(result.current.wordCount).toBe(2);
    expect(result.current.isValid).toBe(true);

    act(() => {
      result.current.clearInput();
    });

    expect(result.current.inputText).toBe('');
    expect(result.current.isEmpty).toBe(true);

    act(() => {
      result.current.dismissKeyboard();
    });

    expect(Keyboard.dismiss).toHaveBeenCalled();
  });
});
