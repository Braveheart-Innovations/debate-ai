import React from 'react';
import { ScrollView, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ResponsiveContainer } from '../components/atoms';
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
import { useResponsive } from '../hooks/useResponsive';

interface StatsScreenProps {
  navigation: {
    goBack: () => void;
  };
}

const StatsScreen: React.FC<StatsScreenProps> = ({ navigation }) => {
  const { theme } = useTheme();
  const { isTablet, rs } = useResponsive();
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
        contentContainerStyle={[styles.content, { padding: rs('md') }]}
        showsVerticalScrollIndicator={false}
      >
        <ResponsiveContainer maxWidth="xl" center>
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
              {/* iPad: 2-column grid for charts */}
              {isTablet ? (
                <View style={styles.tabletGrid}>
                  <View style={styles.tabletGridItem}>
                    <WinRateDonutSection animated={true} />
                  </View>
                  <View style={styles.tabletGridItem}>
                    <PerformanceBarSection animated={true} maxBars={6} />
                  </View>
                  <View style={styles.tabletGridItem}>
                    <TrendLineSection animated={true} />
                  </View>
                  <View style={styles.tabletGridItem}>
                    {hasActiveStats && (
                      <StatsLeaderboard
                        sortBy="winRate"
                        enableAnimations={true}
                      />
                    )}
                  </View>
                </View>
              ) : (
                <>
                  {/* Phone: Single column */}
                  <WinRateDonutSection animated={true} />
                  <PerformanceBarSection animated={true} maxBars={6} />
                  <TrendLineSection animated={true} />
                  {hasActiveStats && (
                    <StatsLeaderboard
                      sortBy="winRate"
                      enableAnimations={true}
                    />
                  )}
                </>
              )}

              {/* Recent Debates - full width */}
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
        </ResponsiveContainer>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingBottom: 32,
  },
  tabletGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -8,
  },
  tabletGridItem: {
    width: '50%',
    paddingHorizontal: 8,
    marginBottom: 16,
  },
  recentDebatesContainer: {
    marginTop: 24,
  },
});

export default StatsScreen;
