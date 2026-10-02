import 'whatwg-fetch';
import mockSafeAreaContext from 'react-native-safe-area-context/jest/mock';

jest.mock('react-native-safe-area-context', () => mockSafeAreaContext);
jest.mock('react-native-reanimated', () => {
  const View = (require('react-native') as typeof import('react-native')).View;
  // Create a chainable animation mock where any method returns `this`
  const createAnimMock = (): Record<string, jest.Mock> => {
    const mock: Record<string, jest.Mock> = {};
    const handler: ProxyHandler<Record<string, jest.Mock>> = {
      get: (_target, prop) => {
        if (typeof prop === 'string') {
          if (!mock[prop]) {
            mock[prop] = jest.fn().mockReturnValue(new Proxy({}, handler));
          }
          return mock[prop];
        }
        return undefined;
      },
    };
    return new Proxy(mock, handler);
  };
  return {
    __esModule: true,
    default: {
      View,
      Text: (require('react-native') as typeof import('react-native')).Text,
      Image: (require('react-native') as typeof import('react-native')).Image,
      ScrollView: (require('react-native') as typeof import('react-native')).ScrollView,
      FlatList: (require('react-native') as typeof import('react-native')).FlatList,
      createAnimatedComponent: (component: unknown) => component,
    },
    // Stable across renders like the real hook, so it is safe in effect deps
    useSharedValue: (init: unknown) => (require('react') as typeof import('react')).useRef({ value: init }).current,
    useAnimatedStyle: jest.fn((fn: () => unknown) => fn()),
    useDerivedValue: jest.fn((fn: () => unknown) => ({ value: fn() })),
    useAnimatedScrollHandler: jest.fn(() => jest.fn()),
    withTiming: jest.fn((val: unknown) => val),
    withSpring: jest.fn((val: unknown) => val),
    withDelay: jest.fn((_: unknown, val: unknown) => val),
    withSequence: jest.fn((...vals: unknown[]) => vals[vals.length - 1]),
    withRepeat: jest.fn((val: unknown) => val),
    useReducedMotion: jest.fn(() => false),
    interpolate: jest.fn(),
    Extrapolation: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
    Extrapolate: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
    Easing: { linear: jest.fn(), ease: jest.fn(), bezier: jest.fn(() => jest.fn()), inOut: jest.fn((v: unknown) => v), in: jest.fn((v: unknown) => v), out: jest.fn((v: unknown) => v) },
    FadeIn: createAnimMock(),
    FadeOut: createAnimMock(),
    FadeInDown: createAnimMock(),
    FadeInUp: createAnimMock(),
    FadeOutUp: createAnimMock(),
    FadeOutDown: createAnimMock(),
    SlideInDown: createAnimMock(),
    SlideInUp: createAnimMock(),
    SlideInRight: createAnimMock(),
    SlideInLeft: createAnimMock(),
    SlideOutDown: createAnimMock(),
    SlideOutUp: createAnimMock(),
    SlideOutRight: createAnimMock(),
    SlideOutLeft: createAnimMock(),
    ZoomIn: createAnimMock(),
    ZoomOut: createAnimMock(),
    Layout: createAnimMock(),
    LinearTransition: createAnimMock(),
    runOnJS: jest.fn((fn: unknown) => fn),
    runOnUI: jest.fn((fn: unknown) => fn),
    cancelAnimation: jest.fn(),
    measure: jest.fn(),
    useAnimatedRef: jest.fn(() => ({ current: null })),
    useAnimatedProps: jest.fn((fn: () => unknown) => fn()),
  };
});
jest.mock('react-native-gesture-handler', () => require('react-native-gesture-handler/jestSetup'));
jest.mock('react-native-keyboard-controller', () => require('react-native-keyboard-controller/jest'));
jest.mock('@expo/vector-icons', () => {
  const React = require('react') as typeof import('react');
  const { Text } = require('react-native') as typeof import('react-native');

  const createIcon = (family: string) => {
    const Icon = ({ name, ...props }: { name?: string }) => (
      React.createElement(Text, props, `${family}:${name || ''}`)
    );
    Icon.displayName = family;
    return Icon;
  };

  return {
    Ionicons: createIcon('Ionicons'),
    MaterialIcons: createIcon('MaterialIcons'),
    MaterialCommunityIcons: createIcon('MaterialCommunityIcons'),
  };
});
jest.mock('react-native/Libraries/Modal/Modal', () => {
  const React = require('react') as typeof import('react');

  const ModalMock = ({
    children,
    visible = true,
    ...rest
  }: { children?: import('react').ReactNode; visible?: boolean; [prop: string]: unknown } = {}) => {
    if (!visible) return null;
    return React.createElement('Modal', { hardwareAccelerated: false, ...rest, visible }, children);
  };

  ModalMock.displayName = 'Modal';
  (ModalMock as unknown as { __esModule?: boolean }).__esModule = true;
  (ModalMock as unknown as { default?: unknown }).default = ModalMock;
  return ModalMock;
});

const modalModule = require('react-native/Libraries/Modal/Modal') as typeof import('react-native/Libraries/Modal/Modal');
if (!modalModule) {
  console.warn('Modal mock missing module', modalModule);
} else if (!(modalModule as { default?: unknown }).default) {
  console.warn('Modal mock missing default', Object.keys(modalModule));
}

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(),
  getStringAsync: jest.fn(),
}));

jest.mock('expo-file-system/legacy', () => ({
  writeAsStringAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  getInfoAsync: jest.fn().mockResolvedValue({ exists: true }),
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
  downloadAsync: jest.fn(async (_from: string, to: string) => ({ uri: to, status: 200 })),
  uploadAsync: jest.fn().mockResolvedValue({ status: 200, body: '', headers: {} }),
  documentDirectory: '/tmp',
  cacheDirectory: '/tmp/',
  EncodingType: { Base64: 'base64' },
  FileSystemUploadType: { BINARY_CONTENT: 0, MULTIPART: 1 },
}));

jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
  manipulateAsync: jest.fn().mockResolvedValue({ uri: '/tmp/optimized.jpg', base64: 'b3B0aW1pemVk' }),
}));

jest.mock('expo-video', () => {
  const React = require('react') as typeof import('react');
  const { View } = require('react-native') as typeof import('react-native');
  const createPlayer = () => {
    const listeners: Record<string, Array<(payload?: unknown) => void>> = {};
    const player = {
      playing: false,
      currentTime: 0,
      duration: 5,
      play: jest.fn(() => {
        if (player.currentTime >= player.duration) {
          return;
        }
        player.playing = true;
        player.__emit('playingChange', { isPlaying: true });
      }),
      pause: jest.fn(() => {
        player.playing = false;
        player.__emit('playingChange', { isPlaying: false });
      }),
      replay: jest.fn(),
      addListener: jest.fn((eventName: string, listener: (payload?: unknown) => void) => {
        listeners[eventName] = listeners[eventName] || [];
        listeners[eventName].push(listener);

        return {
          remove: jest.fn(() => {
            listeners[eventName] = (listeners[eventName] || []).filter(
              (candidate) => candidate !== listener
            );
          }),
        };
      }),
      __emit: jest.fn((eventName: string, payload?: unknown) => {
        if (eventName === 'playingChange' && typeof payload === 'object' && payload && 'isPlaying' in payload) {
          player.playing = Boolean((payload as { isPlaying?: boolean }).isPlaying);
        }
        if (eventName === 'playToEnd') {
          player.playing = false;
          player.currentTime = player.duration;
        }

        (listeners[eventName] || []).forEach((listener) => {
          if (eventName === 'playToEnd') {
            listener();
          } else {
            listener(payload);
          }
        });
      }),
    };

    return player;
  };
  return {
    VideoView: (props: Record<string, unknown>) => React.createElement(View, props),
    useVideoPlayer: jest.fn((_source: unknown, setup?: (player: ReturnType<typeof createPlayer>) => void) => {
      const playerRef = React.useRef<ReturnType<typeof createPlayer> | null>(null);
      if (!playerRef.current) {
        playerRef.current = createPlayer();
        setup?.(playerRef.current);
      }

      return playerRef.current;
    }),
  };
});

jest.mock('expo-audio', () => {
  const React = require('react') as typeof import('react');
  let playerId = 0;
  const createAudioPlayer = () => {
    const player = {
      id: `audio-player-${playerId += 1}`,
      playing: false,
      currentTime: 0,
      duration: 5,
      didJustFinish: false,
      play: jest.fn(() => {
        if (player.currentTime >= player.duration) {
          return;
        }
        player.playing = true;
        player.didJustFinish = false;
      }),
      pause: jest.fn(() => {
        player.playing = false;
      }),
      seekTo: jest.fn(async (seconds: number) => {
        player.currentTime = seconds;
        player.didJustFinish = false;
      }),
      setActiveForLockScreen: jest.fn(),
      updateLockScreenMetadata: jest.fn(),
      clearLockScreenControls: jest.fn(),
      __finish: jest.fn(() => {
        player.playing = false;
        player.currentTime = player.duration;
        player.didJustFinish = true;
      }),
    };

    return player;
  };

  return {
    setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
    useAudioPlayer: jest.fn(() => {
      const playerRef = React.useRef<ReturnType<typeof createAudioPlayer> | null>(null);
      if (!playerRef.current) {
        playerRef.current = createAudioPlayer();
      }

      return playerRef.current;
    }),
    useAudioPlayerStatus: jest.fn((player: ReturnType<typeof createAudioPlayer>) => ({
      id: player.id,
      currentTime: player.currentTime,
      playbackState: player.playing ? 'playing' : 'paused',
      timeControlStatus: player.playing ? 'playing' : 'paused',
      reasonForWaitingToPlay: '',
      mute: false,
      duration: player.duration,
      playing: player.playing,
      loop: false,
      didJustFinish: player.didJustFinish,
      isBuffering: false,
      isLoaded: true,
      playbackRate: 1,
      shouldCorrectPitch: true,
    })),
  };
});

jest.mock('expo-sharing', () => ({
  shareAsync: jest.fn(),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

jest.mock('@react-native-async-storage/async-storage', () =>
  (require('@react-native-async-storage/async-storage/jest/async-storage-mock') as typeof import('@react-native-async-storage/async-storage/jest/async-storage-mock'))
);

jest.mock('@react-native-firebase/auth', () => {
  const authInstance = {
    currentUser: null,
  };
  return {
    getAuth: jest.fn(() => authInstance),
    signInWithEmailAndPassword: jest.fn(),
    createUserWithEmailAndPassword: jest.fn(),
    signOut: jest.fn(),
    onAuthStateChanged: jest.fn(),
    signInWithCredential: jest.fn(),
    getIdToken: jest.fn(),
    updateProfile: jest.fn(),
    sendPasswordResetEmail: jest.fn(),
    GoogleAuthProvider: { credential: jest.fn(() => ({ providerId: 'google' })) },
    AppleAuthProvider: { credential: jest.fn(() => ({ providerId: 'apple' })) },
  };
});

jest.mock('@react-native-firebase/firestore', () => {
  const getFirestore = jest.fn(() => ({}));
  const collection = jest.fn(() => ({}));
  const doc = jest.fn(() => ({}));
  const getDoc = jest.fn();
  const setDoc = jest.fn();
  const onSnapshot = jest.fn();
  const serverTimestamp = jest.fn(() => 'serverTimestamp');
  return { getFirestore, collection, doc, getDoc, setDoc, onSnapshot, serverTimestamp };
});

jest.mock('@react-native-firebase/functions', () => {
  const getFunctions = jest.fn(() => ({}));
  const httpsCallable = jest.fn();
  return { getFunctions, httpsCallable };
});

jest.mock('@react-native-firebase/app-check', () => ({
  initializeAppCheck: jest.fn(() => Promise.resolve({})),
}));

jest.mock('@react-native-firebase/crashlytics', () => {
  const crashlyticsInstance = {
    setCrashlyticsCollectionEnabled: jest.fn().mockResolvedValue(undefined),
    log: jest.fn(),
    recordError: jest.fn(),
    setUserId: jest.fn(),
    setAttribute: jest.fn(),
    setAttributes: jest.fn(),
    crash: jest.fn(),
  };
  return {
    __esModule: true,
    default: jest.fn(() => crashlyticsInstance),
  };
});

jest.mock('react-native-iap', () => ({
  initConnection: jest.fn(),
  endConnection: jest.fn().mockResolvedValue(undefined),
  purchaseUpdatedListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
  purchaseErrorListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
  fetchProducts: jest.fn(),
  requestPurchase: jest.fn(),
  getAvailablePurchases: jest.fn(),
  finishTransaction: jest.fn(),
}));

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA256' },
  digestStringAsync: jest.fn().mockResolvedValue('hash'),
  getRandomBytes: jest.fn((byteCount: number) => Uint8Array.from({ length: byteCount }, (_, index) => index % 256)),
}));

jest.mock('expo-media-library', () => ({
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  saveToLibraryAsync: jest.fn().mockResolvedValue(undefined),
  createAssetAsync: jest.fn().mockResolvedValue({ id: 'mock-asset-id' }),
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' },
}));

jest.mock('react-native-worklets', () => ({
  createWorklet: jest.fn(),
  useWorklet: jest.fn(),
  createSerializable: jest.fn((val: unknown) => val),
}));

(globalThis as unknown as { __reanimatedWorkletInit?: () => void }).__reanimatedWorkletInit =
  (globalThis as unknown as { __reanimatedWorkletInit?: () => void }).__reanimatedWorkletInit ||
  (() => {});

// Mock useWindowDimensions - individual tests can override with mockReturnValue
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(() => ({ width: 375, height: 812 })),
}));
