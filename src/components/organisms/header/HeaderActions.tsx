import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useDispatch } from 'react-redux';
import { HeaderIcon } from '../../molecules/HeaderIcon';
import { showSheet } from '../../../store';
import { useTheme } from '../../../theme';

interface HeaderActionsProps {
  onSettingsPress?: () => void;
  showSettings?: boolean;
  variant?: 'default' | 'gradient'; // To determine icon colors
}

export const HeaderActions: React.FC<HeaderActionsProps> = ({
  onSettingsPress,
  showSettings = true,
  variant = 'default',
}) => {
  const { theme } = useTheme();
  const dispatch = useDispatch();

  // Determine icon color based on variant
  const iconColor = variant === 'gradient' ? theme.colors.text.inverse : undefined;

  const handleSettingsPress = () => {
    if (onSettingsPress) {
      onSettingsPress();
    } else {
      // Default behavior - show UnifiedSettings modal
      dispatch(showSheet({ sheet: 'settings' }));
    }
  };

  return (
    <View style={styles.container}>
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