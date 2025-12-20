import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path, Circle, Line, G, Defs, LinearGradient, Stop } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Typography } from '../common/Typography';
import { useTheme } from '../../../theme';

const AnimatedPath = Animated.createAnimatedComponent(Path);

export interface LinePoint {
  x: number;
  y: number;
  label?: string;
}

export interface ChartLine {
  points: LinePoint[];
  color: string;
  label?: string;
  strokeWidth?: number;
}

export interface LineChartProps {
  lines: ChartLine[];
  width?: number;
  height?: number;
  showGrid?: boolean;
  showDots?: boolean;
  showArea?: boolean;
  xLabels?: string[];
  yLabels?: string[];
  animated?: boolean;
  onPointPress?: (lineIndex: number, pointIndex: number) => void;
  testID?: string;
}

/**
 * Animated line path component
 */
const AnimatedLine: React.FC<{
  d: string;
  color: string;
  strokeWidth: number;
  pathLength: number;
  animated: boolean;
  delay: number;
}> = ({ d, color, strokeWidth, pathLength, animated, delay }) => {
  const progress = useSharedValue(animated ? 0 : 1);

  React.useEffect(() => {
    if (animated) {
      progress.value = withTiming(1, {
        duration: 1000 + delay,
        easing: Easing.out(Easing.cubic),
      });
    }
  }, [animated, delay, progress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: pathLength * (1 - progress.value),
  }));

  return (
    <AnimatedPath
      d={d}
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={pathLength}
      animatedProps={animatedProps}
    />
  );
};

/**
 * LineChart - A customizable multi-line chart using react-native-svg
 */
export const LineChart: React.FC<LineChartProps> = ({
  lines,
  width = 280,
  height = 180,
  showGrid = true,
  showDots = true,
  showArea = false,
  xLabels,
  yLabels,
  animated = true,
  onPointPress,
  testID,
}) => {
  const { theme } = useTheme();

  const padding = {
    left: yLabels ? 40 : 16,
    right: 16,
    top: 16,
    bottom: xLabels ? 32 : 16,
  };

  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const { processedLines, maxY, minY, maxX } = useMemo(() => {
    if (lines.length === 0) {
      return { processedLines: [], maxY: 100, minY: 0, maxX: 5 };
    }

    const allPoints = lines.flatMap(line => line.points);
    const yValues = allPoints.map(p => p.y);
    const xValues = allPoints.map(p => p.x);

    const max = Math.max(...yValues, 0);
    const min = Math.min(...yValues, 0);
    const xMax = Math.max(...xValues, 1);

    // Add some padding to Y axis
    const yPadding = (max - min) * 0.1 || 10;

    return {
      processedLines: lines,
      maxY: Math.ceil(max + yPadding),
      minY: Math.floor(Math.min(min - yPadding, 0)),
      maxX: xMax,
    };
  }, [lines]);

  const scaleX = (x: number) => padding.left + (x / maxX) * chartWidth;
  const scaleY = (y: number) => padding.top + chartHeight - ((y - minY) / (maxY - minY)) * chartHeight;

  const generateLinePath = (points: LinePoint[]): string => {
    if (points.length === 0) return '';

    const sortedPoints = [...points].sort((a, b) => a.x - b.x);

    let path = `M ${scaleX(sortedPoints[0].x)} ${scaleY(sortedPoints[0].y)}`;

    for (let i = 1; i < sortedPoints.length; i++) {
      path += ` L ${scaleX(sortedPoints[i].x)} ${scaleY(sortedPoints[i].y)}`;
    }

    return path;
  };

  const generateAreaPath = (points: LinePoint[], gradientId: string): { path: string; id: string } => {
    if (points.length === 0) return { path: '', id: gradientId };

    const sortedPoints = [...points].sort((a, b) => a.x - b.x);
    let path = `M ${scaleX(sortedPoints[0].x)} ${scaleY(sortedPoints[0].y)}`;

    for (let i = 1; i < sortedPoints.length; i++) {
      path += ` L ${scaleX(sortedPoints[i].x)} ${scaleY(sortedPoints[i].y)}`;
    }

    // Close the path to the bottom
    path += ` L ${scaleX(sortedPoints[sortedPoints.length - 1].x)} ${scaleY(minY)}`;
    path += ` L ${scaleX(sortedPoints[0].x)} ${scaleY(minY)}`;
    path += ' Z';

    return { path, id: gradientId };
  };

  const estimatePathLength = (points: LinePoint[]): number => {
    if (points.length < 2) return 0;

    let length = 0;
    const sortedPoints = [...points].sort((a, b) => a.x - b.x);

    for (let i = 1; i < sortedPoints.length; i++) {
      const dx = scaleX(sortedPoints[i].x) - scaleX(sortedPoints[i - 1].x);
      const dy = scaleY(sortedPoints[i].y) - scaleY(sortedPoints[i - 1].y);
      length += Math.sqrt(dx * dx + dy * dy);
    }

    return length;
  };

  if (processedLines.length === 0 || processedLines.every(l => l.points.length === 0)) {
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

  return (
    <View style={[styles.container, { width, height }]} testID={testID}>
      <Svg width={width} height={height}>
        <Defs>
          {/* Gradients for area fills */}
          {processedLines.map((line, idx) => (
            <LinearGradient
              key={`gradient-${idx}`}
              id={`area-gradient-${idx}`}
              x1="0%"
              y1="0%"
              x2="0%"
              y2="100%"
            >
              <Stop offset="0%" stopColor={line.color} stopOpacity={0.3} />
              <Stop offset="100%" stopColor={line.color} stopOpacity={0.05} />
            </LinearGradient>
          ))}
        </Defs>

        {/* Grid */}
        {showGrid && (
          <G>
            {/* Horizontal grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
              const y = padding.top + chartHeight * (1 - ratio);
              return (
                <Line
                  key={`h-grid-${idx}`}
                  x1={padding.left}
                  y1={y}
                  x2={width - padding.right}
                  y2={y}
                  stroke={theme.colors.gray[200]}
                  strokeWidth={1}
                  strokeDasharray={ratio === 0 ? undefined : '4,4'}
                />
              );
            })}

            {/* Vertical grid lines */}
            {Array.from({ length: maxX + 1 }, (_, i) => i).map((x, idx) => (
              <Line
                key={`v-grid-${idx}`}
                x1={scaleX(x)}
                y1={padding.top}
                x2={scaleX(x)}
                y2={height - padding.bottom}
                stroke={theme.colors.gray[200]}
                strokeWidth={1}
                strokeDasharray="4,4"
              />
            ))}
          </G>
        )}

        {/* Area fills */}
        {showArea && processedLines.map((line, idx) => {
          const { path, id } = generateAreaPath(line.points, `area-gradient-${idx}`);
          return (
            <Path
              key={`area-${idx}`}
              d={path}
              fill={`url(#${id})`}
            />
          );
        })}

        {/* Lines */}
        {processedLines.map((line, idx) => {
          const path = generateLinePath(line.points);
          const pathLength = estimatePathLength(line.points);

          return animated ? (
            <AnimatedLine
              key={`line-${idx}`}
              d={path}
              color={line.color}
              strokeWidth={line.strokeWidth || 2}
              pathLength={pathLength}
              animated={animated}
              delay={idx * 200}
            />
          ) : (
            <Path
              key={`line-${idx}`}
              d={path}
              fill="none"
              stroke={line.color}
              strokeWidth={line.strokeWidth || 2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}

        {/* Dots */}
        {showDots && processedLines.map((line, lineIdx) =>
          line.points.map((point, pointIdx) => (
            <G
              key={`dot-${lineIdx}-${pointIdx}`}
              onPress={onPointPress ? () => onPointPress(lineIdx, pointIdx) : undefined}
            >
              <Circle
                cx={scaleX(point.x)}
                cy={scaleY(point.y)}
                r={6}
                fill={theme.colors.card}
                stroke={line.color}
                strokeWidth={2}
              />
            </G>
          ))
        )}
      </Svg>

      {/* X-axis labels */}
      {xLabels && xLabels.length > 0 && (
        <View style={[styles.xLabelsContainer, { left: padding.left, right: padding.right }]}>
          {xLabels.map((label, idx) => (
            <View
              key={`x-label-${idx}`}
              style={[
                styles.xLabel,
                { left: (idx / Math.max(xLabels.length - 1, 1)) * chartWidth - 20, width: 40 },
              ]}
            >
              <Typography variant="caption" color="secondary" style={styles.labelText}>
                {label}
              </Typography>
            </View>
          ))}
        </View>
      )}

      {/* Y-axis labels */}
      {yLabels && yLabels.length > 0 && (
        <View style={[styles.yLabelsContainer, { top: padding.top, height: chartHeight }]}>
          {yLabels.map((label, idx) => (
            <View
              key={`y-label-${idx}`}
              style={[
                styles.yLabel,
                { top: (idx / Math.max(yLabels.length - 1, 1)) * chartHeight - 8 },
              ]}
            >
              <Typography variant="caption" color="secondary">
                {label}
              </Typography>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  xLabelsContainer: {
    position: 'absolute',
    bottom: 8,
    flexDirection: 'row',
  },
  xLabel: {
    position: 'absolute',
    alignItems: 'center',
  },
  labelText: {
    textAlign: 'center',
  },
  yLabelsContainer: {
    position: 'absolute',
    left: 0,
    width: 36,
  },
  yLabel: {
    position: 'absolute',
    right: 4,
  },
});

export default LineChart;
