import React from 'react';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { SocialAuthProviders } from '@/components/organisms/auth/SocialAuthProviders';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { signInWithApple, signInWithGoogle, toAuthUser } from '@/services/firebase/auth';

// Mock ErrorService
const mockHandleError = jest.fn();
jest.mock('@/services/errors/ErrorService', () => ({
  ErrorService: {
    handleError: (...args: unknown[]) => mockHandleError(...args),
    showSuccess: jest.fn(),
    showWarning: jest.fn(),
    showInfo: jest.fn(),
  },
}));

jest.mock('@/components/molecules', () => {
  const React = require('react') as typeof import('react');
  const { Text } = require('react-native') as typeof import('react-native');
  return {
    Typography: ({ children, ...props }: { children: React.ReactNode }) => React.createElement(Text, props, children),
  };
});

jest.mock('expo-apple-authentication', () => {
  const React = require('react') as typeof import('react');
  const { TouchableOpacity, Text } = require('react-native') as typeof import('react-native');
  const AppleButton = ({ onPress, testID }: { onPress: () => void; testID?: string }) => (
    React.createElement(
      TouchableOpacity,
      { onPress, testID: testID ?? 'apple-signin-button' },
      React.createElement(Text, null, 'Sign in with Apple')
    )
  );
  return {
    isAvailableAsync: jest.fn(),
    AppleAuthenticationButton: AppleButton,
    AppleAuthenticationButtonType: { SIGN_IN: 'signIn' },
    AppleAuthenticationButtonStyle: { BLACK: 'black' },
  };
});

jest.mock('@react-native-google-signin/google-signin', () => {
  const React = require('react') as typeof import('react');
  const { TouchableOpacity, Text } = require('react-native') as typeof import('react-native');
  const GoogleButton = ({ onPress, disabled, testID }: { onPress: () => void; disabled?: boolean; testID?: string }) => (
    React.createElement(
      TouchableOpacity,
      { onPress: disabled ? undefined : onPress, disabled, testID: testID ?? 'google-signin-button' },
      React.createElement(Text, null, 'Sign in with Google')
    )
  );
  GoogleButton.Size = { Wide: 'wide' };
  GoogleButton.Color = { Dark: 'dark' };
  return { GoogleSigninButton: GoogleButton };
});

jest.mock('@/services/firebase/auth', () => ({
  signInWithApple: jest.fn(),
  signInWithGoogle: jest.fn(),
  toAuthUser: jest.fn(),
}));

const originalPlatform = Platform.OS;
const originalDev = __DEV__;

const mockIsAppleAuthAvailable = jest.mocked(AppleAuthentication.isAvailableAsync);
const mockSignInWithApple = jest.mocked(signInWithApple);
const mockSignInWithGoogle = jest.mocked(signInWithGoogle);
const mockToAuthUser = jest.mocked(toAuthUser);

/** `__DEV__` is a declared global constant; tests flip the runtime value. */
const setDev = (value: boolean) => {
  Reflect.set(globalThis, '__DEV__', value);
};

type SocialSignInResult = Awaited<ReturnType<typeof signInWithApple>>;
type FirebaseUser = SocialSignInResult['user'];
type SignInProfile = SocialSignInResult['profile'];

/** Raw Firebase user handed to (mocked) toAuthUser; only uid matters to these tests. */
const createFirebaseUser = (overrides: Partial<FirebaseUser> = {}): FirebaseUser => ({
  uid: 'firebase-user',
  displayName: null,
  email: null,
  phoneNumber: null,
  photoURL: null,
  providerId: 'firebase',
  emailVerified: false,
  isAnonymous: false,
  metadata: {},
  providerData: [],
  refreshToken: '',
  tenantId: null,
  delete: jest.fn(),
  getIdToken: jest.fn(),
  getIdTokenResult: jest.fn(),
  reload: jest.fn(),
  toJSON: jest.fn(),
  ...overrides,
});

const createSignInProfile = (overrides: Partial<SignInProfile> = {}): SignInProfile => ({
  uid: 'firebase-user',
  email: null,
  displayName: null,
  photoURL: null,
  createdAt: null,
  membershipStatus: 'free',
  isPremium: false,
  authProvider: 'firebase',
  preferences: {},
  ...overrides,
});

const createAuthUser = (uid: string): ReturnType<typeof toAuthUser> => ({
  uid,
  email: null,
  displayName: null,
  photoURL: null,
  emailVerified: false,
});

describe('SocialAuthProviders', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHandleError.mockClear();
    Object.defineProperty(Platform, 'OS', { value: originalPlatform });
    mockIsAppleAuthAvailable.mockReset();
    mockSignInWithApple.mockReset();
    mockSignInWithGoogle.mockReset();
    mockToAuthUser.mockReset();
    setDev(originalDev);
  });

  afterAll(() => {
    Object.defineProperty(Platform, 'OS', { value: originalPlatform });
    setDev(originalDev);
  });

  it('renders Apple sign-in on iOS when available and handles success', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'ios' });
    mockIsAppleAuthAvailable.mockResolvedValue(true);
    mockSignInWithApple.mockResolvedValue({
      user: createFirebaseUser({ uid: 'apple-user-raw', isAnonymous: false }),
      profile: createSignInProfile({
        email: 'apple@example.com',
        displayName: 'Apple User',
        photoURL: 'photo.png',
        createdAt: 1700000000000,
        membershipStatus: 'premium',
        preferences: { theme: 'dark' },
      }),
    });
    mockToAuthUser.mockReturnValue(createAuthUser('apple-user'));

    const onSuccess = jest.fn();
    const { findByTestId, store } = renderWithProviders(
      <SocialAuthProviders onSuccess={onSuccess} />
    );

    const appleButton = await findByTestId('apple-signin-button');
    fireEvent.press(appleButton);

    await waitFor(() => {
      expect(signInWithApple).toHaveBeenCalledTimes(1);
      expect(store.getState().auth.user?.uid).toBe('apple-user');
    });

    const profile = store.getState().auth.userProfile;
    expect(profile?.authProvider).toBe('apple');
    expect(profile?.membershipStatus).toBe('premium');
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(mockHandleError).not.toHaveBeenCalled();
  });

  it('falls back to Google sign-in and updates state on success', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'android' });
    mockSignInWithGoogle.mockResolvedValue({
      user: createFirebaseUser({ uid: 'google-user-raw', isAnonymous: false }),
      profile: createSignInProfile({
        email: 'google@example.com',
        displayName: 'Google User',
        photoURL: 'gphoto.png',
        membershipStatus: 'free',
        preferences: { locale: 'en' },
      }),
    });
    mockToAuthUser.mockReturnValue(createAuthUser('google-user'));

    const onSuccess = jest.fn();
    const { getByTestId, store } = renderWithProviders(
      <SocialAuthProviders onSuccess={onSuccess} />
    );

    const googleButton = getByTestId('google-signin-button');
    fireEvent.press(googleButton);

    await waitFor(() => {
      expect(signInWithGoogle).toHaveBeenCalledTimes(1);
      expect(store.getState().auth.user?.uid).toBe('google-user');
    });

    const profile = store.getState().auth.userProfile;
    expect(profile?.authProvider).toBe('google');
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('invokes error callback and shows error toast when Google sign-in fails', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'android' });
    const error = new Error('Network issue');
    mockSignInWithGoogle.mockRejectedValue(error);
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const onError = jest.fn();
    const { getByTestId } = renderWithProviders(
      <SocialAuthProviders onError={onError} />
    );

    const googleButton = getByTestId('google-signin-button');
    fireEvent.press(googleButton);

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(error);
    });

    // The auth service already records the real error; the UI only toasts it.
    expect(mockHandleError).toHaveBeenCalledWith(
      error,
      expect.objectContaining({ feature: 'auth', showToast: true, logToCrashlytics: false })
    );
    consoleSpy.mockRestore();
  });

  it('shows simulator notice when Apple auth unavailable in dev', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'ios' });
    setDev(true);
    mockIsAppleAuthAvailable.mockResolvedValue(false);
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const { findByText } = renderWithProviders(<SocialAuthProviders />);

    expect(await findByText(/iOS Simulator Detected/i)).toBeTruthy();
    consoleSpy.mockRestore();
  });
});
