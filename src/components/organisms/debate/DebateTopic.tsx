import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Typography } from '@/components/molecules';
import { Box } from '../../atoms/Box';
import { useTheme, Theme } from '../../../theme';

interface DebateTopicProps {
  topic: string;
  roundInfo?: {
    current: number;
    total: number;
  };
  formatName?: string;
  phaseLabel?: string;
}

export const DebateTopic: React.FC<DebateTopicProps> = ({ topic, formatName, roundInfo, phaseLabel }) => {
  const { theme } = useTheme();
  const styles = createStyles(theme);

  return (
    <Box style={styles.container}>
      <View style={styles.textContainer}>
        <Typography 
          variant="subtitle" 
          weight="semibold" 
          style={styles.topicText}
          numberOfLines={2}
          ellipsizeMode="tail"
        >
          {topic}
        </Typography>
        {!!formatName && (
          <Typography 
            variant="caption" 
            color="secondary"
            style={styles.formatText}
          >
            Format: {formatName}
          </Typography>
        )}
        {(roundInfo || phaseLabel) && (
          <Typography 
            variant="caption" 
            color="secondary"
            style={styles.roundText}
          >
            {`Exchange ${roundInfo?.current ?? ''} of ${roundInfo?.total ?? ''}${phaseLabel ? `: ${phaseLabel}` : ''}`}
          </Typography>
        )}
      </View>
    </Box>
  );
};

const createStyles = (theme: Theme) => StyleSheet.create({
  container: {
    backgroundColor: theme.colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    position: 'relative',
    zIndex: 10,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  textContainer: {
    flex: 1,
  },
  topicText: {
    lineHeight: 20,
  },
  formatText: {
    marginTop: 2,
  },
  roundText: {
    marginTop: 2,
  },
  phaseText: {
    marginTop: 2,
  },
});
