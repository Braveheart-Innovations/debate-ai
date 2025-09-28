import 'whatwg-fetch';
import mockSafeAreaContext from 'react-native-safe-area-context/jest/mock';

jest.mock('react-native-safe-area-context', () => mockSafeAreaContext);
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('react-native-gesture-handler', () => require('react-native-gesture-handler/jestSetup'));

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
    signInWithEmailAndPassword: jest.fn(),
    createUserWithEmailAndPassword: jest.fn(),
    signOut: jest.fn(),
  };
  return {
    getAuth: jest.fn(() => authInstance),
  };
});

jest.mock('@react-native-firebase/firestore', () => {
  const getFirestore = jest.fn(() => ({}));
  const collection = jest.fn(() => ({}));
  const doc = jest.fn(() => ({}));
  const getDoc = jest.fn();
  const setDoc = jest.fn();
  return { getFirestore, collection, doc, getDoc, setDoc };
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
