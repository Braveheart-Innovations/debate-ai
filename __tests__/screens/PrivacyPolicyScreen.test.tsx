import React from 'react';
import { Text, Linking } from 'react-native';
import { fireEvent, waitFor } from '@testing-library/react-native';
import PrivacyPolicyScreen from '@/screens/PrivacyPolicyScreen';
import { renderWithProviders } from '../../test-utils/renderWithProviders';
import { capturePropsOf } from '@test-utils/mockComponents';
import type { Header } from '@/components/organisms';

const mockHeader = capturePropsOf<typeof Header>(({ title, onBack }) => (
  <Text testID="header" onPress={onBack}>
    {title}
  </Text>
));

jest.mock('@/components/organisms', () => ({
  get Header() {
    return mockHeader.Stub;
  },
  HeaderActions: () => null,
}));

jest.mock('@/components/molecules', () => {
  const React = require('react') as typeof import('react');
  const { Text } = require('react-native') as typeof import('react-native');
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

describe('PrivacyPolicyScreen', () => {
  let navigation: { goBack: jest.Mock };
  let canOpenSpy: jest.SpiedFunction<typeof Linking.canOpenURL>;
  let openUrlSpy: jest.SpiedFunction<typeof Linking.openURL>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockHeader.reset();
    navigation = { goBack: jest.fn() };
    canOpenSpy = jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
    openUrlSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  });

  afterEach(() => {
    canOpenSpy.mockRestore();
    openUrlSpy.mockRestore();
  });

  it('opens privacy policy online and supports manual retry', async () => {
    const { getByText, getByTestId } = renderWithProviders(
      <PrivacyPolicyScreen navigation={navigation} />
    );

    await waitFor(() =>
      expect(openUrlSpy).toHaveBeenCalledWith('https://www.symposiumai.app/privacy')
    );
    expect(canOpenSpy).toHaveBeenCalledWith('https://www.symposiumai.app/privacy');
    expect(getByText('View the Latest Privacy Policy')).toBeTruthy();

    fireEvent.press(getByText('Open Privacy Policy'));
    await waitFor(() => expect(openUrlSpy).toHaveBeenCalledTimes(2));

    fireEvent.press(getByTestId('header'));
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
    expect(mockHeader.calls).toContainEqual(expect.objectContaining({ title: 'Privacy Policy' }));
  });
});
