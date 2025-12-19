/**
 * InfoButton
 *
 * A small contextual help button (i) that opens help content
 * for a specific topic when pressed.
 */

import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/theme';
import { useDispatch } from 'react-redux';
import { showSheet } from '@/store/navigationSlice';
import { HelpTopicId } from '@/config/help/types';

interface InfoButtonProps {
  /** The help topic ID to display when pressed */
  topicId: HelpTopicId;
  /** Size variant - small (20px) or medium (24px) */
  size?: 'small' | 'medium';
  /** Optional custom color override */
  color?: string;
  /** Test ID for testing */
  testID?: string;
}

export const InfoButton: React.FC<InfoButtonProps> = ({
  topicId,
  size = 'small',
  color,
  testID,
}) => {
  const { theme } = useTheme();
  const dispatch = useDispatch();

  const iconSize = size === 'small' ? 20 : 24;
  const iconColor = color || theme.colors.text.secondary;

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    dispatch(showSheet({ sheet: 'help', data: { topicId } }));
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={styles.button}
      activeOpacity={0.6}
      accessibilityLabel={`Help information`}
      accessibilityRole="button"
      accessibilityHint={`Opens help for ${topicId.replace(/-/g, ' ')}`}
      testID={testID}
    >
      <Ionicons
        name="information-circle-outline"
        size={iconSize}
        color={iconColor}
      />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    padding: 4,
  },
});
