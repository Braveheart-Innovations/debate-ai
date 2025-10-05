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

const TermsOfServiceScreen = require('@/screens/TermsOfServiceScreen').default;

describe('TermsOfServiceScreen', () => {
  const navigation = { goBack: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders terms content and triggers navigation back', () => {
    const { getByText, getByTestId } = renderWithProviders(
      <TermsOfServiceScreen navigation={navigation} />
    );

    expect(getByText('Terms of Service')).toBeTruthy();
    expect(getByText('This is a placeholder Terms of Service shown locally in the app. Replace with your actual terms.')).toBeTruthy();

    fireEvent.press(getByTestId('header'));
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
    expect(mockHeader).toHaveBeenCalledWith(expect.objectContaining({ title: 'Terms of Service' }));
  });
});
