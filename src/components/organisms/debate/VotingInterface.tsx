/**
 * VotingInterface Organism Component
 * Professional voting interface with smooth animations and brand colors
 */

import React, { useEffect } from 'react';
import { View, StyleSheet, Platform, TouchableOpacity } from 'react-native';
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
import type { AudienceStance, AudienceVoteStage } from '../../../config/debate/formats';

export interface VotingInterfaceProps {
  participants: AI[];
  isOverallVote: boolean;
  isFinalVote: boolean;
  votingRound: number;
  voteKind?: 'checkpoint' | 'audience_stance';
  audienceVoteStage?: AudienceVoteStage;
  scores?: ScoreBoard | null;
  votingPrompt: string;
  voteCriterion?: string;
  onVote: (aiId: string) => void;
}


export const VotingInterface: React.FC<VotingInterfaceProps> = ({
  participants,
  isOverallVote,
  isFinalVote: _isFinalVote,
  votingRound: _votingRound,
  voteKind = 'checkpoint',
  audienceVoteStage,
  scores,
  votingPrompt,
  voteCriterion,
  onVote,
}) => {
  const { theme, isDark } = useTheme();
  const containerScale = useSharedValue(0.95);
  const titleOpacity = useSharedValue(0);
  
  useEffect(() => {
    containerScale.value = withSpring(1, { damping: 15 });
    titleOpacity.value = withTiming(1, { duration: 500 });
  }, [containerScale, titleOpacity]); // shared values are stable; runs once on mount


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

  const renderVoteCriterion = () => {
    if (!voteCriterion) return null;

    return (
      <Typography
        variant="caption"
        color="secondary"
        align="center"
        style={styles.voteCriterion}
      >
        {voteCriterion}
      </Typography>
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

  const audienceOptions: Array<{
    id: AudienceStance;
    label: string;
    description: string;
  }> = audienceVoteStage === 'initial'
    ? [
      { id: 'for', label: 'For', description: 'I support the motion.' },
      { id: 'against', label: 'Against', description: 'I oppose the motion.' },
      { id: 'undecided', label: 'Undecided', description: 'I want to hear the arguments first.' },
    ]
    : [
      { id: 'for', label: 'For', description: 'The proposition persuaded me.' },
      { id: 'against', label: 'Against', description: 'The opposition persuaded me.' },
    ];

  const renderAudienceVoteButtons = () => (
    <View style={styles.audienceButtons}>
      {audienceOptions.map((option) => (
        <TouchableOpacity
          key={option.id}
          onPress={() => onVote(option.id)}
          activeOpacity={0.82}
          accessibilityRole="button"
          accessibilityLabel={option.label}
          style={[
            styles.audienceButton,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Typography variant="body" weight="bold" align="center">
            {option.label}
          </Typography>
          <Typography
            variant="caption"
            color="secondary"
            align="center"
            style={styles.audienceButtonDescription}
          >
            {option.description}
          </Typography>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderParticipantVoteButtons = () => (
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
  );

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
                  style={[styles.title, !voteCriterion && styles.titleWithoutCriterion]}
                >
                  {votingPrompt}
                </Typography>
                {renderVoteCriterion()}
              </Animated.View>

              {renderCurrentScores()}

              {voteKind === 'audience_stance' ? renderAudienceVoteButtons() : renderParticipantVoteButtons()}
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
                style={[styles.title, !voteCriterion && styles.titleWithoutCriterion]}
              >
                {votingPrompt}
              </Typography>
              {renderVoteCriterion()}
            </Animated.View>

            {renderCurrentScores()}

            {voteKind === 'audience_stance' ? renderAudienceVoteButtons() : renderParticipantVoteButtons()}
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
    marginBottom: 8,
    fontSize: 22,
  },
  titleWithoutCriterion: {
    marginBottom: 20,
  },
  voteCriterion: {
    marginBottom: 20,
    paddingHorizontal: 4,
    lineHeight: 18,
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
  audienceButtons: {
    gap: 10,
  },
  audienceButton: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  audienceButtonDescription: {
    marginTop: 4,
    lineHeight: 17,
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
