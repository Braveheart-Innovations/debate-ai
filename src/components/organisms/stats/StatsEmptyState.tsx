import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Typography, GradientButton } from '@/components/molecules';
import { Box } from '@/components/atoms';
import { useTheme } from '@/theme';

export interface StatsEmptyStateProps {
  title?: string;
  subtitle?: string;
  emoji?: string;
  showCTA?: boolean;
  ctaText?: string;
  onCTAPress?: () => void;
  showHelp?: boolean;
  helpText?: string;
}

export const StatsEmptyState: React.FC<StatsEmptyStateProps> = ({
  title = 'No debates yet!',
  subtitle = 'Complete some debates to see AI performance statistics',
  emoji = '📊',
  showCTA = true,
  ctaText = 'Start Your First Debate',
  onCTAPress,
  showHelp = true,
  helpText = 'Debates help you compare different AI personalities and see which ones perform best on various topics.',
}) => {
  const { theme } = useTheme();

  return (
    <Box style={styles.container}>
      <View style={styles.content}>
        <View style={[styles.iconContainer, { backgroundColor: theme.colors.surface }]}>
          <Typography variant="heading" style={styles.emoji}>
            {emoji}
          </Typography>
        </View>
        <Typography variant="title" weight="bold" align="center" style={styles.title}>
          {title}
        </Typography>
        <Typography variant="body" color="secondary" align="center" style={styles.subtitle}>
          {subtitle}
        </Typography>
        {showCTA && (
          <GradientButton title={ctaText} onPress={onCTAPress} gradient={theme.colors.gradients.primary} size="medium" style={styles.ctaButton} />
        )}
        {showHelp && (
          <Typography variant="caption" color="secondary" align="center" style={styles.helpText}>
            {helpText}
          </Typography>
        )}
      </View>
    </Box>
  );
};

export interface StatsLoadingStateProps { message?: string; showAnimation?: boolean }

export const StatsLoadingState: React.FC<StatsLoadingStateProps> = ({ message = 'Loading statistics...', showAnimation = true }) => {
  const { theme } = useTheme();
  return (
    <Box style={styles.container}>
      <View style={styles.content}>
        <View style={[styles.iconContainer, { backgroundColor: theme.colors.surface }]}>
          <Typography variant="heading" style={styles.emoji}>📈</Typography>
        </View>
        <Typography variant="body" color="secondary" align="center">{message}</Typography>
        {showAnimation && (
          <View style={styles.loadingDots}>
            <View style={[styles.dot, { backgroundColor: theme.colors.primary[400] }]} />
            <View style={[styles.dot, { backgroundColor: theme.colors.primary[500] }]} />
            <View style={[styles.dot, { backgroundColor: theme.colors.primary[600] }]} />
          </View>
        )}
      </View>
    </Box>
  );
};

export interface StatsErrorStateProps { title?: string; message?: string; showRetry?: boolean; retryText?: string; onRetry?: () => void }

export const StatsErrorState: React.FC<StatsErrorStateProps> = ({
  title = 'Unable to load statistics',
  message = 'There was a problem loading your debate statistics. Please try again.',
  showRetry = true,
  retryText = 'Try Again',
  onRetry,
}) => {
  const { theme } = useTheme();
  return (
    <Box style={styles.container}>
      <View style={styles.content}>
        <View style={[styles.iconContainer, { backgroundColor: theme.colors.error[50] }]}>
          <Typography variant="heading" style={{ color: theme.colors.error[500] }}>⚠️</Typography>
        </View>
        <Typography variant="title" weight="bold" align="center" style={styles.title}>{title}</Typography>
        <Typography variant="body" color="secondary" align="center" style={styles.subtitle}>{message}</Typography>
        {showRetry && onRetry && (
          <TouchableOpacity onPress={onRetry} style={[styles.retryButton, { backgroundColor: theme.colors.primary[500] }]}>
            <Typography variant="body" weight="semibold" style={{ color: 'white' }}>{retryText}</Typography>
          </TouchableOpacity>
        )}
      </View>
    </Box>
  );
};

export interface WelcomeToStatsProps { isFirstVisit?: boolean; showTips?: boolean; onStartDebate?: () => void }

export const WelcomeToStats: React.FC<WelcomeToStatsProps> = ({ showTips = true, onStartDebate }) => {
  const { theme } = useTheme();
  const tips = [
    '📊 Track AI performance across different debate topics',
    '🏆 See which AIs have the highest win rates',
    '📈 Monitor round-by-round statistics and trends',
    "🎯 Discover each AI's strongest topics",
    '📜 Review your complete debate history',
  ];
  return (
    <Box style={styles.container}>
      <View style={styles.content}>
        <View style={[styles.iconContainer, { backgroundColor: theme.colors.primary[50] }]}>
          <Typography variant="heading" style={{ color: theme.colors.primary[500] }}>🎭</Typography>
        </View>
        <Typography variant="title" weight="bold" align="center" style={styles.title}>Welcome to AI Performance Stats!</Typography>
        <Typography variant="body" color="secondary" align="center" style={styles.subtitle}>
          Start debating to see detailed analytics about AI performance, win rates, and topic expertise.
        </Typography>
        {showTips && (
          <View style={styles.tipsContainer}>
            <Typography variant="body" weight="semibold" style={styles.tipsTitle}>What you'll see here:</Typography>
            {tips.map((tip, index) => (
              <View key={index} style={styles.tipItem}>
                <Typography variant="body" color="secondary">{tip}</Typography>
              </View>
            ))}
          </View>
        )}
        <GradientButton title="Start Your First Debate" onPress={onStartDebate} gradient={theme.colors.gradients.primary} size="medium" style={styles.ctaButton} />
      </View>
    </Box>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 48 },
  content: { alignItems: 'center', maxWidth: 320 },
  iconContainer: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  emoji: { fontSize: 32 },
  title: { marginBottom: 12 },
  subtitle: { marginBottom: 24, lineHeight: 22 },
  ctaButton: { marginTop: 8, minWidth: 200 },
  helpText: { marginTop: 16, lineHeight: 18 },
  loadingDots: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 16, gap: 4 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  retryButton: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8, marginTop: 16 },
  tipsContainer: { alignSelf: 'stretch', marginBottom: 24 },
  tipsTitle: { marginBottom: 12, textAlign: 'center' },
  tipItem: { marginBottom: 8 },
});

