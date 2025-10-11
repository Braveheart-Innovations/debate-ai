import React from 'react';
import { Text, Linking } from 'react-native';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '../../test-utils/renderWithProviders';

const mockHeader = jest.fn(({ title, onBack }: { title: string; onBack: () => void }) => (
  <Text testID="header" onPress={onBack}>
    {title}
  </Text>
));
const mockHeaderActions = jest.fn(() => null);

jest.mock('@/components/organisms', () => ({
  Header: (props: any) => mockHeader(props),
  HeaderActions: () => mockHeaderActions(),
}));

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
    Button: ({ title, onPress }: { title: string; onPress: () => void }) =>
      React.createElement(
        Text,
        { onPress, accessibilityRole: 'button' },
        title
      ),
  };
});

const TermsOfServiceScreen = require('@/screens/TermsOfServiceScreen').default;

describe('TermsOfServiceScreen', () => {
  let navigation: { goBack: jest.Mock };
  let canOpenSpy: jest.SpyInstance;
  let openUrlSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    navigation = { goBack: jest.fn() };
    canOpenSpy = jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
    openUrlSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue();
  });

  afterEach(() => {
    canOpenSpy.mockRestore();
    openUrlSpy.mockRestore();
  });

  it('opens terms link online and supports manual retry', async () => {
    const { getByText, getByTestId } = renderWithProviders(
      <TermsOfServiceScreen navigation={navigation} />
    );

    await waitFor(() =>
      expect(openUrlSpy).toHaveBeenCalledWith('https://www.symposiumai.app/terms')
    );
    expect(canOpenSpy).toHaveBeenCalledWith('https://www.symposiumai.app/terms');
    expect(getByText('View the Latest Terms')).toBeTruthy();

    fireEvent.press(getByText('Open Terms of Service'));
    await waitFor(() => expect(openUrlSpy).toHaveBeenCalledTimes(2));

    fireEvent.press(getByTestId('header'));
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
    expect(mockHeader).toHaveBeenCalledWith(expect.objectContaining({ title: 'Terms of Service' }));
  });
});
