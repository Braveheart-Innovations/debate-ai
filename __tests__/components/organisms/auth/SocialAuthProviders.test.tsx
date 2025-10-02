import React from 'react';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { SocialAuthProviders } from '@/components/organisms/auth/SocialAuthProviders';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { Platform, Alert } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { signInWithApple, signInWithGoogle, toAuthUser } from '@/services/firebase/auth';

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Typography: ({ children, ...props }: { children: React.ReactNode }) => React.createElement(Text, props, children),
  };
});

jest.mock('expo-apple-authentication', () => {
  const React = require('react');
  const { TouchableOpacity, Text } = require('react-native');
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
  const React = require('react');
  const { TouchableOpacity, Text } = require('react-native');
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

jest.spyOn(Alert, 'alert').mockImplementation(() => {});

const originalPlatform = Platform.OS;
const originalDev = __DEV__;

describe('SocialAuthProviders', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(Platform, 'OS', { value: originalPlatform });
    (AppleAuthentication.isAvailableAsync as jest.Mock).mockReset();
    (signInWithApple as jest.Mock).mockReset();
    (signInWithGoogle as jest.Mock).mockReset();
    (toAuthUser as jest.Mock).mockReset();
    (global as any).__DEV__ = originalDev;
  });

  afterAll(() => {
    Object.defineProperty(Platform, 'OS', { value: originalPlatform });
    (global as any).__DEV__ = originalDev;
  });

  it('renders Apple sign-in on iOS when available and handles success', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'ios' });
    (AppleAuthentication.isAvailableAsync as jest.Mock).mockResolvedValue(true);
    (signInWithApple as jest.Mock).mockResolvedValue({
      user: { uid: 'apple-user-raw', isAnonymous: false },
      profile: {
        email: 'apple@example.com',
        displayName: 'Apple User',
        photoURL: 'photo.png',
        createdAt: 1700000000000,
        membershipStatus: 'premium',
        preferences: { theme: 'dark' },
      },
    });
    (toAuthUser as jest.Mock).mockReturnValue({ uid: 'apple-user', isAnonymous: false });

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
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('falls back to Google sign-in and updates state on success', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'android' });
    (signInWithGoogle as jest.Mock).mockResolvedValue({
      user: { uid: 'google-user-raw', isAnonymous: false },
      profile: {
        email: 'google@example.com',
        displayName: 'Google User',
        photoURL: 'gphoto.png',
        membershipStatus: 'free',
        preferences: { locale: 'en' },
      },
    });
    (toAuthUser as jest.Mock).mockReturnValue({ uid: 'google-user', isAnonymous: false });

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

  it('invokes error callback and alert when Google sign-in fails', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'android' });
    const error = new Error('Network issue');
    (signInWithGoogle as jest.Mock).mockRejectedValue(error);

    const onError = jest.fn();
    const { getByTestId } = renderWithProviders(
      <SocialAuthProviders onError={onError} />
    );

    const googleButton = getByTestId('google-signin-button');
    fireEvent.press(googleButton);

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(error);
    });

    expect(Alert.alert).toHaveBeenCalledWith('Sign In', 'Network issue');
  });

  it('shows simulator notice when Apple auth unavailable in dev', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'ios' });
    (global as any).__DEV__ = true;
    (AppleAuthentication.isAvailableAsync as jest.Mock).mockResolvedValue(false);

    const { findByText } = renderWithProviders(<SocialAuthProviders />);

    expect(await findByText(/iOS Simulator Detected/i)).toBeTruthy();
  });
});
