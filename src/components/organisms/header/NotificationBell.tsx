import React from 'react';
import { HeaderIcon } from '@/components/molecules';

interface NotificationBellProps {
  onPress: () => void;
  color?: string;
  testID?: string;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({
  onPress,
  color,
  testID,
}) => {
  // In the future, this could be connected to a notifications slice
  const notificationCount = 0; // For now, hardcode to 0. Future: useSelector for notifications.unreadCount

  return (
    <HeaderIcon
      name="notifications-outline"
      onPress={onPress}
      color={color}
      badge={notificationCount > 0 ? notificationCount : undefined}
      accessibilityLabel="Notifications"
      testID={testID}
    />
  );
};
