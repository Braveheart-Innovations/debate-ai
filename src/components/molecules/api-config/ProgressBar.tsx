import React from 'react';
import { StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Box } from '@/components/atoms';
import { useTheme } from '@/theme';

interface ProgressBarProps {
  percentage: number;
  colors?: [string, string, ...string[]];
  height?: number;
  backgroundColor?: string;
  borderRadius?: number;
  style?: ViewStyle;
  testID?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  percentage,
  colors,
  height = 8,
  backgroundColor,
  borderRadius = 4,
  style,
  testID,
}) => {
  const { theme } = useTheme();

  const progressColors = colors || (theme.colors.gradients.primary as [string, string]);
  const bgColor = backgroundColor || theme.colors.gray[200];
  
  // Ensure percentage is between 0 and 100
  const clampedPercentage = Math.max(0, Math.min(100, percentage));

  return (
    <Box
      style={[
        styles.container,
        {
          height,
          backgroundColor: bgColor,
          borderRadius,
        },
        style,
      ]}
      testID={testID}
    >
      <LinearGradient
        colors={progressColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[
          styles.progress,
          {
            width: `${clampedPercentage}%`,
            height: '100%',
            borderRadius,
          },
        ]}
      />
    </Box>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  progress: {
    // Filled by props
  },
});
