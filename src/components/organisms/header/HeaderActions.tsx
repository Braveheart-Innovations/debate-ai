import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useDispatch } from 'react-redux';
import { HeaderIcon } from '../../molecules/HeaderIcon';
import { showSheet } from '../../../store';
import { useTheme } from '../../../theme';

interface HeaderActionsProps {
  showProfile?: boolean;
  showSupport?: boolean;
  showSettings?: boolean;
  variant?: 'default' | 'gradient'; // To determine icon colors
  onProfilePress?: () => void;
  onSupportPress?: () => void;
  onSettingsPress?: () => void;
}

export const HeaderActions: React.FC<HeaderActionsProps> = ({
  showProfile = true,
  showSupport = true,
  showSettings = true,
  variant = 'default',
  onProfilePress,
  onSupportPress,
  onSettingsPress,
}) => {
  const { theme } = useTheme();
  const dispatch = useDispatch();

  // Determine icon color based on variant
  const iconColor = variant === 'gradient' ? theme.colors.text.inverse : undefined;

  const handleProfilePress = () => {
    if (onProfilePress) {
      onProfilePress();
    } else {
      dispatch(showSheet({ sheet: 'profile' }));
    }
  };

  const handleSupportPress = () => {
    if (onSupportPress) {
      onSupportPress();
    } else {
      dispatch(showSheet({ sheet: 'support' }));
    }
  };

  const handleSettingsPress = () => {
    if (onSettingsPress) {
      onSettingsPress();
    } else {
      dispatch(showSheet({ sheet: 'settings' }));
    }
  };

  return (
    <View style={styles.container}>
      {showProfile && (
        <HeaderIcon
          name="person-circle-outline"
          onPress={handleProfilePress}
          color={iconColor}
          accessibilityLabel="Profile"
          testID="header-profile-button"
        />
      )}
      {showSupport && (
        <HeaderIcon
          name="help-circle-outline"
          onPress={handleSupportPress}
          color={iconColor}
          accessibilityLabel="Help & Support"
          testID="header-support-button"
        />
      )}
      {showSettings && (
        <HeaderIcon
          name="settings-outline"
          onPress={handleSettingsPress}
          color={iconColor}
          accessibilityLabel="Settings"
          testID="header-settings-button"
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});