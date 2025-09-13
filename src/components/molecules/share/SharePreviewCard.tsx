/**
 * SharePreviewCard Component
 * COMPLETE REWRITE - Clean slate, simple and functional
 */

import React from 'react';
import { View, StyleSheet, Dimensions, Image, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AIProviderTile } from '../debate/AIProviderTile';
import { AppLogo } from '@/components/organisms/common/AppLogo';
import { AI } from '@/types';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width - 40;
const CARD_HEIGHT = CARD_WIDTH * 1.4; // Taller for more space

export interface SharePreviewCardProps {
  topic: string;
  participants: AI[];
  winner?: AI;
  scores?: Record<string, { name: string; roundWins: number }>;
}

export const SharePreviewCard: React.FC<SharePreviewCardProps> = ({
  topic,
  participants,
  winner,
  scores,
}) => {
  // Get the two participants
  const [ai1, ai2] = participants;
  const score1 = scores?.[ai1?.id]?.roundWins || 0;
  const score2 = scores?.[ai2?.id]?.roundWins || 0;

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#667eea', '#764ba2', '#f093fb', '#f5576c']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.logoRow}>
            <AppLogo size={40} />
            <View style={styles.brandingText}>
              <Text style={styles.appName}>Symposium AI</Text>
              <Text style={styles.tagline}>Where Understanding Emerges</Text>
            </View>
          </View>
        </View>

        {/* Motion */}
        <View style={styles.topicContainer}>
          <Text style={styles.topicLabel}>DEBATE MOTION</Text>
          <Text style={styles.topicText} numberOfLines={2}>
            "{topic}"
          </Text>
        </View>

        {/* Battle Section */}
        <View style={styles.battleContainer}>
          {/* AI 1 */}
          <View style={styles.aiContainer}>
            <AIProviderTile
              ai={ai1}
              size="large"
              tileStyle="flat"
              showName={false}
              customWidth={100}
              customHeight={100}
              style={{ borderRadius: 16 }}
            />
            <Text style={styles.aiName}>{ai1?.name}</Text>
            <Text style={styles.score}>{score1}</Text>
            <Text style={styles.scoreLabel}>rounds</Text>
          </View>

          {/* VS */}
          <Text style={styles.vs}>VS</Text>

          {/* AI 2 */}
          <View style={styles.aiContainer}>
            <AIProviderTile
              ai={ai2}
              size="large"
              tileStyle="flat"
              showName={false}
              customWidth={100}
              customHeight={100}
              style={{ borderRadius: 16 }}
            />
            <Text style={styles.aiName}>{ai2?.name}</Text>
            <Text style={styles.score}>{score2}</Text>
            <Text style={styles.scoreLabel}>rounds</Text>
          </View>
        </View>

        {/* Winner */}
        {winner && (
          <View style={styles.winnerContainer}>
            <View style={styles.winnerBadge}>
              <Text style={styles.winnerEmoji}>🏆</Text>
              <Text style={styles.winnerText}>{winner.name} WINS!</Text>
            </View>
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          {/* App Store Badges - Spread to corners */}
          <View style={styles.storeBadges}>
            <View style={styles.badge}>
              <Ionicons name="logo-apple" size={20} color="#FFF" />
              <View>
                <Text style={styles.badgeTopText}>Download on the</Text>
                <Text style={styles.badgeMainText}>App Store</Text>
              </View>
            </View>
            <View style={styles.badge}>
              <Ionicons name="logo-google-playstore" size={20} color="#FFF" />
              <View>
                <Text style={styles.badgeTopText}>GET IT ON</Text>
                <Text style={styles.badgeMainText}>Google Play</Text>
              </View>
            </View>
          </View>
          
          {/* Braveheart - At the very bottom */}
          <View style={styles.braveheartContainer}>
            <Image
              // eslint-disable-next-line @typescript-eslint/no-require-imports
              source={require('../../../../assets/BraveheartInnovationsLogoNoText.png') as number}
              style={styles.braveheartLogo}
              resizeMode="contain"
            />
            <Text style={styles.braveheartText}>Braveheart Innovations</Text>
          </View>
        </View>
      </LinearGradient>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    alignItems: 'center',
  },
  card: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
    padding: 20,
    paddingBottom: 8,  // Much less bottom padding to push Braveheart down
    justifyContent: 'space-between',
  },
  
  // Header
  header: {
    alignItems: 'center',
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  brandingText: {
    alignItems: 'flex-start',
  },
  appName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  tagline: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
    fontStyle: 'italic',
  },
  
  // Topic
  topicContainer: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  topicLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
    letterSpacing: 1,
    marginBottom: 6,
  },
  topicText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  
  // Battle
  battleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 10,
  },
  aiContainer: {
    alignItems: 'center',
    flex: 1,
  },
  aiName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    marginTop: 8,
  },
  score: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: 4,
  },
  scoreLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.8)',
  },
  vs: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginHorizontal: 10,
  },
  
  // Winner
  winnerContainer: {
    alignItems: 'center',
  },
  winnerBadge: {
    flexDirection: 'row',
    backgroundColor: '#FFD700',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 25,
    alignItems: 'center',
    gap: 8,
  },
  winnerEmoji: {
    fontSize: 20,
  },
  winnerText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000',
  },
  
  // Footer
  footer: {
    flexDirection: 'column',
    gap: 8,
    alignItems: 'stretch',
  },
  storeBadges: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 0,
    marginTop: 8,
  },
  badge: {
    flexDirection: 'row',
    backgroundColor: '#000000',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  badgeTopText: {
    fontSize: 8,
    color: 'rgba(255,255,255,0.9)',
    letterSpacing: 0.3,
  },
  badgeMainText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  braveheartContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    marginTop: 'auto',  // Push to absolute bottom
    marginBottom: 0,
  },
  braveheartLogo: {
    width: 16,
    height: 16,
  },
  braveheartText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.95)',
    fontWeight: '600',
  },
});

export default SharePreviewCard;
