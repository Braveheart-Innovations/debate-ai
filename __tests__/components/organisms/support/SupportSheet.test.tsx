import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SupportSheet } from '@/components/organisms/support/SupportSheet';
import type { PropsOf } from '@test-utils/mockComponents';
import type { Ionicons } from '@expo/vector-icons';
import type { SheetHeader } from '@/components/molecules';

const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

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
  const actual = jest.requireActual<typeof import('@/theme')>('@/theme');
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

jest.mock('react-native/Libraries/EventEmitter/NativeEventEmitter', () => {
  return jest.fn().mockImplementation(() => ({
    addListener: jest.fn(),
    removeAllListeners: jest.fn(),
    removeListener: jest.fn(),
  }));
});

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Ionicons: ({ name, onPress }: PropsOf<typeof Ionicons>) =>
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

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    SheetHeader: ({ title }: PropsOf<typeof SheetHeader>) => React.createElement(Text, null, title),
    Typography: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
  };
});

describe('SupportSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    consoleWarnSpy.mockRestore();
  });

  it('opens support email when Contact Support tapped', async () => {
    const onClose = jest.fn();
    const { getByText } = render(<SupportSheet onClose={onClose} />);

    fireEvent.press(getByText('Contact Support'));

    const { Linking } = require('react-native');
    await waitFor(() => expect(Linking.openURL).toHaveBeenCalled());
  });

  it('opens FAQ link in browser', async () => {
    const { getByText } = render(<SupportSheet onClose={jest.fn()} />);

    fireEvent.press(getByText('FAQs'));

    const { Linking } = require('react-native');
    await waitFor(() =>
      expect(Linking.openURL).toHaveBeenCalledWith('https://www.symposiumai.app/faq')
    );
  });

  it('opens legal links in browser', async () => {
    const { getByText } = render(<SupportSheet onClose={jest.fn()} />);

    fireEvent.press(getByText('Privacy Policy'));
    fireEvent.press(getByText('Terms of Service'));

    const { Linking } = require('react-native');
    await waitFor(() =>
      expect(Linking.openURL).toHaveBeenCalledWith('https://www.symposiumai.app/privacy')
    );
    await waitFor(() =>
      expect(Linking.openURL).toHaveBeenCalledWith('https://www.symposiumai.app/terms')
    );
  });
});
