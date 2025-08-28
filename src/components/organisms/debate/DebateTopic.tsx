import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Typography } from '../../molecules/Typography';
import { Box } from '../../atoms/Box';
import { useTheme, Theme } from '../../../theme';
import Ionicons from '@expo/vector-icons/Ionicons';

interface DebateTopicProps {
  topic: string;
  roundInfo?: {
    current: number;
    total: number;
  };
}

export const DebateTopic: React.FC<DebateTopicProps> = ({ topic, roundInfo }) => {
  const { theme } = useTheme();
  const styles = createStyles(theme);

  return (
    <Box style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Ionicons 
            name="chatbubbles" 
            size={20} 
            color={theme.colors.primary[500]} 
          />
        </View>
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
          {roundInfo && (
            <Typography 
              variant="caption" 
              color="secondary"
              style={styles.roundText}
            >
              Round {roundInfo.current} of {roundInfo.total}
            </Typography>
          )}
        </View>
      </View>
    </Box>
  );
};

const createStyles = (theme: Theme) => StyleSheet.create({
  container: {
    backgroundColor: theme.colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    marginRight: theme.spacing.md,
    padding: theme.spacing.xs,
    backgroundColor: theme.colors.primary[100],
    borderRadius: theme.borderRadius.lg,
  },
  textContainer: {
    flex: 1,
  },
  topicText: {
    lineHeight: 20,
  },
  roundText: {
    marginTop: 2,
  },
});