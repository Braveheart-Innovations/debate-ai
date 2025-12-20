import React from 'react';
import { ScrollView, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Header,
  StatsLeaderboard,
  RecentDebatesSection,
  StatsEmptyState,
  WinRateDonutSection,
  PerformanceBarSection,
  TrendLineSection,
} from '../components/organisms';
import { useDebateStats } from '../hooks/stats';
import { useTheme } from '../theme';

interface StatsScreenProps {
  navigation: {
    goBack: () => void;
  };
}

const StatsScreen: React.FC<StatsScreenProps> = ({ navigation }) => {
  const { theme } = useTheme();
  const { history, stats } = useDebateStats();

  // Check if we have any AIs with actual debate data
  const hasActiveStats = Object.values(stats).some(ai =>
    ai.totalDebates > 0 || ai.roundsWon > 0 || ai.roundsLost > 0
  );

  const handleStartDebate = () => {
    // Navigate to debate setup - adjust navigation path as needed
    navigation.goBack(); // For now, just go back to navigate to debate
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top', 'left', 'right']}>
      {/* Header with back button */}
      <Header
        variant="gradient"
        title="AI Performance Stats"
        showBackButton={true}
        onBack={() => navigation.goBack()}
      />

      {/* Content */}
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {!hasActiveStats && history.length === 0 ? (
          <StatsEmptyState
            title="No debates yet!"
            subtitle="Complete some debates to see AI performance statistics"
            emoji="📊"
            showCTA={true}
            ctaText="Start Your First Debate"
            onCTAPress={handleStartDebate}
            showHelp={true}
            helpText="Debates help you compare different AI personalities and see which ones perform best on various topics."
          />
        ) : (
          <>
            {/* Win Rate Donut Charts */}
            <WinRateDonutSection animated={true} />

            {/* Performance Comparison Bar Chart */}
            <PerformanceBarSection animated={true} maxBars={6} />

            {/* Trend Line Charts */}
            <TrendLineSection animated={true} />

            {/* Leaderboard */}
            {hasActiveStats && (
              <StatsLeaderboard
                sortBy="winRate"
                enableAnimations={true}
              />
            )}

            {/* Recent Debates */}
            {history.length > 0 && (
              <View style={styles.recentDebatesContainer}>
                <RecentDebatesSection
                  maxDebates={5}
                  showElapsedTime={false}
                  enableAnimations={true}
                  showCount={false}
                />
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  recentDebatesContainer: {
    marginTop: 24,
  },
});

export default StatsScreen;
