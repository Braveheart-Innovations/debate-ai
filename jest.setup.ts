import 'whatwg-fetch';
import mockSafeAreaContext from 'react-native-safe-area-context/jest/mock';

jest.mock('react-native-safe-area-context', () => mockSafeAreaContext);
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('react-native-gesture-handler', () => require('react-native-gesture-handler/jestSetup'));
jest.mock('react-native/Libraries/Modal/Modal', () => {
  const React = require('react');

  const ModalMock = ({ children, visible = true, ...rest }: any = {}) => {
    if (!visible) return null;
    return React.createElement('Modal', { hardwareAccelerated: false, ...rest, visible }, children);
  };

  ModalMock.displayName = 'Modal';
  (ModalMock as unknown as { __esModule?: boolean }).__esModule = true;
  (ModalMock as unknown as { default?: unknown }).default = ModalMock;
  return ModalMock;
});

const modalModule = require('react-native/Libraries/Modal/Modal');
if (!modalModule) {
  // eslint-disable-next-line no-console
  console.warn('Modal mock missing module', modalModule);
} else if (!(modalModule as { default?: unknown }).default) {
  // eslint-disable-next-line no-console
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

jest.mock('expo-file-system', () => ({
  writeAsStringAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  documentDirectory: '/tmp',
}));

jest.mock('expo-sharing', () => ({
  shareAsync: jest.fn(),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
}));

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('@react-native-firebase/auth', () => {
  const authInstance = {
    currentUser: null,
  };
  return {
    getAuth: jest.fn(() => authInstance),
    signInAnonymously: jest.fn(),
    signInWithEmailAndPassword: jest.fn(),
    createUserWithEmailAndPassword: jest.fn(),
    signOut: jest.fn(),
    onAuthStateChanged: jest.fn(),
    signInWithCredential: jest.fn(),
    linkWithCredential: jest.fn(),
    getIdToken: jest.fn(),
    updateProfile: jest.fn(),
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

jest.mock('react-native-iap', () => ({
  initConnection: jest.fn(),
  endConnection: jest.fn().mockResolvedValue(undefined),
  purchaseUpdatedListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
  purchaseErrorListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
  getSubscriptions: jest.fn(),
  requestSubscription: jest.fn(),
  getAvailablePurchases: jest.fn(),
  finishTransaction: jest.fn(),
}));

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA256' },
  digestStringAsync: jest.fn().mockResolvedValue('hash'),
}));

(globalThis as unknown as { __reanimatedWorkletInit?: () => void }).__reanimatedWorkletInit =
  (globalThis as unknown as { __reanimatedWorkletInit?: () => void }).__reanimatedWorkletInit ||
  (() => {});
