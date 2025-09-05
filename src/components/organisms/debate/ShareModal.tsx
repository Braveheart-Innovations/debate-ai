/**
 * ShareModal Component
 * COMPLETELY REBUILT - Fixed scrolling issues, proper height management, accessible content
 * Bottom sheet modal for sharing debate results following atomic design principles
 */

import React, { useRef, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { SheetHeader } from '../../molecules/SheetHeader';
import { SharePreviewCard } from '../../molecules/SharePreviewCard';
import { ShareActionButtons } from '../../molecules/ShareActionButtons';
import { Typography } from '../../molecules';
import { useTheme } from '../../../theme';
import { Message, AI } from '../../../types';

const { height } = Dimensions.get('window');

export interface ShareModalProps {
  topic: string;
  participants: AI[];
  messages: Message[];
  winner?: AI;
  scores?: Record<string, { name: string; roundWins: number }>;
  onShare?: (platform?: string) => void;
  onClose?: () => void;
  visible: boolean;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  topic,
  participants,
  winner,
  scores,
  onShare,
  onClose,
  visible,
}) => {
  const { theme } = useTheme();
  const viewShotRef = useRef<ViewShot>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerateAndShare = async () => {
    try {
      setIsGenerating(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      
      const uri = await viewShotRef.current?.capture?.();
      if (!uri) throw new Error('Failed to capture image');
      
      const isAvailable = await Sharing.isAvailableAsync();
      
      if (isAvailable) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: 'Share AI Debate',
          UTI: 'public.png',
        });
        
        onShare?.('ios');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Alert.alert('Sharing not available', 'Please try saving the image instead.');
      }
    } catch (error) {
      console.error('Share failed:', error);
      Alert.alert('Error', 'Failed to share debate. Please try again.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleNativeShare = async () => {
    try {
      const { Share } = await import('react-native');
      await Share.share({
        message: `🤖 ${participants.map(p => p.name).join(' vs ')} debated "${topic}" and ${winner?.name} won! Create your own AI debate at SymposiumAI.app`,
        url: 'https://debateai.app',
        title: 'Symposium AI - AI Debate Results',
      });
      onShare?.('native');
    } catch (error) {
      console.error('Native share error:', error);
    }
  };

  const handleBackdropPress = () => {
    onClose?.();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="overFullScreen"
      transparent
      onRequestClose={onClose}
    >
      <BlurView intensity={20} style={styles.backdrop}>
        <TouchableOpacity 
          style={styles.backdropTouchable}
          activeOpacity={1}
          onPress={handleBackdropPress}
        >
          <TouchableOpacity 
            activeOpacity={1} 
            style={[
              styles.modalContainer, 
              { backgroundColor: theme.colors.background }
            ]}
            onPress={() => {}} // Prevent closing when tapping modal content
          >
            <SafeAreaView style={styles.safeArea}>
              {/* Header */}
              <SheetHeader 
                title="Share Debate"
                onClose={onClose || (() => {})}
                showHandle
              />

              {/* KeyboardAvoidingView for better mobile experience */}
              <KeyboardAvoidingView 
                style={styles.keyboardAvoidingView}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={100}
              >
                {/* Content with proper scrolling */}
                <ScrollView 
                  style={styles.scrollView}
                  contentContainerStyle={styles.scrollContent}
                  showsVerticalScrollIndicator={true}
                  bounces={true}
                  alwaysBounceVertical={true}
                  scrollEventThrottle={16}
                  keyboardShouldPersistTaps="handled"
                  nestedScrollEnabled={true}
                >
                {/* Preview Label */}
                <Typography 
                  variant="caption" 
                  color="secondary" 
                  align="center"
                  style={styles.previewLabel}
                >
                  Preview
                </Typography>

                {/* Share Card Preview with ViewShot */}
                <ViewShot 
                  ref={viewShotRef} 
                  options={{ format: 'png', quality: 1.0 }}
                  style={styles.viewShotWrapper}
                >
                  <SharePreviewCard
                    topic={topic}
                    participants={participants}
                    winner={winner}
                    scores={scores}
                  />
                </ViewShot>

                {/* Share Actions */}
                <ShareActionButtons
                  onShareImage={handleGenerateAndShare}
                  onCopyLink={() => {}}
                  onMoreOptions={handleNativeShare}
                  isGenerating={isGenerating}
                  topic={topic}
                  winner={winner?.name}
                  participants={participants.map(p => p.name)}
                />
                </ScrollView>
              </KeyboardAvoidingView>
            </SafeAreaView>
          </TouchableOpacity>
        </TouchableOpacity>
      </BlurView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdropTouchable: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContainer: {
    height: height * 0.85, // 85% height to show more content
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  safeArea: {
    flex: 1,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40, // Reasonable padding
    flexGrow: 1,
    // Remove minHeight that was breaking the layout
  },
  previewLabel: {
    marginBottom: 12,
  },
  viewShotWrapper: {
    alignItems: 'center',
  },
});

export default ShareModal;
