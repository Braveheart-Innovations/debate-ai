import { useEffect, useRef } from 'react';

type Listener = (payload: unknown) => void;

const listeners: Record<string, Set<Listener>> = {};

export const ExpoSpeechRecognitionModule = {
  isRecognitionAvailable: jest.fn(() => true),
  requestPermissionsAsync: jest.fn(async () => ({
    granted: true,
    canAskAgain: true,
    expires: 'never',
    status: 'granted',
  })),
  getPermissionsAsync: jest.fn(async () => ({
    granted: true,
    canAskAgain: true,
    expires: 'never',
    status: 'granted',
  })),
  start: jest.fn(),
  stop: jest.fn(),
  abort: jest.fn(),
  supportsOnDeviceRecognition: jest.fn(() => true),
};

export function useSpeechRecognitionEvent(eventName: string, listener: Listener) {
  const listenerRef = useRef(listener);
  listenerRef.current = listener;

  useEffect(() => {
    const handler: Listener = payload => listenerRef.current(payload);
    (listeners[eventName] ??= new Set()).add(handler);
    return () => {
      listeners[eventName]?.delete(handler);
    };
  }, [eventName]);
}

/** Test helper: deliver a native recognizer event to every subscribed hook. */
export function __emit(eventName: string, payload: unknown = null) {
  listeners[eventName]?.forEach(listener => listener(payload));
}

/** Test helper: restore default availability/permission behavior. */
export function __reset() {
  ExpoSpeechRecognitionModule.isRecognitionAvailable.mockImplementation(() => true);
  ExpoSpeechRecognitionModule.requestPermissionsAsync.mockImplementation(async () => ({
    granted: true,
    canAskAgain: true,
    expires: 'never',
    status: 'granted',
  }));
}
