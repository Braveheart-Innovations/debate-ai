/**
 * ShareActionButtons Component
 * REBUILT - Ensured all social media buttons are visible and accessible
 * Comprehensive viral-worthy share options grid following atomic design principles
 */

import React from 'react';
import { StyleSheet, Linking, Alert, TouchableOpacity } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Box } from '@/components/atoms';
import { Typography } from '../common/Typography';
import { useTheme } from '@/theme';

export interface ShareActionButtonsProps {
  onShareImage: () => void;
  onShareTwitter?: () => void;
  onShareInstagram?: () => void;
  onShareFacebook?: () => void;
  onShareWhatsApp?: () => void;
  onCopyLink: () => void;
  onMoreOptions?: () => void;
  isGenerating: boolean;
  topic?: string;
  winner?: string;
  participants?: string[];
}

export const ShareActionButtons: React.FC<ShareActionButtonsProps> = ({
  onShareImage,
  onShareTwitter,
  onShareInstagram,
  onShareFacebook,
  onShareWhatsApp,
  onCopyLink,
  onMoreOptions,
  isGenerating,
  topic = 'AI Debate',
  winner,
  participants = [],
}) => {
  const { theme } = useTheme();

  const handleInstagramShare = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const url = 'instagram-stories://share';
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
        onShareInstagram?.();
      } else {
        Alert.alert(
          'Instagram not found',
          'Please install Instagram to share stories.',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Instagram share error:', error);
      Alert.alert('Error', 'Could not open Instagram');
    }
  };

  const handleFacebookShare = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const text = encodeURIComponent(
      `🤖 ${participants.join(' vs ')} debated "${topic}"\n` +
      `🏆 ${winner} wins!\n\n` +
      `Create your own AI debate at SymposiumAI.app`
    );
    
    try {
      const fbUrl = `fb://facewebmodal/f?href=https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent('https://debateai.app')}&quote=${text}`;
      const webUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent('https://debateai.app')}&quote=${text}`;
      
      const canOpen = await Linking.canOpenURL(fbUrl);
      if (canOpen) {
        await Linking.openURL(fbUrl);
      } else {
        await Linking.openURL(webUrl);
      }
      onShareFacebook?.();
    } catch (error) {
      console.error('Facebook share error:', error);
    }
  };

  const handleWhatsAppShare = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const text = encodeURIComponent(
      `🤖 ${participants.join(' vs ')} just debated "${topic}"\n\n` +
      `🏆 ${winner} won the debate!\n\n` +
      `Want to create your own AI debate? Check out SymposiumAI.app 🚀`
    );
    
    try {
      const whatsappUrl = `whatsapp://send?text=${text}`;
      const canOpen = await Linking.canOpenURL(whatsappUrl);
      if (canOpen) {
        await Linking.openURL(whatsappUrl);
        onShareWhatsApp?.();
      } else {
        Alert.alert(
          'WhatsApp not found',
          'Please install WhatsApp to share.',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('WhatsApp share error:', error);
    }
  };

  const handleTwitterShare = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const text = encodeURIComponent(
      `🤖 ${participants.join(' vs ')} debate: "${topic}"\n\n` +
      `🏆 ${winner} wins!\n\n` +
      `Create your own AI debate at SymposiumAI.app\n\n` +
      `#AIDebate #${participants.join(' #')} #ArtificialIntelligence`
    );
    
    try {
      const twitterUrl = `twitter://post?text=${text}`;
      const webUrl = `https://twitter.com/intent/tweet?text=${text}`;
      
      const canOpen = await Linking.canOpenURL(twitterUrl);
      if (canOpen) {
        await Linking.openURL(twitterUrl);
      } else {
        await Linking.openURL(webUrl);
      }
      onShareTwitter?.();
    } catch (error) {
      console.error('Twitter share error:', error);
    }
  };

  const handleCopyLink = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const shareText = `🤖 ${participants.join(' vs ')} debated "${topic}" and ${winner} won! Create your own AI debate at SymposiumAI.app`;
    await Clipboard.setStringAsync(shareText);
    Alert.alert('Copied!', 'Debate details copied to clipboard');
    onCopyLink();
  };

  return (
    <Box style={styles.actionsContainer}>
      {/* Social Platform Grid - Main sharing options */}
      <Box style={styles.socialGrid}>
        <Box style={styles.platformsRow}>
          {/* Copy Link */}
          <Box style={styles.platformContainer}>
            <TouchableOpacity
              onPress={handleCopyLink}
              style={[styles.platformButton, { backgroundColor: '#6B7280' }]}
            >
              <MaterialCommunityIcons
                name="content-copy"
                size={24}
                color="white"
              />
            </TouchableOpacity>
            <Typography variant="caption" style={styles.platformLabel}>
              Copy
            </Typography>
          </Box>
          
          {/* Instagram Stories */}
          <Box style={styles.platformContainer}>
            <TouchableOpacity
              onPress={handleInstagramShare}
              style={[styles.platformButton, { backgroundColor: '#E4405F' }]}
            >
              <MaterialCommunityIcons
                name="instagram"
                size={24}
                color="white"
              />
            </TouchableOpacity>
            <Typography variant="caption" style={styles.platformLabel}>
              Instagram
            </Typography>
          </Box>
          
          {/* Facebook */}
          <Box style={styles.platformContainer}>
            <TouchableOpacity
              onPress={handleFacebookShare}
              style={[styles.platformButton, { backgroundColor: '#1877F2' }]}
            >
              <MaterialCommunityIcons
                name="facebook"
                size={24}
                color="white"
              />
            </TouchableOpacity>
            <Typography variant="caption" style={styles.platformLabel}>
              Facebook
            </Typography>
          </Box>
          
          {/* X (formerly Twitter) */}
          <Box style={styles.platformContainer}>
            <TouchableOpacity
              onPress={handleTwitterShare}
              style={[styles.platformButton, { backgroundColor: '#000000' }]}
            >
              <Typography 
                variant="title" 
                style={{ color: 'white', fontSize: 20, fontWeight: 'bold' }}
              >
                X
              </Typography>
            </TouchableOpacity>
            <Typography variant="caption" style={styles.platformLabel}>
              X
            </Typography>
          </Box>
          
          {/* WhatsApp */}
          <Box style={styles.platformContainer}>
            <TouchableOpacity
              onPress={handleWhatsAppShare}
              style={[styles.platformButton, { backgroundColor: '#25D366' }]}
            >
              <MaterialCommunityIcons
                name="whatsapp"
                size={24}
                color="white"
              />
            </TouchableOpacity>
            <Typography variant="caption" style={styles.platformLabel}>
              WhatsApp
            </Typography>
          </Box>
          
          {/* Native Share - More Options */}
          <Box style={styles.platformContainer}>
            <TouchableOpacity
              onPress={onMoreOptions || onShareImage}
              style={[styles.platformButton, { backgroundColor: theme.colors.primary[500] }]}
            >
              <MaterialCommunityIcons
                name="share-variant"
                size={24}
                color="white"
              />
            </TouchableOpacity>
            <Typography variant="caption" style={styles.platformLabel}>
              {isGenerating ? 'Loading...' : 'Share'}
            </Typography>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

const styles = StyleSheet.create({
  actionsContainer: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginTop: 10,  // Push buttons down
  },
  socialGrid: {
    paddingVertical: 4,
  },
  platformsRow: {
    flexDirection: 'row',
    justifyContent: 'center',  // Center the buttons
    alignItems: 'center',
    gap: 10,  // Tighter gap between buttons
    paddingHorizontal: 8,
    paddingVertical: 8,
    minHeight: 60,
  },
  platformContainer: {
    alignItems: 'center',
    gap: 6,
    minWidth: 50,
  },
  platformButton: {
    width: 48,  // Smaller buttons
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  platformLabel: {
    fontSize: 10,  // Smaller labels
    fontWeight: '500',
    textAlign: 'center',
  },
});

export default ShareActionButtons;
