import React from 'react';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { NotificationBell } from '@/components/organisms/header/NotificationBell';

const mockHeaderIcon = jest.fn(() => null);

jest.mock('@/components/molecules', () => {
  const { Text, View, TouchableOpacity } = require('react-native');
  return {
    HeaderIcon: (props: any) => mockHeaderIcon(props),
  };
});

describe('NotificationBell', () => {
  beforeEach(() => {
    mockHeaderIcon.mockClear();
  });

  it('renders HeaderIcon with notifications icon', () => {
    const onPress = jest.fn();

    renderWithProviders(
      <NotificationBell onPress={onPress} color="#123456" testID="notification" />
    );

    expect(mockHeaderIcon).toHaveBeenCalledWith(expect.objectContaining({
      name: 'notifications-outline',
      onPress,
      color: '#123456',
      badge: undefined,
      testID: 'notification',
    }));
  });
});
