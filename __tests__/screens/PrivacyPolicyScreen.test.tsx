import React from 'react';
import { Text } from 'react-native';
import { fireEvent } from '@testing-library/react-native';
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

const PrivacyPolicyScreen = require('@/screens/PrivacyPolicyScreen').default;

describe('PrivacyPolicyScreen', () => {
  const navigation = { goBack: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders privacy content and triggers navigation back', () => {
    const { getByText, getByTestId } = renderWithProviders(
      <PrivacyPolicyScreen navigation={navigation} />
    );

    expect(getByText('Privacy Policy')).toBeTruthy();
    expect(getByText('This is a placeholder Privacy Policy shown locally in the app. Replace with your actual policy text.')).toBeTruthy();

    fireEvent.press(getByTestId('header'));
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
    expect(mockHeader).toHaveBeenCalledWith(expect.objectContaining({ title: 'Privacy Policy' }));
  });
});
