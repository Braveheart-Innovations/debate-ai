import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useDispatch } from 'react-redux';
import { HeaderIcon } from '@/components/molecules';
import { showSheet } from '../../../store';
import { useTheme } from '../../../theme';
import { HelpTopicId, HelpCategory } from '@/config/help/types';

interface HeaderActionsProps {
  showProfile?: boolean;
  showSupport?: boolean;
  showSettings?: boolean;
  variant?: 'default' | 'gradient'; // To determine icon colors
  onProfilePress?: () => void;
  onSupportPress?: () => void;
  onSettingsPress?: () => void;
  /** Context-aware help topic to show when "?" is pressed */
  helpTopicId?: HelpTopicId;
  /** Context-aware help category to filter when "?" is pressed (alternative to helpTopicId) */
  helpCategoryId?: HelpCategory;
}

export const HeaderActions: React.FC<HeaderActionsProps> = ({
  showProfile = true,
  showSupport = true,
  showSettings = true,
  variant = 'default',
  onProfilePress,
  onSupportPress,
  onSettingsPress,
  helpTopicId,
  helpCategoryId,
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
      // Open unified help sheet with optional context-aware topic or category
      // topicId takes precedence if both are provided
      const sheetData = helpTopicId
        ? { topicId: helpTopicId }
        : helpCategoryId
          ? { categoryId: helpCategoryId }
          : undefined;
      dispatch(showSheet({
        sheet: 'help',
        data: sheetData,
      }));
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
