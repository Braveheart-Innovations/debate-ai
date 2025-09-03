import React from 'react';
import { View, ViewStyle, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Typography } from './Typography';
import { useTheme } from '../../theme';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  icon?: string;
  style?: ViewStyle;
  onAction?: () => void;
  actionLabel?: string;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  subtitle,
  icon,
  style,
  onAction,
  actionLabel,
}) => {
  const { theme } = useTheme();
  
  return (
    <View style={[{ marginBottom: theme.spacing.md }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
          <LinearGradient
            colors={[theme.colors.primary[400], theme.colors.primary[600]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ width: 6, height: 24, borderRadius: 3, marginRight: 10 }}
          />
        
          {icon && (
            <Typography style={{ fontSize: 18, marginRight: 6 }}>
              {icon}
            </Typography>
          )}
          <Typography variant="title" weight="semibold">
            {title}
          </Typography>
        </View>
        {onAction && actionLabel && (
          <TouchableOpacity onPress={onAction}>
            <Typography variant="body" color="primary" style={{ paddingHorizontal: theme.spacing.sm }}>
              {actionLabel}
            </Typography>
          </TouchableOpacity>
        )}
      </View>
      {subtitle && (
        <Typography variant="body" color="secondary" style={{ marginTop: 4 }}>
          {subtitle}
        </Typography>
      )}
    </View>
  );
};
