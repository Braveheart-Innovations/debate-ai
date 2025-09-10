import React from 'react';
import { StyleSheet, ViewStyle } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Box } from '@/components/atoms';
import { Typography } from '@/components/molecules';
import { useTheme } from '@/theme';

export interface APISecurityNoteProps {
  title?: string;
  securityPoints?: string[];
  style?: ViewStyle;
  testID?: string;
}

export const APISecurityNote: React.FC<APISecurityNoteProps> = ({
  title = '🔒 Your Security',
  securityPoints = [
    'Keys are encrypted and stored locally',
    'We never send keys to our servers',
    'You can modify or clear keys anytime',
    'Each service connection is isolated'
  ],
  style,
  testID,
}) => {
  const { theme } = useTheme();

  return (
    <Animated.View
      entering={FadeInDown.delay(600).springify()}
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.border,
        },
        style,
      ]}
      testID={testID}
    >
      <Typography 
        variant="subtitle" 
        weight="semibold" 
        style={styles.title}
      >
        {title}
      </Typography>
      
      <Box style={styles.pointsContainer}>
        {securityPoints.map((point, index) => (
          <Box key={index} style={styles.securityPoint}>
            <Typography variant="body" color="secondary">
              • {point}
            </Typography>
          </Box>
        ))}
      </Box>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    padding: 16,
    marginTop: 32,
    borderWidth: 1,
  },
  title: {
    marginBottom: 8,
  },
  pointsContainer: {
    // Container for security points
  },
  securityPoint: {
    marginBottom: 4,
  },
});
