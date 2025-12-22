/**
 * VotingInterface Organism Component
 * Professional voting interface with smooth animations and brand colors
 */

import React, { useEffect } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  withSpring,
  withTiming,
  useSharedValue,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Typography, AIProviderTile } from '../../molecules';
import { useTheme } from '../../../theme';
import { AI } from '../../../types';
import { ScoreBoard } from '../../../services/debate';

export interface VotingInterfaceProps {
  participants: AI[];
  isOverallVote: boolean;
  isFinalVote: boolean;
  votingRound: number;
  scores?: ScoreBoard | null;
  votingPrompt: string;
  onVote: (aiId: string) => void;
}


export const VotingInterface: React.FC<VotingInterfaceProps> = ({
  participants,
  isOverallVote,
  isFinalVote: _isFinalVote,
  votingRound: _votingRound,
  scores,
  votingPrompt,
  onVote,
}) => {
  const { theme, isDark } = useTheme();
  const containerScale = useSharedValue(0.95);
  const titleOpacity = useSharedValue(0);
  
  useEffect(() => {
    containerScale.value = withSpring(1, { damping: 15 });
    titleOpacity.value = withTiming(1, { duration: 500 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const renderCurrentScores = () => {
    if (!isOverallVote || !scores) return null;

    return (
      <View style={{
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.border,
        padding: 12,
        marginBottom: 12,
        borderRadius: 8,
        borderWidth: 1,
      }}>
        <Typography variant="caption" weight="semibold" color="brand">
          Current Scores:
        </Typography>
        <View style={{
          flexDirection: 'row',
          justifyContent: 'space-around',
          marginTop: 8,
        }}>
          {participants.map((ai) => {
            const aiScore = scores[ai.id];
            
            return (
              <View key={ai.id} style={{ alignItems: 'center' }}>
                <Typography 
                  variant="body" 
                  weight="semibold"
                  style={{ color: ai.color || theme.colors.primary[500] }}
                >
                  {ai.name}
                </Typography>
                <Typography variant="title" weight="bold">
                  {aiScore?.roundWins || 0}
                </Typography>
              </View>
            );
          })}
        </View>
        <Typography 
          variant="caption" 
          color="secondary" 
          align="center" 
          style={{ marginTop: 8 }}
        >
          Despite the scores, you can crown any AI as the overall winner!
        </Typography>
      </View>
    );
  };

  const animatedContainerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: containerScale.value }],
  }));
  
  const animatedTitleStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
  }));

  const dynamicContainerStyles = {
    ...styles.container,
    // Only apply shadows on iOS - Android elevation creates ugly gray outline artifacts
    ...(Platform.OS === 'ios' ? theme.shadows.lg : {}),
  };

  const dynamicVoteButtonStyles = {
    ...styles.voteButton,
    ...(Platform.OS === 'ios' ? theme.shadows.md : {}),
  };

  return (
    <Animated.View 
      entering={FadeInDown.duration(300)}
      style={dynamicContainerStyles}
    >
      <Animated.View style={animatedContainerStyle}>
        {Platform.OS === 'ios' ? (
          <BlurView
            intensity={isDark ? 80 : 40}
            style={styles.blurContainer}
          >
            <LinearGradient
              colors={isDark
                ? [theme.colors.overlays.soft, theme.colors.overlays.subtle]
                : [theme.colors.overlays.medium, theme.colors.overlays.subtle]
              }
              style={styles.gradientBackground}
            >
              <Animated.View style={animatedTitleStyle}>
                <Typography
                  variant="title"
                  weight="bold"
                  align="center"
                  style={styles.title}
                >
                  {votingPrompt}
                </Typography>
              </Animated.View>

              {renderCurrentScores()}

              <View style={styles.votingButtons}>
                {participants.map((ai) => {
                  return (
                    <AIProviderTile
                      key={ai.id}
                      ai={ai}
                      size="large"
                      tileStyle="gradient"
                      showName={false}
                      onPress={() => onVote(ai.id)}
                      style={dynamicVoteButtonStyles}
                    />
                  );
                })}
              </View>
            </LinearGradient>
          </BlurView>
        ) : (
          <LinearGradient
            colors={isDark
              ? [theme.colors.overlays.soft, theme.colors.overlays.subtle]
              : [theme.colors.overlays.medium, theme.colors.overlays.subtle]
            }
            style={[styles.gradientBackground, styles.blurContainer]}
          >
            <Animated.View style={animatedTitleStyle}>
              <Typography
                variant="title"
                weight="bold"
                align="center"
                style={styles.title}
              >
                {votingPrompt}
              </Typography>
            </Animated.View>

            {renderCurrentScores()}

            <View style={styles.votingButtons}>
              {participants.map((ai) => {
                return (
                  <AIProviderTile
                    key={ai.id}
                    ai={ai}
                    size="large"
                    tileStyle="gradient"
                    showName={false}
                    onPress={() => onVote(ai.id)}
                    style={dynamicVoteButtonStyles}
                  />
                );
              })}
            </View>
          </LinearGradient>
        )}
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
    marginHorizontal: 16,
    borderRadius: 20,
    overflow: 'hidden',
  },
  blurContainer: {
    borderRadius: 20,
  },
  gradientBackground: {
    padding: 20,
  },
  title: {
    marginBottom: 20,
    fontSize: 22,
  },
  currentScoresCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
  },
  scoresRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 12,
  },
  scoreItem: {
    alignItems: 'center',
  },
  overrideText: {
    marginTop: 12,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  votingButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: 12,
  },
  voteButton: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    minHeight: 50, // Further reduced for more compact design
  },
  buttonGradient: {
    paddingVertical: 4, // Further reduced padding
    paddingHorizontal: 4, // Further reduced padding
  },
  buttonContent: {
    alignItems: 'center',
    gap: 2, // Further reduced gap
    paddingVertical: 4, // Minimal padding
  },
  aiIcon: {
    marginBottom: 2,
  },
  aiLogo: {
    width: 80,  // Increased to 80x80 as requested
    height: 80, // Increased to 80x80 as requested
  },
  scoreBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    marginTop: 4,
  },
});