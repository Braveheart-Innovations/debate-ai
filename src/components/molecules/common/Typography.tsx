import React, { useMemo } from 'react';
import { Text, TextStyle, StyleProp } from 'react-native';
import { useTheme } from '@/theme';
import { useResponsive } from '@/hooks/useResponsive';

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
  const { fontSize } = useResponsive();

  // Responsive variant styles - scales up on tablet
  const variantStyles = useMemo(() => ({
    default: { fontSize: fontSize('base'), lineHeight: fontSize('base') * 1.5 },
    body: { fontSize: fontSize('base'), lineHeight: fontSize('base') * 1.5 },
    heading: { fontSize: fontSize('3xl'), lineHeight: fontSize('3xl') * 1.3, fontWeight: 'bold' as const },
    title: { fontSize: fontSize('2xl'), lineHeight: fontSize('2xl') * 1.33, fontWeight: 'bold' as const },
    subtitle: { fontSize: fontSize('lg'), lineHeight: fontSize('lg') * 1.44, fontWeight: '500' as const },
    caption: { fontSize: fontSize('sm'), lineHeight: fontSize('sm') * 1.43 },
    button: { fontSize: fontSize('base'), lineHeight: fontSize('base') * 1.5, fontWeight: '600' as const },
  }), [fontSize]);
  
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
