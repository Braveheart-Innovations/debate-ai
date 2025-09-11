import React from 'react';
import { Text, TextStyle, StyleProp } from 'react-native';
import { useTheme } from '@/theme';

interface TypographyProps {
  variant?: 'heading' | 'title' | 'subtitle' | 'body' | 'caption' | 'button' | 'default';
  color?: 'primary' | 'secondary' | 'inverse' | 'error' | 'success' | 'disabled' | 'brand' | 'warning';
  weight?: 'normal' | 'medium' | 'semibold' | 'bold';
  align?: 'left' | 'center' | 'right';
  children?: React.ReactNode;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  ellipsizeMode?: 'head' | 'middle' | 'tail' | 'clip';
  selectable?: boolean;
}

export const Typography: React.FC<TypographyProps> = ({
  variant = 'default',
  color = 'primary',
  weight = 'normal',
  align = 'left',
  children,
  style,
  selectable,
  ...props
}) => {
  const { theme } = useTheme();
  
  // Preserve ALL existing variants from ThemedText
  const variantStyles = {
    default: { fontSize: 16, lineHeight: 24 },
    body: { fontSize: 16, lineHeight: 24 },
    heading: { fontSize: 28, lineHeight: 36, fontWeight: 'bold' as const },
    title: { fontSize: 24, lineHeight: 32, fontWeight: 'bold' as const },
    subtitle: { fontSize: 18, lineHeight: 26, fontWeight: '500' as const },
    caption: { fontSize: 14, lineHeight: 20 },
    button: { fontSize: 16, lineHeight: 24, fontWeight: '600' as const },
  };
  
  // Preserve ALL existing colors from ThemedText
  const colorMap = {
    primary: theme.colors.text.primary,
    secondary: theme.colors.text.secondary,
    inverse: theme.colors.text.inverse,
    disabled: theme.colors.text.disabled,
    brand: theme.colors.brand,
    warning: theme.colors.warning[500],
    error: theme.colors.error[500],
    success: theme.colors.success[500],
  };
  
  const weightMap = {
    normal: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  };
  
  return (
    <Text 
      style={[
        variantStyles[variant],
        { 
          color: colorMap[color],
          fontWeight: weightMap[weight],
          textAlign: align 
        },
        style
      ]}
      selectable={selectable}
      {...props}
    >
      {children}
    </Text>
  );
};
