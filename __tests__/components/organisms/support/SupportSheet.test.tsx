import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SupportSheet } from '@/components/organisms/support/SupportSheet';

const mockTheme = {
  spacing: { xs: 4, sm: 8, md: 12, lg: 16 },
  colors: {
    background: '#ffffff',
    surface: '#f5f5f5',
    border: '#e0e0e0',
    card: '#fafafa',
    text: { primary: '#111111', secondary: '#666666' },
    primary: { 100: '#ddeeff', 300: '#99bbff', 500: '#3366ff' },
  },
  borderRadius: { sm: 6, md: 10, xl: 24 },
};

jest.mock('@/theme', () => {
  const actual = jest.requireActual('@/theme');
  const React = require('react');
  return {
    ...actual,
    ThemeProvider: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
    useTheme: () => ({ theme: mockTheme }),
  };
});

jest.mock('expo-device', () => ({
  brand: 'Apple',
  modelName: 'iPhone',
  osName: 'iOS',
  osVersion: '17.0',
}));

jest.mock('react-native/Libraries/TurboModule/TurboModuleRegistry', () => ({
  getEnforcing: () => ({
    getConstants: () => ({
      isRTL: false,
      doLeftAndRightSwapInRTL: false,
      allowRTL: () => {},
      forceRTL: () => {},
    }),
  }),
  get: () => ({
    getConstants: () => ({
      isRTL: false,
      doLeftAndRightSwapInRTL: false,
      allowRTL: () => {},
      forceRTL: () => {},
    }),
  }),
}));

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Ionicons: ({ name, onPress }: any) =>
      React.createElement(
        Text,
        {
          onPress,
          testID: `icon-${name}`,
        },
        name
      ),
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('react-native', () => {
  const React = require('react');
  const RN = jest.requireActual('react-native');
  const { View } = RN;
  const linking = {
    ...RN.Linking,
    canOpenURL: jest.fn().mockResolvedValue(true),
    openURL: jest.fn().mockResolvedValue(true),
  };
  return {
    ...RN,
    Image: ({ children, ...props }: any) => React.createElement(View, props, children),
    Linking: linking,
  };
});

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    SheetHeader: ({ title }: any) => React.createElement(Text, null, title),
    Typography: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
  };
});

describe('SupportSheet', () => {
  it('opens support email when Contact Support tapped', async () => {
    const onClose = jest.fn();
    const { getByText } = render(<SupportSheet onClose={onClose} />);

    fireEvent.press(getByText('Contact Support'));

    const { Linking } = require('react-native');
    await waitFor(() => expect(Linking.openURL).toHaveBeenCalled());
  });

  it('navigates between root and FAQ views', () => {
    const { getByText } = render(<SupportSheet onClose={jest.fn()} />);

    fireEvent.press(getByText('FAQs'));
    expect(getByText('Expert Mode — Frequently Asked Questions')).toBeTruthy();

    fireEvent.press(getByText('chevron-back'));
    expect(getByText('Get Help')).toBeTruthy();
  });
});
