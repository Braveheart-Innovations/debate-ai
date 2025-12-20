import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';
import { Typography } from '../common/Typography';
import { useTheme } from '../../../theme';

export interface ChartTooltipProps {
  visible: boolean;
  x: number;
  y: number;
  content: React.ReactNode;
  pointerDirection?: 'up' | 'down' | 'left' | 'right';
  containerWidth?: number;
  testID?: string;
}

const TOOLTIP_WIDTH = 100;
const TOOLTIP_HEIGHT = 50;
const POINTER_SIZE = 8;
const SCREEN_PADDING = 16;

/**
 * ChartTooltip - A floating tooltip for displaying chart data
 */
export const ChartTooltip: React.FC<ChartTooltipProps> = ({
  visible,
  x,
  y,
  content,
  pointerDirection = 'down',
  containerWidth,
  testID,
}) => {
  const { theme } = useTheme();
  const screenWidth = containerWidth || Dimensions.get('window').width;

  // Calculate position to keep tooltip within bounds
  const getPosition = () => {
    let tooltipX = x - TOOLTIP_WIDTH / 2;
    let tooltipY = y;

    // Adjust X to keep within screen
    if (tooltipX < SCREEN_PADDING) {
      tooltipX = SCREEN_PADDING;
    } else if (tooltipX + TOOLTIP_WIDTH > screenWidth - SCREEN_PADDING) {
      tooltipX = screenWidth - SCREEN_PADDING - TOOLTIP_WIDTH;
    }

    // Adjust Y based on pointer direction
    switch (pointerDirection) {
      case 'up':
        tooltipY = y + POINTER_SIZE;
        break;
      case 'down':
        tooltipY = y - TOOLTIP_HEIGHT - POINTER_SIZE;
        break;
      case 'left':
        tooltipX = x + POINTER_SIZE;
        tooltipY = y - TOOLTIP_HEIGHT / 2;
        break;
      case 'right':
        tooltipX = x - TOOLTIP_WIDTH - POINTER_SIZE;
        tooltipY = y - TOOLTIP_HEIGHT / 2;
        break;
    }

    return { tooltipX, tooltipY };
  };

  const { tooltipX, tooltipY } = getPosition();

  const getPointerStyle = () => {
    const baseStyle = {
      position: 'absolute' as const,
      width: 0,
      height: 0,
      borderStyle: 'solid' as const,
    };

    const borderColor = theme.colors.card;

    switch (pointerDirection) {
      case 'up':
        return {
          ...baseStyle,
          top: -POINTER_SIZE,
          left: TOOLTIP_WIDTH / 2 - POINTER_SIZE,
          borderLeftWidth: POINTER_SIZE,
          borderRightWidth: POINTER_SIZE,
          borderBottomWidth: POINTER_SIZE,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderBottomColor: borderColor,
        };
      case 'down':
        return {
          ...baseStyle,
          bottom: -POINTER_SIZE,
          left: TOOLTIP_WIDTH / 2 - POINTER_SIZE,
          borderLeftWidth: POINTER_SIZE,
          borderRightWidth: POINTER_SIZE,
          borderTopWidth: POINTER_SIZE,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderTopColor: borderColor,
        };
      case 'left':
        return {
          ...baseStyle,
          left: -POINTER_SIZE,
          top: TOOLTIP_HEIGHT / 2 - POINTER_SIZE,
          borderTopWidth: POINTER_SIZE,
          borderBottomWidth: POINTER_SIZE,
          borderRightWidth: POINTER_SIZE,
          borderTopColor: 'transparent',
          borderBottomColor: 'transparent',
          borderRightColor: borderColor,
        };
      case 'right':
        return {
          ...baseStyle,
          right: -POINTER_SIZE,
          top: TOOLTIP_HEIGHT / 2 - POINTER_SIZE,
          borderTopWidth: POINTER_SIZE,
          borderBottomWidth: POINTER_SIZE,
          borderLeftWidth: POINTER_SIZE,
          borderTopColor: 'transparent',
          borderBottomColor: 'transparent',
          borderLeftColor: borderColor,
        };
    }
  };

  if (!visible) {
    return null;
  }

  return (
    <Animated.View
      entering={FadeIn.duration(150)}
      exiting={FadeOut.duration(100)}
      style={[
        styles.container,
        {
          left: tooltipX,
          top: tooltipY,
          backgroundColor: theme.colors.card,
          shadowColor: theme.colors.shadowDark,
        },
      ]}
      testID={testID}
    >
      {/* Pointer */}
      <View style={getPointerStyle()} />

      {/* Content */}
      <View style={styles.content}>
        {typeof content === 'string' ? (
          <Typography variant="caption" weight="medium">
            {content}
          </Typography>
        ) : (
          content
        )}
      </View>
    </Animated.View>
  );
};

/**
 * Simple tooltip content component
 */
export const TooltipContent: React.FC<{
  title?: string;
  value: string | number;
  subtitle?: string;
  color?: string;
}> = ({ title, value, subtitle, color }) => {
  return (
    <View style={styles.tooltipContent}>
      {title && (
        <Typography variant="caption" color="secondary" numberOfLines={1}>
          {title}
        </Typography>
      )}
      <Typography
        variant="body"
        weight="bold"
        style={color ? { color } : undefined}
      >
        {typeof value === 'number' ? value.toFixed(value % 1 === 0 ? 0 : 1) : value}
      </Typography>
      {subtitle && (
        <Typography variant="caption" color="secondary" numberOfLines={1}>
          {subtitle}
        </Typography>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    width: TOOLTIP_WIDTH,
    minHeight: TOOLTIP_HEIGHT,
    borderRadius: 8,
    padding: 8,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
    zIndex: 1000,
  },
  content: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  tooltipContent: {
    alignItems: 'center',
  },
});

export default ChartTooltip;
