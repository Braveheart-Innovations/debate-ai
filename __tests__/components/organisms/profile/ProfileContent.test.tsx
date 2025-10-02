import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { ProfileContent } from '@/components/organisms/profile/ProfileContent';
import type { RootState } from '@/store';

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: any) => <>{children}</>,
}));

const mockUseFeatureAccess = jest.fn(() => ({
  isPremium: false,
  isInTrial: false,
  trialDaysRemaining: 0,
  isDemo: true,
  refresh: jest.fn(),
}));

jest.mock('@/hooks/useFeatureAccess', () => ({
  useFeatureAccess: () => mockUseFeatureAccess(),
}));

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text, TouchableOpacity } = require('react-native');
  return {
    ProfileAvatar: () => null,
    Typography: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
    Button: ({ title, onPress }: { title: string; onPress: () => void }) =>
      React.createElement(
        TouchableOpacity,
        { onPress },
        React.createElement(Text, null, title)
      ),
    SettingRow: ({ title }: { title: string }) => React.createElement(Text, null, title),
    SheetHeader: () => null,
  };
});

jest.mock('@/components/molecules/auth/EmailAuthForm', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    EmailAuthForm: () => React.createElement(Text, { testID: 'email-auth-form' }, 'Email Form'),
  };
});

jest.mock('@/components/organisms/auth/SocialAuthProviders', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    SocialAuthProviders: () => React.createElement(Text, null, 'Social Providers'),
  };
});

jest.mock('@/components/organisms/subscription/UnlockEverythingBanner', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    UnlockEverythingBanner: () => React.createElement(Text, null, 'Unlock Banner'),
  };
});

jest.mock('@/components/molecules/subscription/TrialBanner', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    TrialBanner: () => React.createElement(Text, null, 'Trial Banner'),
  };
});

jest.mock('@/services/firebase/auth', () => ({
  signOut: jest.fn(),
  signInWithEmail: jest.fn(),
  signUpWithEmail: jest.fn(),
  signInAnonymously: jest.fn().mockResolvedValue({ uid: 'anon', email: null, displayName: 'Guest', isAnonymous: true }),
  toAuthUser: jest.fn(() => ({ uid: 'anon', email: null, isAnonymous: true })),
}));

jest.mock('@react-native-firebase/firestore', () => ({
  getFirestore: jest.fn(),
  doc: jest.fn(),
  setDoc: jest.fn(),
  getDoc: jest.fn(() => ({ data: () => null })),
  serverTimestamp: jest.fn(() => Date.now()),
}));

jest.mock('@/services/iap/PurchaseService', () => ({
  default: { purchaseSubscription: jest.fn().mockResolvedValue({ success: true }) },
}));

const baseAuthState = {
  user: null,
  isAuthenticated: false,
  isPremium: false,
  authLoading: false,
  authModalVisible: false,
  userProfile: null,
  isAnonymous: false,
  lastAuthMethod: null,
  socialAuthLoading: false,
  socialAuthError: null,
};

describe('ProfileContent', () => {
  it('renders signed-out view and opens email auth form', async () => {
    const preloadedState = {
      auth: { ...baseAuthState },
    } as Partial<RootState>;

    const { getByText, queryByTestId } = renderWithProviders(
      <ProfileContent onClose={jest.fn()} />,
      { preloadedState: preloadedState as RootState }
    );

    expect(getByText('Sign in with Email')).toBeTruthy();
    fireEvent.press(getByText('Sign in with Email'));

    await waitFor(() => expect(queryByTestId('email-auth-form')).toBeTruthy());
  });

  it('shows anonymous guest view when user is anonymous', () => {
    const preloadedState = {
      auth: { ...baseAuthState, isAnonymous: true },
    } as Partial<RootState>;

    const { getByText } = renderWithProviders(
      <ProfileContent onClose={jest.fn()} />,
      { preloadedState: preloadedState as RootState }
    );

    expect(getByText('Guest User')).toBeTruthy();
    expect(getByText('Create Your Account')).toBeTruthy();
  });
});
