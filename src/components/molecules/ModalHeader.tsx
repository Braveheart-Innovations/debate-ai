/**
 * ModalHeader Component
 * Reusable modal header with title and close button following atomic design principles
 */

import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Typography } from './Typography';
import { useTheme } from '../../theme';

export interface ModalHeaderProps {
  title: string;
  onClose: () => void;
  subtitle?: string;
  variant?: 'solid' | 'gradient';
}

export const ModalHeader: React.FC<ModalHeaderProps> = ({
  title,
  onClose,
  subtitle,
  variant = 'gradient',
}) => {
  const { theme } = useTheme();

  const HeaderContent = () => (
    <View style={styles.headerInner}>
      <View style={{ flex: 1 }}>
        <Typography variant="title" weight="bold" color={variant === 'gradient' ? 'inverse' : undefined}>
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="caption" color={variant === 'gradient' ? 'inverse' : 'secondary'}>
            {subtitle}
          </Typography>
        )}
      </View>
      <TouchableOpacity 
        onPress={onClose}
        style={[styles.closeButton, { backgroundColor: variant === 'gradient' ? 'rgba(255,255,255,0.15)' : theme.colors.surface }]}
        activeOpacity={0.7}
        accessibilityLabel="Close"
        accessibilityRole="button"
      >
        <Typography variant="title" weight="bold" style={[styles.closeIcon, { color: variant === 'gradient' ? '#fff' : undefined }]}>
          ×
        </Typography>
      </TouchableOpacity>
    </View>
  );

  if (variant === 'gradient') {
    const [c1, c2] = theme.colors.gradients.premium as unknown as [string, string];
    return (
      <LinearGradient
        colors={[c1, c2]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { borderBottomColor: 'transparent' }]}
      >
        <HeaderContent />
      </LinearGradient>
    );
  }

  return (
    <View style={[styles.header, { borderBottomColor: theme.colors.border }] }>
      <HeaderContent />
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  headerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flex: 1,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeIcon: {
    fontSize: 24,
    lineHeight: 24,
  },
});

export default ModalHeader;
