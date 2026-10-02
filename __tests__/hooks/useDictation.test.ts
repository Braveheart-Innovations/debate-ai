import { act, renderHook } from '@testing-library/react-native';
import * as speechRecognition from 'expo-speech-recognition';
import { composeDictatedText, useDictation } from '@/hooks/useDictation';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
}));

const { ExpoSpeechRecognitionModule } = speechRecognition;
// Root __mocks__/expo-speech-recognition.ts adds these test helpers.
const speech = speechRecognition as unknown as {
  __emit: (eventName: string, payload?: unknown) => void;
  __reset: () => void;
};
const mockModule = ExpoSpeechRecognitionModule as unknown as {
  [K in keyof typeof ExpoSpeechRecognitionModule]: jest.Mock;
};

const result = (transcript: string, isFinal: boolean) => ({
  isFinal,
  results: [{ transcript, confidence: 0.9, segments: [] }],
});

const setup = (initialText = '', options: { maxLength?: number; enabled?: boolean } = {}) => {
  const onTextChange = jest.fn();
  const hook = renderHook(
    ({ text, enabled }: { text: string; enabled?: boolean }) =>
      useDictation({ text, onTextChange, maxLength: options.maxLength, enabled }),
    { initialProps: { text: initialText, enabled: options.enabled } }
  );
  return { ...hook, onTextChange };
};

const startListening = async (hook: ReturnType<typeof setup>) => {
  await act(async () => {
    await hook.result.current.start();
  });
  act(() => speech.__emit('start'));
};

describe('composeDictatedText', () => {
  it('appends with a single separating space', () => {
    expect(composeDictatedText('', 'hello')).toBe('hello');
    expect(composeDictatedText('Debate', 'nuclear power')).toBe('Debate nuclear power');
    expect(composeDictatedText('Debate ', 'nuclear power')).toBe('Debate nuclear power');
    expect(composeDictatedText('Line one\n', 'two')).toBe('Line one\ntwo');
    expect(composeDictatedText('unchanged', '')).toBe('unchanged');
  });
});

describe('useDictation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    speech.__reset();
  });

  it('starts the platform recognizer with interim results', async () => {
    const hook = setup();
    await startListening(hook);

    expect(hook.result.current.isListening).toBe(true);
    expect(mockModule.start).toHaveBeenCalledWith(
      expect.objectContaining({ interimResults: true, addsPunctuation: true })
    );
  });

  it('streams interim words and accumulates finalized segments after the existing text', async () => {
    const hook = setup('Debate');
    await startListening(hook);

    act(() => speech.__emit('result', result('whether', false)));
    expect(hook.onTextChange).toHaveBeenLastCalledWith('Debate whether');

    act(() => speech.__emit('result', result('whether cities', true)));
    act(() => speech.__emit('result', result(' should ban', false)));
    expect(hook.onTextChange).toHaveBeenLastCalledWith('Debate whether cities should ban');

    act(() => speech.__emit('result', result(' should ban cars', true)));
    expect(hook.onTextChange).toHaveBeenLastCalledWith('Debate whether cities should ban cars');
  });

  it('clamps dictated text to maxLength', async () => {
    const hook = setup('', { maxLength: 5 });
    await startListening(hook);

    act(() => speech.__emit('result', result('hello world', false)));
    expect(hook.onTextChange).toHaveBeenLastCalledWith('hello');
  });

  it('stop asks the recognizer to finish and the end event releases the session', async () => {
    const hook = setup();
    await startListening(hook);

    act(() => hook.result.current.stop());
    expect(mockModule.stop).toHaveBeenCalled();
    expect(hook.result.current.isListening).toBe(true);

    act(() => speech.__emit('end'));
    expect(hook.result.current.isListening).toBe(false);
  });

  it('cancel aborts and ignores results still in flight', async () => {
    const hook = setup();
    await startListening(hook);

    act(() => hook.result.current.cancel());
    expect(mockModule.abort).toHaveBeenCalled();
    expect(hook.result.current.isListening).toBe(false);

    act(() => speech.__emit('result', result('late words', true)));
    expect(hook.onTextChange).not.toHaveBeenCalled();
  });

  it('surfaces a settings hint when microphone permission is denied', async () => {
    mockModule.requestPermissionsAsync.mockResolvedValueOnce({
      granted: false,
      canAskAgain: false,
      expires: 'never',
      status: 'denied',
    });
    const hook = setup();
    await act(async () => {
      await hook.result.current.start();
    });

    expect(mockModule.start).not.toHaveBeenCalled();
    expect(hook.result.current.isListening).toBe(false);
    expect(hook.result.current.error).toMatch(/Settings/);
  });

  it('maps recognizer errors to copy but ends quietly when nothing was heard', async () => {
    const hook = setup();
    await startListening(hook);
    act(() => speech.__emit('error', { error: 'no-speech', message: '' }));
    expect(hook.result.current.isListening).toBe(false);
    expect(hook.result.current.error).toBeNull();

    await startListening(hook);
    act(() => speech.__emit('error', { error: 'network', message: '' }));
    expect(hook.result.current.error).toMatch(/connection/);
  });

  it('reports unavailable when the device has no recognizer', () => {
    mockModule.isRecognitionAvailable.mockReturnValueOnce(false);
    const hook = setup();
    expect(hook.result.current.isAvailable).toBe(false);
  });

  it('only the composer that started dictation receives its words', async () => {
    const first = setup('first');
    const second = setup('second');
    await startListening(first);

    act(() => speech.__emit('result', result('hello', false)));
    expect(first.onTextChange).toHaveBeenLastCalledWith('first hello');
    expect(second.onTextChange).not.toHaveBeenCalled();
  });

  it('a new composer takes over the recognizer without being ended by the old session', async () => {
    const first = setup();
    const second = setup();
    await startListening(first);

    await act(async () => {
      await second.result.current.start();
    });
    expect(mockModule.abort).toHaveBeenCalled();
    expect(first.result.current.isListening).toBe(false);

    // The aborted session's trailing end arrives before the new start.
    act(() => speech.__emit('end'));
    expect(second.result.current.isListening).toBe(true);

    act(() => speech.__emit('start'));
    act(() => speech.__emit('result', result('mine', false)));
    expect(second.onTextChange).toHaveBeenLastCalledWith('mine');
    expect(first.onTextChange).not.toHaveBeenCalled();
  });

  it('cancels when disabled mid-session and on unmount', async () => {
    const hook = setup('', { enabled: true });
    await startListening(hook);

    hook.rerender({ text: '', enabled: false });
    expect(mockModule.abort).toHaveBeenCalledTimes(1);
    expect(hook.result.current.isListening).toBe(false);

    hook.rerender({ text: '', enabled: true });
    await startListening(hook);
    hook.unmount();
    expect(mockModule.abort).toHaveBeenCalledTimes(2);
  });

  it('does not start recording if cancelled while the permission prompt is open', async () => {
    let grant: (value: unknown) => void = () => {};
    mockModule.requestPermissionsAsync.mockReturnValueOnce(
      new Promise(resolve => {
        grant = resolve;
      })
    );
    const hook = setup();
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = hook.result.current.start();
    });
    expect(hook.result.current.isListening).toBe(true);

    act(() => hook.result.current.stop());
    await act(async () => {
      grant({ granted: true, canAskAgain: true, expires: 'never', status: 'granted' });
      await pending;
    });

    expect(mockModule.start).not.toHaveBeenCalled();
    expect(hook.result.current.isListening).toBe(false);
  });
});
