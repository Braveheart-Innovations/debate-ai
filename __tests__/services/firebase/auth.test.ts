// Use mocks from jest.setup.ts and override as needed
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  signInWithCredential,
  getIdToken as firebaseGetIdToken,
  updateProfile,
  AppleAuthProvider,
  type User as FirebaseUser,
  type UserCredential,
} from '@react-native-firebase/auth';
import { getFunctions, httpsCallable, type HttpsCallableResult } from '@react-native-firebase/functions';
import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  serverTimestamp,
  type CollectionReference,
  type DocumentData,
  type DocumentReference,
  type DocumentSnapshot,
  type FieldValue,
  type Firestore,
  type FirestoreDataConverter,
  type QueryDocumentSnapshot,
} from '@react-native-firebase/firestore';
import type { SignInSuccessResponse, User as GoogleUser } from '@react-native-google-signin/google-signin';
import type { AppleAuthenticationCredential } from 'expo-apple-authentication';

const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

// The jest.setup.ts auth mock hands every getAuth() caller the same instance.
const authInstance = getAuth();

const mockAuthModule = {
  signInWithEmailAndPassword: jest.mocked(signInWithEmailAndPassword),
  createUserWithEmailAndPassword: jest.mocked(createUserWithEmailAndPassword),
  signOut: jest.mocked(firebaseSignOut),
  onAuthStateChanged: jest.mocked(firebaseOnAuthStateChanged),
  signInWithCredential: jest.mocked(signInWithCredential),
  getIdToken: jest.mocked(firebaseGetIdToken),
  updateProfile: jest.mocked(updateProfile),
  AppleAuthProvider,
};

const mockFunctionsModule = {
  getFunctions: jest.mocked(getFunctions),
  httpsCallable: jest.mocked(httpsCallable),
};

/** A callable stub matching firebase's HttpsCallable (call signature + `stream`). */
const createCallable = () =>
  Object.assign(
    jest.fn<Promise<HttpsCallableResult<unknown>>, [unknown?]>(),
    { stream: jest.fn() }
  );

const mockCallables: Record<string, ReturnType<typeof createCallable>> = {
  verifyEmailPasswordSignIn: createCallable(),
  clearLoginAttempts: createCallable(),
  requestPasswordResetEmail: createCallable(),
};

const mockFirestoreModule = {
  doc: jest.mocked(doc),
  getDoc: jest.mocked(getDoc),
  setDoc: jest.mocked(setDoc),
  onSnapshot: jest.mocked(onSnapshot),
  serverTimestamp: jest.mocked(serverTimestamp),
};

const notUsedByTheseTests = (member: string): never => {
  throw new Error(`${member} is not exercised by the auth tests`);
};

/** Minimal Firestore document reference: only `id`/`path` are observed by these tests. */
class FakeDocumentReference implements DocumentReference {
  readonly type = 'document';
  converter: FirestoreDataConverter<DocumentData, DocumentData> | null = null;
  path: string;

  constructor(public id: string) {
    this.path = `users/${id}`;
  }

  get firestore(): Firestore {
    return notUsedByTheseTests('DocumentReference.firestore');
  }

  get parent(): CollectionReference {
    return notUsedByTheseTests('DocumentReference.parent');
  }

  withConverter(converter: null): DocumentReference;
  withConverter<NewAppModelType, NewDbModelType extends DocumentData = DocumentData>(
    converter: FirestoreDataConverter<NewAppModelType, NewDbModelType>
  ): DocumentReference<NewAppModelType, NewDbModelType>;
  withConverter(): never {
    return notUsedByTheseTests('DocumentReference.withConverter');
  }
}

/** Firestore snapshot whose existence mirrors whether `payload` was provided. */
class FakeDocumentSnapshot implements DocumentSnapshot {
  readonly metadata = { fromCache: false, hasPendingWrites: false, isEqual: () => true };

  constructor(private readonly payload: DocumentData | undefined) {}

  exists(): this is QueryDocumentSnapshot {
    return this.payload !== undefined;
  }

  data(): DocumentData | undefined {
    return this.payload;
  }

  get(fieldPath: string): unknown {
    return this.payload?.[fieldPath];
  }

  get id(): string {
    return 'user';
  }

  get ref(): DocumentReference {
    return notUsedByTheseTests('DocumentSnapshot.ref');
  }
}

/** Complete Firebase Auth user; override only the identity fields a test cares about. */
const createFirebaseUser = (overrides: Partial<FirebaseUser> = {}): FirebaseUser => ({
  uid: 'user',
  displayName: null,
  email: null,
  phoneNumber: null,
  photoURL: null,
  providerId: 'firebase',
  emailVerified: false,
  isAnonymous: false,
  metadata: {},
  providerData: [],
  refreshToken: 'refresh-token',
  tenantId: null,
  delete: async () => undefined,
  getIdToken: async () => 'token',
  getIdTokenResult: async () => ({
    authTime: '',
    expirationTime: '',
    issuedAtTime: '',
    signInProvider: null,
    signInSecondFactor: null,
    token: 'token',
    claims: {},
  }),
  reload: async () => undefined,
  toJSON: () => ({}),
  ...overrides,
});

const createUserCredential = (user: FirebaseUser): UserCredential => ({
  user,
  providerId: null,
  operationType: 'signIn',
});

// Setup doc to return references that carry their id for assertions
mockFirestoreModule.doc.mockImplementation(
  (_parent, id) => new FakeDocumentReference(id)
);

jest.mock('expo-apple-authentication', () => ({
  isAvailableAsync: jest.fn(async () => true),
  signInAsync: jest.fn(),
  AppleAuthenticationScope: {
    EMAIL: 'email',
    FULL_NAME: 'full_name',
  },
  AppleAuthenticationUserDetectionStatus: {
    UNSUPPORTED: 0,
    UNKNOWN: 1,
    LIKELY_REAL: 2,
  },
}));

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(async () => true),
    signIn: jest.fn(async () => ({})),
    getTokens: jest.fn(async () => ({ idToken: 'token' })),
    getCurrentUser: jest.fn(() => ({ user: { email: 'user@example.com', name: 'User Name', photo: 'photo.png' } })),
  },
}));

jest.mock('expo-device', () => ({ isDevice: true }));

jest.mock('react-native', () => {
  const actual = jest.requireActual<typeof import('react-native')>('react-native');
  actual.Platform.OS = 'ios';
  return actual;
});

const originalEnv = { ...process.env };

// Import mocked modules
import * as AppleAuthentication from 'expo-apple-authentication';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

const mockAppleAuthModule = jest.mocked(AppleAuthentication);
const mockGoogleSignin = jest.mocked(GoogleSignin);

const googleUser: GoogleUser = {
  user: {
    id: 'google-user',
    name: 'User Name',
    email: 'user@example.com',
    photo: 'photo.png',
    familyName: 'Name',
    givenName: 'User',
  },
  scopes: [],
  idToken: 'token',
  serverAuthCode: null,
};

const googleSignInSuccess: SignInSuccessResponse = { type: 'success', data: googleUser };

/** Apple's credential echoing the requested `state`, as the real native flow does. */
const createAppleCredential = (state: string | null): AppleAuthenticationCredential => ({
  user: 'apple-user',
  state,
  fullName: {
    namePrefix: null,
    givenName: 'Apple',
    middleName: null,
    familyName: 'User',
    nameSuffix: null,
    nickname: null,
  },
  email: 'apple@example.com',
  realUserStatus: AppleAuthentication.AppleAuthenticationUserDetectionStatus.LIKELY_REAL,
  identityToken: 'token',
  authorizationCode: null,
});

import {
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
  sendPasswordResetEmail,
  updateCurrentUserDisplayName,
} from '@/services/firebase/auth';

import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';

const mockCryptoModule = jest.mocked(Crypto);

const setCurrentUser = (user: FirebaseUser | null) => {
  jest.replaceProperty(authInstance, 'currentUser', user);
};

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
  setCurrentUser(null);
  mockGoogleSignin.configure.mockImplementation(() => {});
  mockGoogleSignin.hasPlayServices.mockImplementation(async () => true);
  mockGoogleSignin.signIn.mockImplementation(async () => googleSignInSuccess);
  mockGoogleSignin.getTokens.mockImplementation(async () => ({ idToken: 'token', accessToken: 'access-token' }));
  mockGoogleSignin.getCurrentUser.mockImplementation(() => googleUser);
  mockAppleAuthModule.isAvailableAsync.mockImplementation(async () => true);
  mockCryptoModule.getRandomBytes.mockImplementation((byteCount: number) => (
    Uint8Array.from({ length: byteCount }, (_, index) => index % 256)
  ));
  mockCryptoModule.digestStringAsync.mockResolvedValue('hashed-nonce');
  mockAppleAuthModule.signInAsync.mockReset();
  mockAppleAuthModule.signInAsync.mockImplementation(async (options) => createAppleCredential(options?.state ?? null));
  mockFirestoreModule.onSnapshot.mockImplementation(() => jest.fn());
  mockFunctionsModule.httpsCallable.mockImplementation((_functions, name) => {
    const callable = mockCallables[String(name)];
    if (!callable) {
      throw new Error(`Unexpected callable: ${String(name)}`);
    }
    return callable;
  });
  mockCallables.verifyEmailPasswordSignIn.mockResolvedValue({ data: { credentialAllowed: true } });
  mockCallables.clearLoginAttempts.mockResolvedValue({ data: { success: true } });
  mockCallables.requestPasswordResetEmail.mockResolvedValue({ data: { emailSent: true } });
};

const setUser = (uid: string | null) => {
  setCurrentUser(uid ? createFirebaseUser({ uid }) : null);
};

const setDocData = (data?: DocumentData) => {
  mockFirestoreModule.getDoc.mockResolvedValue(new FakeDocumentSnapshot(data));
};

describe('firebase auth service', () => {
  beforeEach(resetMocks);

  afterAll(() => {
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('handles email sign-in success and specific errors', async () => {
    const user = createFirebaseUser({ uid: 'user' });
    mockAuthModule.signInWithEmailAndPassword.mockResolvedValue(createUserCredential(user));
    await expect(signInWithEmail('user@example.com', 'pw')).resolves.toBe(user);
    expect(mockCallables.verifyEmailPasswordSignIn).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: 'pw',
    });
    expect(mockCallables.clearLoginAttempts).toHaveBeenCalledWith({ email: 'user@example.com' });

    mockAuthModule.signInWithEmailAndPassword.mockRejectedValue({ code: 'auth/user-not-found' });
    await expect(signInWithEmail('missing@example.com', 'pw')).rejects.toThrow('No account found');

    mockAuthModule.signInWithEmailAndPassword.mockRejectedValue({ code: 'auth/wrong-password' });
    await expect(signInWithEmail('user@example.com', 'bad')).rejects.toThrow('Invalid email or password');
  });

  it('blocks direct email sign-in when the auth callable rejects credentials', async () => {
    mockCallables.verifyEmailPasswordSignIn.mockResolvedValueOnce({
      data: {
        credentialAllowed: false,
        errorMessage: 'Too many attempts. Please try again later.',
      },
    });

    await expect(signInWithEmail('user@example.com', 'bad')).rejects.toThrow('Too many attempts');
    expect(mockAuthModule.signInWithEmailAndPassword).not.toHaveBeenCalled();
  });

  it('creates user on signup and writes Firestore doc', async () => {
    const user = createFirebaseUser({ uid: 'new', email: 'new@example.com' });
    mockAuthModule.createUserWithEmailAndPassword.mockResolvedValue(createUserCredential(user));
    mockFirestoreModule.setDoc.mockResolvedValue(undefined);
    await expect(signUpWithEmail('new@example.com', 'secretpw')).resolves.toBe(user);
    expect(mockFirestoreModule.setDoc).toHaveBeenCalled();
    const [, userDoc] = mockFirestoreModule.setDoc.mock.calls[0];
    expect(userDoc).toEqual(expect.objectContaining({
      email: 'new@example.com',
      preferences: {},
      membershipStatus: 'demo',
      isPremium: false,
      hasUsedTrial: false,
      subscriptionSource: null,
      subscriptionExpiryDate: null,
      trialEndDate: null,
      autoRenewing: false,
      androidPurchaseToken: null,
      appAccountToken: null,
    }));

    mockAuthModule.createUserWithEmailAndPassword.mockRejectedValue({ code: 'auth/email-already-in-use' });
    await expect(signUpWithEmail('new@example.com', 'secretpw')).rejects.toThrow('Email is already in use');
  });

  it('signs out and forwards errors', async () => {
    mockAuthModule.signOut.mockResolvedValue(undefined);
    await expect(signOut()).resolves.toBeUndefined();
    mockAuthModule.signOut.mockRejectedValue(new Error('fail'));
    await expect(signOut()).rejects.toThrow('fail');
  });

  it('returns current user and ID tokens', async () => {
    const currentUser = createFirebaseUser({ uid: 'user' });
    setCurrentUser(currentUser);
    expect(getCurrentUser()).toBe(currentUser);

    mockAuthModule.getIdToken.mockResolvedValue('token');
    await expect(getIdToken()).resolves.toBe('token');

    setUser(null);
    await expect(getIdToken()).resolves.toBeNull();

    setUser('user');
    mockAuthModule.getIdToken.mockRejectedValue(new Error('boom'));
    await expect(getIdToken()).resolves.toBeNull();
  });

  it('updates the current user display name in Firebase Auth and Firestore', async () => {
    const user = createFirebaseUser({
      uid: 'profile-user',
      email: 'profile@example.com',
      displayName: 'Old Name',
      photoURL: null,
      emailVerified: false,
      providerData: [{
        uid: 'profile-user',
        displayName: 'Old Name',
        email: 'profile@example.com',
        phoneNumber: null,
        photoURL: null,
        providerId: 'password',
      }],
      providerId: 'firebase',
    });
    setCurrentUser(user);
    mockAuthModule.updateProfile.mockImplementation(async (target, updates) => {
      Object.assign(target, updates);
    });
    const serverTime: FieldValue = { _type: 'timestamp', _elements: undefined, isEqual: () => false };
    mockFirestoreModule.serverTimestamp.mockReturnValue(serverTime);
    mockFirestoreModule.setDoc.mockResolvedValue(undefined);

    await expect(updateCurrentUserDisplayName('  Store Tester  ')).resolves.toEqual(
      expect.objectContaining({
        uid: 'profile-user',
        email: 'profile@example.com',
        displayName: 'Store Tester',
        providerId: 'password',
      })
    );

    expect(mockAuthModule.updateProfile).toHaveBeenCalledWith(user, {
      displayName: 'Store Tester',
    });
    expect(mockFirestoreModule.setDoc).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'profile-user' }),
      {
        displayName: 'Store Tester',
        updatedAt: serverTime,
      },
      { merge: true }
    );
  });

  it('proxies auth state change listener', () => {
    const unsub = jest.fn();
    mockAuthModule.onAuthStateChanged.mockReturnValue(unsub);
    const callback = jest.fn();
    const result = onAuthStateChanged(callback);
    expect(mockAuthModule.onAuthStateChanged).toHaveBeenCalledWith(authInstance, callback);
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

  it('configures Google Sign-In with checked-in client ID fallbacks when OTA env vars are missing', () => {
    delete process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
    delete process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

    configureGoogleSignIn();
    expect(mockGoogleSignin.configure).toHaveBeenCalledWith({
      webClientId: '248794683640-45l77l2un600prqlqnqslv54fqhnpclq.apps.googleusercontent.com',
      offlineAccess: true,
      iosClientId: '248794683640-7su8cmoma5rvtg1hbmtsohmbec4qrc4p.apps.googleusercontent.com',
    });

    Platform.OS = 'android';
    configureGoogleSignIn();
    expect(mockGoogleSignin.configure).toHaveBeenLastCalledWith({
      webClientId: '248794683640-45l77l2un600prqlqnqslv54fqhnpclq.apps.googleusercontent.com',
      offlineAccess: true,
    });
    Platform.OS = 'ios';
  });

  it('signs in with Apple successfully on iOS', async () => {
    Platform.OS = 'ios';
    setUser(null);
    setDocData({ displayName: 'Existing', createdAt: { toDate: () => new Date() }, membershipStatus: 'free' });
    mockAppleAuthModule.signInAsync.mockImplementation(async (options) => createAppleCredential(options?.state ?? null));
    mockAuthModule.signInWithCredential.mockResolvedValue(
      createUserCredential(createFirebaseUser({ uid: 'appleUser', displayName: null }))
    );

    const result = await signInWithApple();
    expect(mockAppleAuthModule.signInAsync).toHaveBeenCalledWith(expect.objectContaining({
      nonce: 'hashed-nonce',
      state: expect.any(String),
    }));
    expect(mockAuthModule.AppleAuthProvider.credential).toHaveBeenCalledWith(
      'token',
      '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f'
    );
    expect(mockAuthModule.signInWithCredential).toHaveBeenCalled();
    expect(result.user.uid).toBe('appleUser');
    // The implementation uses existing Firestore doc displayName if available
    expect(result.profile.displayName).toBe('Existing');
  });

  it('throws when Apple Sign-In unavailable or cancelled', async () => {
    Platform.OS = 'ios';
    mockAppleAuthModule.isAvailableAsync.mockResolvedValue(false);
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
    mockAuthModule.signInWithCredential.mockResolvedValue(
      createUserCredential(createFirebaseUser({ uid: 'googleUser', email: null, displayName: null, photoURL: null }))
    );
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
    await expect(signInWithGoogle()).rejects.toThrow('google sign-in failed');
    mockGoogleSignin.configure.mockImplementation(() => {});
  });

  describe('sendPasswordResetEmail', () => {
    it('sends password reset email through the rate-limited callable', async () => {
      await expect(sendPasswordResetEmail('user@example.com')).resolves.toBeUndefined();
      expect(mockCallables.requestPasswordResetEmail).toHaveBeenCalledWith({ email: 'user@example.com' });
    });

    it('surfaces password reset rate-limit failures', async () => {
      mockCallables.requestPasswordResetEmail.mockResolvedValueOnce({
        data: {
          emailSent: false,
          message: 'Too many reset requests. Please try again later.',
        },
      });

      await expect(sendPasswordResetEmail('user@example.com')).rejects.toThrow('Too many reset requests');
    });
  });
});
