import React, { useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import Svg, { Rect, Line, G } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withSpring,
  withDelay,
} from 'react-native-reanimated';
import { Typography } from '../common/Typography';
import { useTheme } from '../../../theme';

const AnimatedRect = Animated.createAnimatedComponent(Rect);

export interface BarData {
  value: number;
  color: string;
  label: string;
  aiId?: string;
}

export interface BarChartProps {
  bars: BarData[];
  maxValue?: number;
  orientation?: 'horizontal' | 'vertical';
  width?: number;
  height?: number;
  showLabels?: boolean;
  showValues?: boolean;
  animated?: boolean;
  barRadius?: number;
  spacing?: number;
  onBarPress?: (index: number) => void;
  testID?: string;
}

/**
 * Animated horizontal bar component
 */
const AnimatedHorizontalBar: React.FC<{
  x: number;
  y: number;
  width: number;
  barHeight: number;
  color: string;
  radius: number;
  animated: boolean;
  delay: number;
  onPress?: () => void;
}> = ({ x, y, width, barHeight, color, radius, animated, delay, onPress }) => {
  const animatedValue = useSharedValue(animated ? 0 : 1);

  React.useEffect(() => {
    if (animated) {
      animatedValue.value = withDelay(
        delay,
        withSpring(1, { damping: 15, stiffness: 100 })
      );
    }
  }, [animated, delay, animatedValue]);

  const animatedProps = useAnimatedProps(() => ({
    width: width * animatedValue.value,
  }));

  const bar = (
    <AnimatedRect
      x={x}
      y={y}
      width={width}
      height={barHeight}
      fill={color}
      rx={radius}
      ry={radius}
      animatedProps={animatedProps}
    />
  );

  if (onPress) {
    return <G onPress={onPress}>{bar}</G>;
  }

  return bar;
};

/**
 * Animated vertical bar component
 */
const AnimatedVerticalBar: React.FC<{
  x: number;
  width: number;
  height: number;
  maxHeight: number;
  color: string;
  radius: number;
  animated: boolean;
  delay: number;
  onPress?: () => void;
}> = ({ x, width, height, maxHeight, color, radius, animated, delay, onPress }) => {
  const animatedValue = useSharedValue(animated ? 0 : 1);

  React.useEffect(() => {
    if (animated) {
      animatedValue.value = withDelay(
        delay,
        withSpring(1, { damping: 15, stiffness: 100 })
      );
    }
  }, [animated, delay, animatedValue]);

  const animatedProps = useAnimatedProps(() => {
    const animatedHeight = height * animatedValue.value;
    return {
      height: animatedHeight,
      y: maxHeight - animatedHeight,
    };
  });

  const bar = (
    <AnimatedRect
      x={x}
      y={maxHeight - height}
      width={width}
      height={height}
      fill={color}
      rx={radius}
      ry={radius}
      animatedProps={animatedProps}
    />
  );

  if (onPress) {
    return (
      <G onPress={onPress}>
        {bar}
      </G>
    );
  }

  return bar;
};

/**
 * Static bar component
 */
const StaticBar: React.FC<{
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  radius: number;
  onPress?: () => void;
}> = ({ x, y, width, height, color, radius, onPress }) => {
  const bar = (
    <Rect
      x={x}
      y={y}
      width={width}
      height={height}
      fill={color}
      rx={radius}
      ry={radius}
    />
  );

  if (onPress) {
    return (
      <G onPress={onPress}>
        {bar}
      </G>
    );
  }

  return bar;
};

/**
 * BarChart - A customizable horizontal or vertical bar chart using react-native-svg
 */
export const BarChart: React.FC<BarChartProps> = ({
  bars,
  maxValue: providedMaxValue,
  orientation = 'horizontal',
  width = 280,
  height = 200,
  showLabels = true,
  showValues = true,
  animated = true,
  barRadius = 4,
  spacing = 8,
  onBarPress,
  testID,
}) => {
  const { theme } = useTheme();

  const { processedBars, maxValue, labelWidth, valueWidth } = useMemo(() => {
    const max = providedMaxValue ?? Math.max(...bars.map(b => b.value), 1);

    // Calculate label width (approximate)
    const maxLabelLength = Math.max(...bars.map(b => b.label.length), 5);
    const calcLabelWidth = showLabels ? Math.min(maxLabelLength * 8, 80) : 0;

    // Calculate value width
    const calcValueWidth = showValues ? 50 : 0;

    return {
      processedBars: bars,
      maxValue: max,
      labelWidth: calcLabelWidth,
      valueWidth: calcValueWidth,
    };
  }, [bars, providedMaxValue, showLabels, showValues]);

  if (processedBars.length === 0) {
    return (
      <View style={[styles.container, { width, height }]} testID={testID}>
        <View style={styles.emptyContainer}>
          <Typography variant="caption" color="secondary">
            No data available
          </Typography>
        </View>
      </View>
    );
  }

  if (orientation === 'horizontal') {
    const barHeight = Math.max(
      (height - (processedBars.length - 1) * spacing) / processedBars.length,
      20
    );
    const chartWidth = width - labelWidth - valueWidth - 16;

    return (
      <View style={[styles.container, { width }]} testID={testID}>
        {processedBars.map((bar, index) => {
          const barWidth = (bar.value / maxValue) * chartWidth;

          return (
            <TouchableOpacity
              key={`bar-${index}`}
              style={[styles.barRow, { marginBottom: index < processedBars.length - 1 ? spacing : 0 }]}
              onPress={onBarPress ? () => onBarPress(index) : undefined}
              activeOpacity={onBarPress ? 0.7 : 1}
              disabled={!onBarPress}
            >
              {/* Label */}
              {showLabels && (
                <View style={[styles.labelContainer, { width: labelWidth }]}>
                  <Typography
                    variant="caption"
                    weight="medium"
                    numberOfLines={1}
                    style={styles.label}
                  >
                    {bar.label}
                  </Typography>
                </View>
              )}

              {/* Bar */}
              <View style={[styles.barContainer, { flex: 1, height: barHeight }]}>
                <Svg width={chartWidth} height={barHeight}>
                  {/* Background track */}
                  <Rect
                    x={0}
                    y={(barHeight - Math.min(barHeight, 24)) / 2}
                    width={chartWidth}
                    height={Math.min(barHeight, 24)}
                    fill={theme.colors.gray[100]}
                    rx={barRadius}
                    ry={barRadius}
                  />

                  {/* Value bar */}
                  {animated ? (
                    <AnimatedHorizontalBar
                      x={0}
                      y={(barHeight - Math.min(barHeight, 24)) / 2}
                      width={barWidth}
                      barHeight={Math.min(barHeight, 24)}
                      color={bar.color}
                      radius={barRadius}
                      animated={animated}
                      delay={index * 50}
                    />
                  ) : (
                    <StaticBar
                      x={0}
                      y={(barHeight - Math.min(barHeight, 24)) / 2}
                      width={barWidth}
                      height={Math.min(barHeight, 24)}
                      color={bar.color}
                      radius={barRadius}
                    />
                  )}
                </Svg>
              </View>

              {/* Value */}
              {showValues && (
                <View style={[styles.valueContainer, { width: valueWidth }]}>
                  <Typography variant="caption" weight="bold" color="primary">
                    {bar.value.toFixed(bar.value % 1 === 0 ? 0 : 1)}
                    {maxValue === 100 ? '%' : ''}
                  </Typography>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    );
  }

  // Vertical orientation
  const barWidth = Math.max(
    (width - (processedBars.length - 1) * spacing - 32) / processedBars.length,
    20
  );
  const chartHeight = height - (showLabels ? 40 : 0) - (showValues ? 24 : 0);

  return (
    <View style={[styles.container, { width, height }]} testID={testID}>
      {/* Chart area */}
      <View style={[styles.verticalChartContainer, { height: chartHeight }]}>
        <Svg width={width - 16} height={chartHeight}>
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => (
            <Line
              key={`grid-${idx}`}
              x1={0}
              y1={chartHeight * (1 - ratio)}
              x2={width - 16}
              y2={chartHeight * (1 - ratio)}
              stroke={theme.colors.gray[200]}
              strokeWidth={1}
              strokeDasharray={ratio === 0 ? undefined : '4,4'}
            />
          ))}

          {/* Bars */}
          {processedBars.map((bar, index) => {
            const barHeightValue = (bar.value / maxValue) * chartHeight;
            const x = index * (barWidth + spacing) + 8;

            return animated ? (
              <AnimatedVerticalBar
                key={`bar-${index}`}
                x={x}
                width={barWidth}
                height={barHeightValue}
                maxHeight={chartHeight}
                color={bar.color}
                radius={barRadius}
                animated={animated}
                delay={index * 50}
                onPress={onBarPress ? () => onBarPress(index) : undefined}
              />
            ) : (
              <StaticBar
                key={`bar-${index}`}
                x={x}
                y={chartHeight - barHeightValue}
                width={barWidth}
                height={barHeightValue}
                color={bar.color}
                radius={barRadius}
                onPress={onBarPress ? () => onBarPress(index) : undefined}
              />
            );
          })}
        </Svg>
      </View>

      {/* Values on top */}
      {showValues && (
        <View style={styles.verticalValues}>
          {processedBars.map((bar, index) => (
            <View
              key={`value-${index}`}
              style={[styles.verticalValueContainer, { width: barWidth + spacing }]}
            >
              <Typography variant="caption" weight="bold" color="secondary">
                {bar.value.toFixed(bar.value % 1 === 0 ? 0 : 1)}
              </Typography>
            </View>
          ))}
        </View>
      )}

      {/* Labels at bottom */}
      {showLabels && (
        <View style={styles.verticalLabels}>
          {processedBars.map((bar, index) => (
            <TouchableOpacity
              key={`label-${index}`}
              style={[styles.verticalLabelContainer, { width: barWidth + spacing }]}
              onPress={onBarPress ? () => onBarPress(index) : undefined}
              activeOpacity={onBarPress ? 0.7 : 1}
              disabled={!onBarPress}
            >
              <Typography
                variant="caption"
                weight="medium"
                numberOfLines={2}
                style={styles.verticalLabel}
              >
                {bar.label}
              </Typography>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    // Base container
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  labelContainer: {
    paddingRight: 8,
  },
  label: {
    textAlign: 'right',
  },
  barContainer: {
    justifyContent: 'center',
  },
  valueContainer: {
    paddingLeft: 8,
    alignItems: 'flex-end',
  },
  verticalChartContainer: {
    paddingHorizontal: 8,
  },
  verticalValues: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    marginTop: 4,
  },
  verticalValueContainer: {
    alignItems: 'center',
  },
  verticalLabels: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    marginTop: 4,
  },
  verticalLabelContainer: {
    alignItems: 'center',
  },
  verticalLabel: {
    textAlign: 'center',
  },
});

export default BarChart;
