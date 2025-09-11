/**
 * Preview card component for debate configuration
 * Shows a summary item with optional edit capability
 */

import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { useTheme } from '@/theme';
import { Typography } from '../common/Typography';

export interface DebatePreviewCardProps {
  label: string;
  value: string | React.ReactNode;
  onEdit?: () => void;
  editable?: boolean;
  icon?: string;
  variant?: 'default' | 'highlight' | 'warning';
}

export const DebatePreviewCard: React.FC<DebatePreviewCardProps> = ({
  label,
  value,
  onEdit,
  editable = false,
  icon,
  variant = 'default',
}) => {
  const { theme } = useTheme();

  const variantStyles = {
    default: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      labelColor: theme.colors.text.secondary,
      valueColor: theme.colors.text.primary,
    },
    highlight: {
      backgroundColor: theme.colors.primary[50],
      borderColor: theme.colors.primary[200],
      labelColor: theme.colors.primary[600],
      valueColor: theme.colors.primary[700],
    },
    warning: {
      backgroundColor: theme.colors.warning[50],
      borderColor: theme.colors.warning[200],
      labelColor: theme.colors.warning[600],
      valueColor: theme.colors.warning[700],
    },
  };

  const styles = variantStyles[variant];

  const content = (
    <View style={{
      backgroundColor: styles.backgroundColor,
      borderRadius: theme.borderRadius.md,
      padding: theme.spacing.md,
      borderWidth: 1,
      borderColor: styles.borderColor,
      marginBottom: theme.spacing.sm,
    }}>
      {/* Header */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: theme.spacing.xs,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {icon && (
            <Typography 
              variant="caption" 
              style={{ marginRight: theme.spacing.xs }}
            >
              {icon}
            </Typography>
          )}
          <Typography 
            variant="caption" 
            weight="semibold"
            style={{ color: styles.labelColor }}
          >
            {label}:
          </Typography>
        </View>
        
        {editable && onEdit && (
          <TouchableOpacity
            onPress={onEdit}
            style={{
              padding: theme.spacing.xs,
              borderRadius: theme.borderRadius.sm,
            }}
          >
            <Typography 
              variant="caption" 
              style={{ 
                color: theme.colors.primary[600],
                textDecorationLine: 'underline',
              }}
            >
              Edit
            </Typography>
          </TouchableOpacity>
        )}
      </View>

      {/* Value */}
      <View>
        {typeof value === 'string' ? (
          <Typography 
            variant="body" 
            weight="medium"
            style={{ 
              color: styles.valueColor,
              lineHeight: 20,
            }}
          >
            {value}
          </Typography>
        ) : (
          value
        )}
      </View>
    </View>
  );

  if (editable && onEdit) {
    return (
      <TouchableOpacity onPress={onEdit}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
};
