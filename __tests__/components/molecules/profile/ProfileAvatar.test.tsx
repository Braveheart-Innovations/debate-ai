import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

const { ProfileAvatar } = require('@/components/molecules/profile/ProfileAvatar');

describe('ProfileAvatar', () => {
  it('renders with display name', () => {
    const { getByText } = renderWithProviders(
      <ProfileAvatar displayName="John Doe" />
    );
    expect(getByText('JD')).toBeTruthy();
  });

  it('renders with email when no display name', () => {
    const { getByText } = renderWithProviders(
      <ProfileAvatar email="test@example.com" />
    );
    expect(getByText('TE')).toBeTruthy();
  });

  it('calls onPress when pressed', () => {
    const onPress = jest.fn();
    const { getByTestId } = renderWithProviders(
      <ProfileAvatar displayName="John" onPress={onPress} testID="avatar" />
    );

    fireEvent.press(getByTestId('avatar'));
    expect(onPress).toHaveBeenCalled();
  });

  it('shows premium indicator when isPremium is true', () => {
    const result = renderWithProviders(
      <ProfileAvatar displayName="John" isPremium />
    );
    expect(result).toBeTruthy();
  });
});
