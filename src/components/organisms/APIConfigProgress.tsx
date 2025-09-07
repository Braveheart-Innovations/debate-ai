import React from 'react';
import { StyleSheet } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Box } from '../atoms';
import { Typography, ProgressBar, ClearKeysButton } from '../molecules';
import { useTheme } from '../../theme';

export interface APIConfigProgressProps {
  configuredCount: number;
  totalCount: number;
  onClearAll: () => Promise<void>;
  subtitle?: string;
  testID?: string;
}

export const APIConfigProgress: React.FC<APIConfigProgressProps> = ({
  configuredCount,
  totalCount,
  onClearAll,
  subtitle = 'Connect your AI services to unlock their full potential',
  testID,
}) => {
  const { theme } = useTheme();

  const progressPercentage = totalCount > 0 ? (configuredCount / totalCount) * 100 : 0;

  const getStatusMessage = () => {
    if (configuredCount === 0) {
      return 'No services connected';
    } else if (configuredCount === totalCount) {
      return '🎉 All services connected!';
    } else {
      return `${configuredCount} of ${totalCount} services connected`;
    }
  };

  return (
    <Animated.View
      entering={FadeInDown.springify()}
      style={styles.container}
      testID={testID}
    >
      <Typography 
        variant="body" 
        style={[styles.subtitle, { color: theme.colors.text.primary }]}
      >
        {subtitle}
      </Typography>

      {/* Progress Bar */}
      <Box style={styles.progressSection}>
        <ProgressBar 
          percentage={progressPercentage}
          colors={theme.colors.gradients.primary as [string, string]}
          height={8}
          backgroundColor={theme.colors.gray[200]}
        />
        
        <Typography
          variant="caption"
          style={[styles.statusMessage, { color: theme.colors.text.primary }]}
        >
          {getStatusMessage()}
        </Typography>
      </Box>

      {/* Clear All Button */}
      <ClearKeysButton
        onPress={onClearAll}
        isVisible={configuredCount > 0}
        title="Clear All Keys"
        subtitle="Remove all configured API keys"
        style={styles.clearButton}
      />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 20,
    marginBottom: 24,
  },
  subtitle: {
    marginBottom: 20,
  },
  progressSection: {
    marginBottom: 20,
  },
  statusMessage: {
    marginTop: 8,
    textAlign: 'center',
  },
  clearButton: {
    // Spacing handled by isVisible prop
  },
});
