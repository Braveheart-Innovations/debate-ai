import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
  type ExpoSpeechRecognitionErrorCode,
} from 'expo-speech-recognition';

/**
 * The recognizer is a device-wide singleton whose events reach every mounted
 * listener, and several composers can be mounted at once (tab screens stay
 * alive). Only the instance that started the session may react to its events.
 */
interface DictationSession {
  /** Set once the recognizer reports this session's `start` event. */
  started: boolean;
  cancel: () => void;
}
let activeSession: DictationSession | null = null;

const isActive = (session: DictationSession | null): session is DictationSession =>
  session !== null && session === activeSession;

/** Errors that just mean "nothing to transcribe" — end quietly. */
const SILENT_ERRORS: ReadonlySet<ExpoSpeechRecognitionErrorCode> = new Set([
  'no-speech',
  'speech-timeout',
]);

const ERROR_MESSAGES: Partial<Record<ExpoSpeechRecognitionErrorCode, string>> = {
  'not-allowed': 'Microphone access is off. Turn it on in Settings to dictate.',
  'service-not-allowed': 'Speech recognition is off for this app. Turn it on in Settings to dictate.',
  network: 'Dictation needs a connection right now. Check your network and try again.',
  'language-not-supported': "Dictation isn't available for your language on this device.",
  'audio-capture': "Couldn't access the microphone. Try again.",
  busy: 'The microphone is busy. Try again in a moment.',
};
const GENERIC_ERROR = 'Dictation stopped unexpectedly. Try again.';

const isRecognitionAvailable = (): boolean => {
  try {
    return ExpoSpeechRecognitionModule.isRecognitionAvailable();
  } catch {
    return false;
  }
};

const deviceLocale = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || 'en-US';
  } catch {
    return 'en-US';
  }
};

/** Continuous recognition needs Android 13+; older devices stop at the first pause. */
const supportsContinuous = (): boolean =>
  Platform.OS === 'ios' || (Platform.OS === 'android' && Number(Platform.Version) >= 33);

const joinSpoken = (...parts: string[]): string =>
  parts
    .map(part => part.trim())
    .filter(Boolean)
    .join(' ');

/** Appends dictated words to whatever was in the input when dictation began. */
export const composeDictatedText = (base: string, spoken: string): string => {
  if (!spoken) return base;
  if (!base || /\s$/.test(base)) return base + spoken;
  return `${base} ${spoken}`;
};

export interface UseDictationOptions {
  /** Current input value; becomes the prefix dictated words are appended to. */
  text: string;
  onTextChange: (text: string) => void;
  maxLength?: number;
  /** Turning this off mid-session cancels dictation. */
  enabled?: boolean;
}

export interface UseDictationResult {
  isAvailable: boolean;
  isListening: boolean;
  error: string | null;
  start: () => Promise<void>;
  /** Finishes the session, keeping the last words recognized. */
  stop: () => void;
  /** Ends the session immediately and ignores any results still in flight. */
  cancel: () => void;
  toggle: () => void;
  clearError: () => void;
}

/**
 * Speech-to-text into a text input via the platform recognizer (Siri / Google).
 * Interim words stream into the input as they are heard; finalized segments
 * accumulate so continuous dictation survives pauses.
 */
export function useDictation({
  text,
  onTextChange,
  maxLength,
  enabled = true,
}: UseDictationOptions): UseDictationResult {
  const [isAvailable] = useState(isRecognitionAvailable);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sessionRef = useRef<DictationSession | null>(null);
  const baseTextRef = useRef('');
  const finalTextRef = useRef('');
  const textRef = useRef(text);
  const onTextChangeRef = useRef(onTextChange);
  const maxLengthRef = useRef(maxLength);
  textRef.current = text;
  onTextChangeRef.current = onTextChange;
  maxLengthRef.current = maxLength;

  const release = useCallback(() => {
    if (activeSession === sessionRef.current) activeSession = null;
    sessionRef.current = null;
    setIsListening(false);
  }, []);

  const cancel = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    const recording = isActive(session);
    release();
    if (!recording) return; // Still at the permission prompt; start() bails out.
    try {
      ExpoSpeechRecognitionModule.abort();
    } catch {
      // Already stopped.
    }
  }, [release]);

  const stop = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    // Not recording yet, or the recognizer never confirmed it started (so no
    // `end` is coming to release us) — nothing to finish, just drop it.
    if (!isActive(session) || !session.started) {
      cancel();
      return;
    }
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      release();
    }
  }, [cancel, release]);

  const start = useCallback(async () => {
    if (!isAvailable || !enabled || sessionRef.current) return;
    setError(null);

    const session: DictationSession = { started: false, cancel };
    sessionRef.current = session;
    setIsListening(true);

    try {
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (sessionRef.current !== session) return;
      if (!permission.granted) {
        release();
        setError(ERROR_MESSAGES['not-allowed'] ?? GENERIC_ERROR);
        return;
      }

      // Another composer (e.g. on a backgrounded tab) may still be listening.
      activeSession?.cancel();
      activeSession = session;
      baseTextRef.current = textRef.current;
      finalTextRef.current = '';

      ExpoSpeechRecognitionModule.start({
        lang: deviceLocale(),
        interimResults: true,
        continuous: supportsContinuous(),
        addsPunctuation: true,
        iosTaskHint: 'dictation',
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    } catch {
      if (sessionRef.current === session) {
        release();
        setError(GENERIC_ERROR);
      }
    }
  }, [cancel, enabled, isAvailable, release]);

  const toggle = useCallback(() => {
    if (sessionRef.current) {
      stop();
    } else {
      void start();
    }
  }, [start, stop]);

  const clearError = useCallback(() => setError(null), []);

  useSpeechRecognitionEvent('result', event => {
    if (!isActive(sessionRef.current)) return;
    const transcript = event.results[0]?.transcript ?? '';
    let spoken: string;
    if (event.isFinal) {
      finalTextRef.current = joinSpoken(finalTextRef.current, transcript);
      spoken = finalTextRef.current;
    } else {
      spoken = joinSpoken(finalTextRef.current, transcript);
    }
    let next = composeDictatedText(baseTextRef.current, spoken);
    if (maxLengthRef.current !== undefined) next = next.slice(0, maxLengthRef.current);
    onTextChangeRef.current(next);
  });

  useSpeechRecognitionEvent('start', () => {
    if (isActive(sessionRef.current)) sessionRef.current.started = true;
  });

  // An aborted session's trailing `end`/`aborted` can land after a new session
  // was requested; lifecycle events only count once this session has started.
  useSpeechRecognitionEvent('error', event => {
    if (!isActive(sessionRef.current) || event.error === 'aborted') return;
    if (!SILENT_ERRORS.has(event.error)) {
      setError(ERROR_MESSAGES[event.error] ?? GENERIC_ERROR);
    }
    release();
  });

  useSpeechRecognitionEvent('end', () => {
    if (!isActive(sessionRef.current) || !sessionRef.current.started) return;
    release();
  });

  useEffect(() => {
    if (!enabled) cancel();
  }, [enabled, cancel]);

  useEffect(() => cancel, [cancel]);

  return { isAvailable, isListening, error, start, stop, cancel, toggle, clearError };
}

export default useDictation;
