import React from 'react';
import { View, ViewStyle } from 'react-native';
import { useResponsive } from '@/hooks/useResponsive';
import { containerMaxWidths, ContainerMaxWidth } from '@/theme/breakpoints';

interface ResponsiveContainerProps {
  children: React.ReactNode;
  /**
   * Maximum width for the container on larger screens.
   * - 'none': No max width limit
   * - 'sm': 540px
   * - 'md': 720px
   * - 'lg': 960px (default)
   * - 'xl': 1140px
   */
  maxWidth?: 'none' | ContainerMaxWidth;
  /**
   * Whether to center the container horizontally.
   * @default true
   */
  center?: boolean;
  style?: ViewStyle;
}

/**
 * A container component that limits content width on larger screens
 * for better readability. On phones, it takes full width.
 *
 * @example
 * <ResponsiveContainer maxWidth="lg">
 *   <ChatMessageList />
 * </ResponsiveContainer>
 */
export const ResponsiveContainer: React.FC<ResponsiveContainerProps> = ({
  children,
  maxWidth = 'lg',
  center = true,
  style,
}) => {
  const { isTablet } = useResponsive();

  const containerMaxWidth =
    maxWidth !== 'none' && isTablet ? containerMaxWidths[maxWidth] : undefined;

  return (
    <View
      style={[
        { width: '100%' },
        containerMaxWidth && {
          maxWidth: containerMaxWidth,
          alignSelf: center ? 'center' : 'flex-start',
        },
        style,
      ]}
    >
      {children}
    </View>
  );
};
