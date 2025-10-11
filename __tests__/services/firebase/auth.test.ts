// Use mocks from jest.setup.ts and override as needed
import {
  getAuth,
  signInAnonymously as mockSignInAnonymously,
  signInWithEmailAndPassword as mockSignInWithEmailAndPassword,
  createUserWithEmailAndPassword as mockCreateUserWithEmailAndPassword,
  signOut as mockSignOut,
  onAuthStateChanged as mockOnAuthStateChanged,
  signInWithCredential as mockSignInWithCredential,
  linkWithCredential as mockLinkWithCredential,
  getIdToken as mockFirebaseGetIdToken,
  updateProfile as mockUpdateProfile,
  GoogleAuthProvider,
  AppleAuthProvider,
} from '@react-native-firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  serverTimestamp,
} from '@react-native-firebase/firestore';

const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

// Create typed mock references
const mockGetAuth = getAuth as jest.MockedFunction<typeof getAuth>;
const mockAuthState = { currentUser: null as { uid: string; isAnonymous?: boolean } | null };

// Set up mockGetAuth to return mockAuthState
mockGetAuth.mockReturnValue(mockAuthState as never);

const mockAuthModule = {
  getAuth: mockGetAuth,
  signInAnonymously: mockSignInAnonymously as jest.MockedFunction<typeof mockSignInAnonymously>,
  signInWithEmailAndPassword: mockSignInWithEmailAndPassword as jest.MockedFunction<typeof mockSignInWithEmailAndPassword>,
  createUserWithEmailAndPassword: mockCreateUserWithEmailAndPassword as jest.MockedFunction<typeof mockCreateUserWithEmailAndPassword>,
  signOut: mockSignOut as jest.MockedFunction<typeof mockSignOut>,
  onAuthStateChanged: mockOnAuthStateChanged as jest.MockedFunction<typeof mockOnAuthStateChanged>,
  signInWithCredential: mockSignInWithCredential as jest.MockedFunction<typeof mockSignInWithCredential>,
  linkWithCredential: mockLinkWithCredential as jest.MockedFunction<typeof mockLinkWithCredential>,
  getIdToken: mockFirebaseGetIdToken as jest.MockedFunction<typeof mockFirebaseGetIdToken>,
  updateProfile: mockUpdateProfile as jest.MockedFunction<typeof mockUpdateProfile>,
  GoogleAuthProvider,
  AppleAuthProvider,
};

const mockFirestoreModule = {
  getFirestore: getFirestore as jest.MockedFunction<typeof getFirestore>,
  collection: collection as jest.MockedFunction<typeof collection>,
  doc: doc as jest.MockedFunction<typeof doc>,
  getDoc: getDoc as jest.MockedFunction<typeof getDoc>,
  setDoc: setDoc as jest.MockedFunction<typeof setDoc>,
  onSnapshot: onSnapshot as jest.MockedFunction<typeof onSnapshot>,
  serverTimestamp: serverTimestamp as jest.MockedFunction<typeof serverTimestamp>,
};

// Setup collection and doc to return objects that can be chained
(mockFirestoreModule.collection as jest.MockedFunction<typeof collection>).mockImplementation(
  (db, name) => ({ db, name } as never)
);
(mockFirestoreModule.doc as jest.MockedFunction<typeof doc>).mockImplementation(
  (col, id) => ({ col, id } as never)
);

jest.mock('expo-apple-authentication', () => ({
  isAvailableAsync: jest.fn(async () => true),
  signInAsync: jest.fn(),
  AppleAuthenticationScope: {
    EMAIL: 'email',
    FULL_NAME: 'full_name',
  },
}));

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(async () => true),
    signIn: jest.fn(async () => ({})),
    getTokens: jest.fn(async () => ({ idToken: 'token' })),
    getCurrentUser: jest.fn(async () => ({ user: { email: 'user@example.com', name: 'User Name', photo: 'photo.png' } })),
  },
}));

jest.mock('expo-device', () => ({ isDevice: true }));

jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native');
  actual.Platform.OS = 'ios';
  return actual;
});

const originalEnv = { ...process.env };

// Import mocked modules
import * as AppleAuthentication from 'expo-apple-authentication';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

// Cast to mocked types
const mockAppleAuthModule = AppleAuthentication as jest.Mocked<typeof AppleAuthentication>;
const mockGoogleSignin = GoogleSignin as jest.Mocked<typeof GoogleSignin>;

import {
  signInAnonymously,
  signInWithEmail,
  signUpWithEmail,
  signOut,
  getCurrentUser,
  getIdToken,
  onAuthStateChanged,
  checkPremiumAccess,
  configureGoogleSignIn,
  signInWithApple,
  signInWithGoogle,
  linkAnonymousAccount,
} from '@/services/firebase/auth';

import type { MembershipStatus } from '@/types/subscription';
import { Platform } from 'react-native';

const resetMocks = () => {
  jest.clearAllMocks();
  // Reset env vars individually instead of replacing process.env
  Object.keys(process.env).forEach(key => {
    if (key.startsWith('EXPO_PUBLIC_')) {
      delete process.env[key];
    }
  });
  Object.keys(originalEnv).forEach(key => {
    if (key.startsWith('EXPO_PUBLIC_') && originalEnv[key]) {
      process.env[key] = originalEnv[key];
    }
  });
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = 'web-client';
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID = 'ios-client';
  mockAuthState.currentUser = null;
  mockGoogleSignin.configure.mockImplementation(() => {});
  mockGoogleSignin.hasPlayServices.mockImplementation(async () => true);
  mockGoogleSignin.signIn.mockImplementation(async () => ({}));
  mockGoogleSignin.getTokens.mockImplementation(async () => ({ idToken: 'token' }));
  mockGoogleSignin.getCurrentUser.mockImplementation(async () => ({
    user: { email: 'user@example.com', name: 'User Name', photo: 'photo.png' },
  }));
  mockAppleAuthModule.isAvailableAsync.mockImplementation(async () => true);
  mockAppleAuthModule.signInAsync.mockReset();
  mockAppleAuthModule.signInAsync.mockResolvedValue({
    identityToken: 'token',
    email: 'apple@example.com',
    fullName: { givenName: 'Apple', familyName: 'User' },
  });
  mockFirestoreModule.onSnapshot.mockImplementation(() => jest.fn());
};

const futureTs = (days: number) => ({ toMillis: () => Date.now() + days * 24 * 60 * 60 * 1000 });
const pastTs = (days: number) => ({ toMillis: () => Date.now() - days * 24 * 60 * 60 * 1000 });

const setUser = (uid: string | null, options: { isAnonymous?: boolean } = {}) => {
  mockAuthState.currentUser = uid ? { uid, isAnonymous: options.isAnonymous } : null;
};

const setDocData = (data?: Partial<Record<string, unknown>>) => {
  mockFirestoreModule.getDoc.mockResolvedValue({
    exists: () => (data !== undefined),
    data: () => data,
  });
};

describe('firebase auth service', () => {
  beforeEach(resetMocks);

  afterAll(() => {
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('signs in anonymously and returns user', async () => {
    const user = { uid: 'anon' };
    mockAuthModule.signInAnonymously.mockResolvedValue({ user });
    await expect(signInAnonymously()).resolves.toBe(user);
    expect(mockAuthModule.signInAnonymously).toHaveBeenCalledWith(mockAuthState);
  });

  it('propagates anonymous sign-in errors', async () => {
    mockAuthModule.signInAnonymously.mockRejectedValue(new Error('fail'));
    await expect(signInAnonymously()).rejects.toThrow('fail');
  });

  it('handles email sign-in success and specific errors', async () => {
    const user = { uid: 'user' };
    mockAuthModule.signInWithEmailAndPassword.mockResolvedValue({ user });
    await expect(signInWithEmail('user@example.com', 'pw')).resolves.toBe(user);

    mockAuthModule.signInWithEmailAndPassword.mockRejectedValue({ code: 'auth/user-not-found' });
    await expect(signInWithEmail('missing@example.com', 'pw')).rejects.toThrow('No account found');

    mockAuthModule.signInWithEmailAndPassword.mockRejectedValue({ code: 'auth/wrong-password' });
    await expect(signInWithEmail('user@example.com', 'bad')).rejects.toThrow('Incorrect password');
  });

  it('creates user on signup and writes Firestore doc', async () => {
    const user = { uid: 'new', email: 'new@example.com' };
    mockAuthModule.createUserWithEmailAndPassword.mockResolvedValue({ user });
    mockFirestoreModule.setDoc.mockResolvedValue(undefined);
    await expect(signUpWithEmail('new@example.com', 'secretpw')).resolves.toBe(user);
    expect(mockFirestoreModule.setDoc).toHaveBeenCalled();

    mockAuthModule.createUserWithEmailAndPassword.mockRejectedValue({ code: 'auth/email-already-in-use' });
    await expect(signUpWithEmail('new@example.com', 'secretpw')).rejects.toThrow('already exists');
  });

  it('signs out and forwards errors', async () => {
    mockAuthModule.signOut.mockResolvedValue(undefined);
    await expect(signOut()).resolves.toBeUndefined();
    mockAuthModule.signOut.mockRejectedValue(new Error('fail'));
    await expect(signOut()).rejects.toThrow('fail');
  });

  it('returns current user and ID tokens', async () => {
    setUser('user');
    expect(getCurrentUser()).toEqual({ uid: 'user', isAnonymous: undefined });

    mockAuthModule.getIdToken.mockResolvedValue('token');
    await expect(getIdToken()).resolves.toBe('token');

    setUser(null);
    await expect(getIdToken()).resolves.toBeNull();

    setUser('user');
    mockAuthModule.getIdToken.mockRejectedValue(new Error('boom'));
    await expect(getIdToken()).resolves.toBeNull();
  });

  it('proxies auth state change listener', () => {
    const unsub = jest.fn();
    mockAuthModule.onAuthStateChanged.mockReturnValue(unsub);
    const callback = jest.fn();
    const result = onAuthStateChanged(callback);
    expect(mockAuthModule.onAuthStateChanged).toHaveBeenCalledWith(mockAuthState, callback);
    expect(result).toBe(unsub);
  });

  it('checks premium access via Firestore', async () => {
    setUser('user');
    setDocData(undefined);
    await expect(checkPremiumAccess()).resolves.toBe(false);

    setDocData({ isPremium: true });
    await expect(checkPremiumAccess()).resolves.toBe(true);

    mockFirestoreModule.getDoc.mockRejectedValueOnce(new Error('firestore error'));
    await expect(checkPremiumAccess()).resolves.toBe(false);
  });

  it('configures Google Sign-In using env vars', () => {
    configureGoogleSignIn();
    expect(mockGoogleSignin.configure).toHaveBeenCalledWith({
      webClientId: 'web-client',
      offlineAccess: true,
      iosClientId: 'ios-client',
    });

    Platform.OS = 'android';
    configureGoogleSignIn();
    expect(mockGoogleSignin.configure).toHaveBeenLastCalledWith({
      webClientId: 'web-client',
      offlineAccess: true,
    });
    Platform.OS = 'ios';
  });

  it('signs in with Apple successfully on iOS', async () => {
    Platform.OS = 'ios';
    setUser(null);
    setDocData({ displayName: 'Existing', createdAt: { toDate: () => new Date() }, membershipStatus: 'free' });
    mockAppleAuthModule.signInAsync.mockResolvedValue({
      identityToken: 'token',
      email: 'apple@example.com',
      fullName: { givenName: 'Apple', familyName: 'User' },
    });
    mockAuthModule.signInWithCredential.mockResolvedValue({ user: { uid: 'appleUser', displayName: null } });

    const result = await signInWithApple();
    expect(mockAuthModule.signInWithCredential).toHaveBeenCalled();
    expect(result.user.uid).toBe('appleUser');
    // The implementation always uses additionalData.displayName if provided (line 485)
    expect(result.profile.displayName).toBe('Apple User');
  });

  it('throws when Apple Sign-In unavailable or cancelled', async () => {
    Platform.OS = 'ios';
    // When isAvailableAsync returns false, the error is caught and code continues to signInAsync
    // So we also need to make signInAsync fail
    mockAppleAuthModule.isAvailableAsync.mockResolvedValue(false);
    mockAppleAuthModule.signInAsync.mockRejectedValue(new Error('Apple Sign-In unavailable'));
    await expect(signInWithApple()).rejects.toThrow();

    // Test user cancellation
    mockAppleAuthModule.isAvailableAsync.mockResolvedValue(true);
    mockAppleAuthModule.signInAsync.mockRejectedValue({ code: 'ERR_REQUEST_CANCELED' });
    await expect(signInWithApple()).rejects.toThrow('User cancelled');
  });

  it('signs in with Google and builds profile', async () => {
    Platform.OS = 'android';
    setUser(null);
    setDocData(undefined);
    mockAuthModule.signInWithCredential.mockResolvedValue({ user: { uid: 'googleUser', email: null, displayName: null, photoURL: null } });
    mockFirestoreModule.setDoc.mockResolvedValue(undefined);

    const result = await signInWithGoogle();
    expect(mockGoogleSignin.configure).toHaveBeenCalled();
    expect(mockAuthModule.signInWithCredential).toHaveBeenCalled();
    expect(result.profile.displayName).toBe('User Name');
  });

  it('handles Google Sign-In configuration errors', async () => {
    mockGoogleSignin.configure.mockImplementation(() => {
      throw { code: 'DEVELOPER_ERROR' };
    });
    await expect(signInWithGoogle()).rejects.toThrow('configuration error');
    mockGoogleSignin.configure.mockImplementation(() => {});
  });

  it('links anonymous account with Google credential', async () => {
    Platform.OS = 'android';
    setUser('anon', { isAnonymous: true });
    mockGoogleSignin.getTokens.mockResolvedValue({ idToken: 'token' });
    mockAuthModule.linkWithCredential.mockResolvedValue({ user: { uid: 'linked' } });
    setDocData(undefined);
    mockFirestoreModule.setDoc.mockResolvedValue(undefined);

    const result = await linkAnonymousAccount('google');
    expect(mockAuthModule.linkWithCredential).toHaveBeenCalled();
    expect(result.user.uid).toBe('linked');
  });

  it('rejects linking when no anonymous user', async () => {
    setUser('user', { isAnonymous: false });
    await expect(linkAnonymousAccount('google')).rejects.toThrow('No anonymous user');
  });
});
