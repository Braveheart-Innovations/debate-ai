import React, { useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import Svg, { Path, G, Circle } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useTheme } from '../../../theme';

const AnimatedPath = Animated.createAnimatedComponent(Path);

export interface DonutSegment {
  value: number;
  color: string;
  label?: string;
}

export interface DonutChartProps {
  segments: DonutSegment[];
  size?: number;
  strokeWidth?: number;
  centerContent?: React.ReactNode;
  animated?: boolean;
  onSegmentPress?: (index: number) => void;
  testID?: string;
}

/**
 * Helper function to convert polar coordinates to Cartesian
 */
const polarToCartesian = (
  centerX: number,
  centerY: number,
  radius: number,
  angleInDegrees: number
) => {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
};

/**
 * Generate SVG arc path
 */
const describeArc = (
  x: number,
  y: number,
  radius: number,
  startAngle: number,
  endAngle: number
) => {
  const start = polarToCartesian(x, y, radius, endAngle);
  const end = polarToCartesian(x, y, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

  return [
    'M', start.x, start.y,
    'A', radius, radius, 0, largeArcFlag, 0, end.x, end.y,
  ].join(' ');
};

/**
 * Animated segment component
 */
const AnimatedSegment: React.FC<{
  d: string;
  color: string;
  strokeWidth: number;
  animated: boolean;
  delay: number;
  onPress?: () => void;
}> = ({ d, color, strokeWidth, animated, delay, onPress }) => {
  const progress = useSharedValue(animated ? 0 : 1);

  React.useEffect(() => {
    if (animated) {
      progress.value = withTiming(1, {
        duration: 800,
        easing: Easing.out(Easing.cubic),
      });
    }
  }, [animated, delay, progress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: (1 - progress.value) * 500,
  }));

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        <AnimatedPath
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={500}
          animatedProps={animatedProps}
        />
      </TouchableOpacity>
    );
  }

  return (
    <AnimatedPath
      d={d}
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeDasharray={500}
      animatedProps={animatedProps}
    />
  );
};

/**
 * Static segment component (non-animated)
 */
const StaticSegment: React.FC<{
  d: string;
  color: string;
  strokeWidth: number;
  onPress?: () => void;
}> = ({ d, color, strokeWidth, onPress }) => {
  if (onPress) {
    return (
      <G onPress={onPress}>
        <Path
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
      </G>
    );
  }

  return (
    <Path
      d={d}
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
    />
  );
};

/**
 * DonutChart - A customizable donut/pie chart component using react-native-svg
 */
export const DonutChart: React.FC<DonutChartProps> = ({
  segments,
  size = 120,
  strokeWidth = 20,
  centerContent,
  animated = true,
  onSegmentPress,
  testID,
}) => {
  const { theme } = useTheme();

  const { paths, total } = useMemo(() => {
    const totalValue = segments.reduce((sum, seg) => sum + seg.value, 0);

    if (totalValue === 0) {
      return { paths: [], total: 0 };
    }

    const center = size / 2;
    const radius = (size - strokeWidth) / 2;
    const gap = 2; // Small gap between segments in degrees

    let currentAngle = 0;
    const calculatedPaths: { d: string; color: string; index: number }[] = [];

    segments.forEach((segment, index) => {
      if (segment.value <= 0) return;

      const segmentAngle = (segment.value / totalValue) * 360;
      const startAngle = currentAngle + (index > 0 ? gap / 2 : 0);
      const endAngle = currentAngle + segmentAngle - (index < segments.length - 1 ? gap / 2 : 0);

      // Handle full circle case (single segment)
      if (segments.length === 1 && segmentAngle >= 359) {
        // Draw a near-complete circle
        const d = describeArc(center, center, radius, 0, 359.99);
        calculatedPaths.push({ d, color: segment.color, index });
      } else if (endAngle - startAngle > 0.5) {
        const d = describeArc(center, center, radius, startAngle, endAngle);
        calculatedPaths.push({ d, color: segment.color, index });
      }

      currentAngle += segmentAngle;
    });

    return { paths: calculatedPaths, total: totalValue };
  }, [segments, size, strokeWidth]);

  // Background circle
  const backgroundCircle = useMemo(() => {
    const center = size / 2;
    const radius = (size - strokeWidth) / 2;
    return { cx: center, cy: center, r: radius };
  }, [size, strokeWidth]);

  if (total === 0) {
    return (
      <View style={[styles.container, { width: size, height: size }]} testID={testID}>
        <Svg width={size} height={size}>
          <Circle
            cx={backgroundCircle.cx}
            cy={backgroundCircle.cy}
            r={backgroundCircle.r}
            fill="none"
            stroke={theme.colors.gray[200]}
            strokeWidth={strokeWidth}
          />
        </Svg>
        {centerContent && (
          <View style={styles.centerContent}>
            {centerContent}
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.container, { width: size, height: size }]} testID={testID}>
      <Svg width={size} height={size}>
        {/* Background circle */}
        <Circle
          cx={backgroundCircle.cx}
          cy={backgroundCircle.cy}
          r={backgroundCircle.r}
          fill="none"
          stroke={theme.colors.gray[100]}
          strokeWidth={strokeWidth}
        />

        {/* Segments */}
        {paths.map((path, idx) =>
          animated ? (
            <AnimatedSegment
              key={`segment-${idx}`}
              d={path.d}
              color={path.color}
              strokeWidth={strokeWidth}
              animated={animated}
              delay={idx * 100}
              onPress={onSegmentPress ? () => onSegmentPress(path.index) : undefined}
            />
          ) : (
            <StaticSegment
              key={`segment-${idx}`}
              d={path.d}
              color={path.color}
              strokeWidth={strokeWidth}
              onPress={onSegmentPress ? () => onSegmentPress(path.index) : undefined}
            />
          )
        )}
      </Svg>

      {/* Center content */}
      {centerContent && (
        <View style={styles.centerContent}>
          {centerContent}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerContent: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default DonutChart;
