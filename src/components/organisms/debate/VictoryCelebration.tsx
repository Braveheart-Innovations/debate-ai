/**
 * VictoryCelebration Component
 * Professional victory celebration with animations and confetti
 */

import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Dimensions, ScrollView } from 'react-native';
import Animated, {
  FadeIn,
  ZoomIn,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withDelay,
  useSharedValue,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Typography } from '../../molecules';
import { GradientButton, Button } from '../../molecules';
import { useTheme } from '../../../theme';
import { AI_BRAND_COLORS } from '../../../constants/aiColors';
import { AI, Message } from '../../../types';
import { ScoreBoard } from '../../../services/debate';
import ShareModal from './ShareModal';
import { analytics } from '../../../services/analytics';
import { shareIncentives } from '../../../services/shareIncentives';

const { width } = Dimensions.get('window');

export interface RoundResult {
  round: number;
  winner: string;
  topic?: string;
}

export interface VictoryCelebrationProps {
  winner: AI;
  scores: ScoreBoard;
  rounds: RoundResult[];
  onViewTranscript: () => void;
  topic?: string;
  participants?: AI[];
  messages?: Message[];
}

export const VictoryCelebration: React.FC<VictoryCelebrationProps> = ({
  winner,
  scores,
  rounds,
  onViewTranscript,
  topic,
  participants,
  messages,
}) => {
  const { theme, isDark } = useTheme();
  const [showShareCard, setShowShareCard] = useState(false);
  const trophyScale = useSharedValue(0);
  const trophyRotation = useSharedValue(0);
  const contentOpacity = useSharedValue(0);
  
  useEffect(() => {
    // Animation sequence
    trophyScale.value = withSequence(
      withDelay(200, withSpring(1.2, { damping: 8 })),
      withSpring(1, { damping: 15 })
    );
    
    trophyRotation.value = withSequence(
      withDelay(200, withSpring(10)),
      withSpring(-10),
      withSpring(0)
    );
    
    contentOpacity.value = withDelay(500, withSpring(1));
  }, [trophyScale, trophyRotation, contentOpacity]);
  
  const trophyStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: trophyScale.value },
      { rotate: `${trophyRotation.value}deg` },
    ],
  }));
  
  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
  }));
  
  // Get winner colors - support both old and new AI ID formats
  const getWinnerColors = () => {
    const winnerKey = (winner.id === 'openai' || winner.id === 'chatgpt') ? 'openai' : 
                     winner.id === 'claude' ? 'claude' :
                     winner.id === 'gemini' ? 'gemini' :
                     winner.id === 'nomi' ? 'nomi' : null;
    
    return winnerKey ? AI_BRAND_COLORS[winnerKey as keyof typeof AI_BRAND_COLORS] : theme.colors.primary;
  };
  
  const winnerColors = getWinnerColors();
  
  const dynamicCardStyles = {
    ...styles.card,
    backgroundColor: theme.colors.surface,
    ...theme.shadows.lg,
  };
  
  return (
    <View style={StyleSheet.absoluteFillObject}>
      <BlurView intensity={90} style={styles.backdrop}>
        <LinearGradient
          colors={isDark 
            ? [theme.colors.overlays.backdrop, theme.colors.overlays.backdropDark]
            : [theme.colors.overlays.backdrop, theme.colors.overlays.backdropDark]
          }
          style={styles.gradientBackdrop}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              flexGrow: 1,
              justifyContent: 'center',
              alignItems: 'center',
              paddingBottom: 40,
              paddingHorizontal: 20,
            }}
          >
            <Animated.View entering={ZoomIn.springify()} style={dynamicCardStyles}>
              <Animated.View style={[styles.trophyContainer, trophyStyle]}>
                <Typography variant="title" style={styles.trophy}>
                  🏆
                </Typography>
                <View style={[
                  styles.glowEffect, 
                  { backgroundColor: `${winnerColors[400]}40` }
                ]} />
              </Animated.View>
              
              <Animated.View style={contentStyle}>
                <Typography 
                  variant="caption" 
                  weight="semibold" 
                  align="center" 
                  color="secondary"
                  style={styles.championLabel}
                >
                  DEBATE CHAMPION
                </Typography>
                
                <LinearGradient
                  colors={[winnerColors[400], winnerColors[600]]}
                  style={styles.winnerNameContainer}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <Typography 
                    variant="title" 
                    weight="bold" 
                    align="center" 
                    style={{
                      ...styles.winnerName,
                      color: theme.colors.text.white,
                    }}
                  >
                    {winner.name}
                  </Typography>
                </LinearGradient>
                
                <View style={styles.scoreContainer}>
                  <Typography 
                    variant="body" 
                    weight="semibold" 
                    align="center" 
                    color="secondary"
                    style={styles.finalScoreLabel}
                  >
                    Final Scores
                  </Typography>
                  
                  <View style={styles.scoresWrapper}>
                    {Object.entries(scores).map(([aiId, score]) => {
                      const aiColors = aiId === winner.id ? winnerColors : theme.colors.gray;
                      const isWinner = aiId === winner.id;
                      
                      return (
                        <View key={aiId} style={[
                          styles.scoreItem,
                          { backgroundColor: theme.colors.overlays.soft },
                          isWinner && styles.winnerScoreItem,
                          isWinner && { 
                            backgroundColor: theme.colors.semantic.winner,
                            borderColor: theme.colors.semantic.winnerBorder,
                          }
                        ]}>
                          <View style={styles.scoreItemHeader}>
                            <Typography 
                              variant="body" 
                              weight={isWinner ? "bold" : "semibold"}
                              align="center"
                              style={{ color: isWinner ? winnerColors[600] : theme.colors.text.primary, marginBottom: 4 }}
                            >
                              {score.name}
                              {isWinner && " 👑"}
                            </Typography>
                            <Typography 
                              variant="subtitle" 
                              weight="bold"
                              align="center"
                              style={{ color: isWinner ? winnerColors[600] : theme.colors.text.primary }}
                            >
                              {score.roundWins} {score.roundWins === 1 ? 'round' : 'rounds'}
                            </Typography>
                          </View>
                          
                          <View style={[styles.scoreBar, { backgroundColor: theme.colors.overlays.strong }]}>
                            <Animated.View
                              entering={FadeIn.delay(800).duration(600)}
                              style={[
                                styles.scoreBarFill,
                                {
                                  width: `${Math.max((score.roundWins / Math.max(rounds.length, 1)) * 100, 5)}%`,
                                  backgroundColor: aiColors[500] || theme.colors.primary[500],
                                },
                              ]}
                            />
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
                
                <View style={styles.actions}>
                  <GradientButton
                    title="📸 Share Results"
                    onPress={() => setShowShareCard(true)}
                    gradient={[winnerColors[400], winnerColors[600]]}
                    fullWidth
                    style={styles.primaryAction}
                  />
                  
                  <Button
                    title="📄 View Transcript"
                    onPress={onViewTranscript}
                    variant="ghost"
                    size="medium"
                    fullWidth
                  />
                </View>
              </Animated.View>
            </Animated.View>
          </ScrollView>
          
          {/* Confetti effect */}
          <ConfettiEffect colors={[winnerColors[400], winnerColors[600], winnerColors[500]]} />
        </LinearGradient>
      </BlurView>
      
      {/* Share Modal */}
      <ShareModal
        visible={showShareCard}
        topic={topic || 'AI Debate'}
        participants={participants || [winner]}
        messages={messages || []}
        winner={winner}
        scores={scores}
        onShare={async (platform?: string) => {
          analytics.trackShare(
            platform || 'unknown',
            'debate_image_card',
            true,
            {
              topic: topic || 'AI Debate',
              winner: winner.name,
              participant_count: participants?.length || 0,
            }
          );
          
          // Record share and check for rewards
          await shareIncentives.recordShare();
          
          setShowShareCard(false);
        }}
        onClose={() => setShowShareCard(false)}
      />
    </View>
  );
};

// Simple confetti effect component
const Particle: React.FC<{ color: string; delay: number }> = ({ color, delay }) => {
  const translateY = useSharedValue(0);
  const translateX = useSharedValue(0);
  const rotation = useSharedValue(0);
  const opacity = useSharedValue(1);
  
  React.useEffect(() => {
    translateY.value = withDelay(
      delay,
      withSpring(-800, { duration: 3000 })
    );
    translateX.value = withSequence(
      withSpring(Math.random() * 100 - 50, { duration: 1000 }),
      withSpring(Math.random() * 100 - 50, { duration: 1000 }),
      withSpring(Math.random() * 100 - 50, { duration: 1000 })
    );
    rotation.value = withSpring(360 * 3, { duration: 3000 });
    opacity.value = withDelay(2500, withSpring(0, { duration: 500 }));
  }, [translateY, translateX, rotation, opacity, delay]);
  
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { translateX: translateX.value },
      { rotate: `${rotation.value}deg` },
    ],
    opacity: opacity.value,
  }));
  
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          top: 100,
          left: width / 2,
          width: 10,
          height: 10,
          backgroundColor: color,
          borderRadius: 2,
        },
        style,
      ]}
    />
  );
};

const ConfettiEffect: React.FC<{ colors: string[] }> = ({ colors }) => {
  const particles = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    color: colors[i % colors.length],
    delay: i * 50,
  }));
  
  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {particles.map((particle) => (
        <Particle key={particle.id} color={particle.color} delay={particle.delay} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gradientBackdrop: {
    flex: 1,
  },
  card: {
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    width: '100%',
    maxWidth: 400, // Fixed max width for larger screens
  },
  trophyContainer: {
    position: 'relative',
    alignItems: 'center',
    marginBottom: 24,
  },
  trophy: {
    fontSize: 80,
    lineHeight: 90,
  },
  glowEffect: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    opacity: 0.3,
    top: -10,
  },
  championLabel: {
    fontSize: 12,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  winnerNameContainer: {
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  winnerName: {
    fontSize: 24,
  },
  scoreContainer: {
    width: '100%',
    marginBottom: 32,
    alignItems: 'center',
  },
  finalScoreLabel: {
    marginBottom: 16,
  },
  scoresWrapper: {
    width: '100%',
    maxWidth: 280,
    alignItems: 'stretch',
  },
  scoreItem: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 12,
    minWidth: 240,
  },
  winnerScoreItem: {
    borderWidth: 1,
  },
  scoreItemHeader: {
    flexDirection: 'column',
    alignItems: 'center',
    marginBottom: 8,
  },
  scoreBar: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  scoreBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  actions: {
    width: '100%',
    gap: 16,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  primaryAction: {
    marginBottom: 8,
  },
});