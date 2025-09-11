import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Typography } from '../common/Typography';
import { useTheme } from '@/theme';

interface SettingRowProps {
  title: string;
  subtitle?: string;
  icon?: string;
  iconColor?: string;
  onPress?: () => void;
  rightElement?: React.ReactNode;
  disabled?: boolean;
  testID?: string;
}

export const SettingRow: React.FC<SettingRowProps> = ({
  title,
  subtitle,
  icon,
  iconColor,
  onPress,
  rightElement,
  disabled = false,
  testID,
}) => {
  const { theme } = useTheme();

  const Container = onPress ? TouchableOpacity : View;
  const containerProps = onPress ? {
    onPress,
    disabled,
    activeOpacity: 0.7,
    accessibilityRole: 'button' as const,
  } : {};

  return (
    <Container
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.surface,
          borderBottomColor: theme.colors.border,
          opacity: disabled ? 0.5 : 1,
        }
      ]}
      testID={testID}
      {...containerProps}
    >
      <View style={styles.content}>
        {icon && (
          <View style={[styles.iconContainer, { marginRight: 12 }]}>
            <Ionicons 
              name={icon as keyof typeof Ionicons.glyphMap} 
              size={22} 
              color={iconColor || theme.colors.text.secondary} 
            />
          </View>
        )}
        
        <View style={styles.textContainer}>
          <Typography variant="body" weight="medium" color="primary">
            {title}
          </Typography>
          {subtitle && (
            <Typography 
              variant="caption" 
              color="secondary"
              style={styles.subtitle}
            >
              {subtitle}
            </Typography>
          )}
        </View>
        
        <View style={styles.rightContainer}>
          {rightElement}
          {onPress && (
            <Ionicons 
              name="chevron-forward" 
              size={20} 
              color={theme.colors.text.secondary}
              style={styles.chevron}
            />
          )}
        </View>
      </View>
    </Container>
  );
};

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 56,
  },
  iconContainer: {
    width: 24,
    alignItems: 'center',
  },
  textContainer: {
    flex: 1,
  },
  subtitle: {
    marginTop: 2,
  },
  rightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chevron: {
    marginLeft: 8,
  },
});
