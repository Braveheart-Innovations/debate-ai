/**
 * TranscriptModal Component
 * Full-screen modal for viewing and exporting debate transcripts as PDF
 */

import React, { useState } from 'react';
import {
  Modal,
  View,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Typography } from '../../molecules';
import { GradientButton } from '../../molecules';
import { SheetHeader } from '@/components/molecules';
import { useTheme } from '../../../theme';
import { Message } from '../../../types';
import { AI_BRAND_COLORS } from '../../../constants/aiColors';

export interface TranscriptModalProps {
  visible: boolean;
  onClose: () => void;
  topic: string;
  participants: { id: string; name: string }[];
  messages: Message[];
  winner?: { id: string; name: string };
  scores?: Record<string, { name: string; roundWins: number }>;
}

export const TranscriptModal: React.FC<TranscriptModalProps> = ({
  visible,
  onClose,
  topic,
  participants,
  messages,
  winner,
  scores,
}) => {
  const { theme, isDark } = useTheme();
  const [isGenerating, setIsGenerating] = useState(false);

  // Filter out system messages for cleaner transcript
  const debateMessages = messages.filter(
    (msg) => msg.sender !== 'Debate Host' && msg.sender !== 'System'
  );

  // Get AI brand color for styling
  const getAIColor = (aiName: string) => {
    const normalizedName = aiName.toLowerCase();
    if (normalizedName.includes('claude')) return AI_BRAND_COLORS.claude[500];
    if (normalizedName.includes('chatgpt') || normalizedName.includes('openai')) 
      return AI_BRAND_COLORS.openai[500];
    if (normalizedName.includes('gemini')) return AI_BRAND_COLORS.gemini[500];
    if (normalizedName.includes('nomi')) return AI_BRAND_COLORS.nomi[500];
    return theme.colors.primary[500];
  };
  
  // Get AI color for PDF (always use light theme colors for printing)
  const getAIPDFColor = (aiName: string): string => {
    const normalizedName = aiName.toLowerCase();
    if (normalizedName.includes('claude')) return AI_BRAND_COLORS.claude[500];
    if (normalizedName.includes('chatgpt') || normalizedName.includes('openai')) 
      return AI_BRAND_COLORS.openai[500];
    if (normalizedName.includes('gemini')) return AI_BRAND_COLORS.gemini[500];
    if (normalizedName.includes('nomi')) return AI_BRAND_COLORS.nomi[500];
    return theme.colors.primary[500];
  };

  // Generate PDF HTML with branding
  const generatePDFHTML = () => {
    const now = new Date();
    const formattedDate = now.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    // Use light theme colors for PDF (always light for printing)
    const pdfColors = {
      primary: theme.colors.primary[500],
      text: theme.colors.pdf.text,
      surface: theme.colors.pdf.surface,
      border: theme.colors.pdf.border,
      background: theme.colors.pdf.background
    };
    
    // Generate AI-specific styles
    const aiStyles = participants.map(p => {
      const color = getAIPDFColor(p.name);
      const className = p.name.toLowerCase().replace(/\s+/g, '');
      return `
    .message.${className} {
      border-left-color: ${color};
    }
    .participant.${className} {
      color: ${color};
    }`;
    }).join('\n');

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; 
      padding: 40px; 
      color: ${pdfColors.text.primary};
      line-height: 1.6;
      background: ${pdfColors.background};
    }
    
    .header {
      border-bottom: 3px solid ${pdfColors.primary};
      padding-bottom: 24px;
      margin-bottom: 32px;
    }
    
    h1 { 
      color: ${pdfColors.primary}; 
      font-size: 32px;
      margin-bottom: 16px;
      font-weight: 700;
      letter-spacing: -0.5px;
    }
    
    .meta {
      color: ${pdfColors.text.secondary};
      font-size: 14px;
      margin-bottom: 8px;
    }
    
    .meta strong {
      color: ${pdfColors.text.tertiary};
      font-weight: 600;
    }
    
    .participants {
      margin-top: 12px;
      padding: 12px;
      background: linear-gradient(135deg, ${theme.colors.pdf.gradientStart} 0%, ${theme.colors.pdf.gradientEnd} 100%);
      border-radius: 8px;
    }
    
    .message {
      margin-bottom: 28px;
      padding: 20px;
      background: ${pdfColors.surface};
      border-radius: 12px;
      border-left: 4px solid ${pdfColors.primary};
    }
    
    ${aiStyles}
    
    .participant {
      font-weight: 700;
      margin-bottom: 12px;
      font-size: 18px;
      display: flex;
      align-items: center;
    }
    
    .content {
      color: ${pdfColors.text.primary};
      font-size: 15px;
      line-height: 1.7;
      white-space: pre-wrap;
    }
    
    .winner-section {
      margin-top: 40px;
      padding: 24px;
      background: linear-gradient(135deg, ${theme.colors.primary[400]} 0%, ${theme.colors.primary[600]} 100%);
      color: white;
      border-radius: 12px;
      text-align: center;
    }
    
    .winner-title {
      font-size: 20px;
      font-weight: 700;
      margin-bottom: 8px;
    }
    
    .winner-name {
      font-size: 28px;
      font-weight: 800;
      margin-bottom: 16px;
    }
    
    .scores {
      display: flex;
      justify-content: center;
      gap: 32px;
      margin-top: 16px;
    }
    
    .score-item {
      text-align: center;
    }
    
    .score-name {
      font-size: 14px;
      opacity: 0.9;
      margin-bottom: 4px;
    }
    
    .score-value {
      font-size: 24px;
      font-weight: 700;
    }
    
    .footer {
      margin-top: 60px;
      padding-top: 24px;
      border-top: 2px solid ${pdfColors.border};
      text-align: center;
      color: ${pdfColors.text.secondary};
      font-size: 12px;
    }
    
    .footer-brand {
      margin-top: 12px;
      font-size: 14px;
      color: ${pdfColors.text.tertiary};
      font-weight: 600;
    }
    
    .logo {
      width: 20px;
      height: 20px;
      vertical-align: middle;
      margin: 0 4px;
    }
    
    @media print {
      body {
        padding: 20px;
      }
      .message {
        break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Symposium AI Transcript</h1>
    <div class="meta"><strong>Motion:</strong> ${topic}</div>
    <div class="meta"><strong>Date:</strong> ${formattedDate}</div>
    <div class="participants">
      <strong>Participants:</strong> ${participants.map(p => p.name).join(' vs ')}
    </div>
  </div>
  
  <div class="messages">
    ${debateMessages
      .map((msg) => {
        const aiClass = msg.sender.toLowerCase().replace(/\s+/g, '');
        return `
      <div class="message ${aiClass}">
        <div class="participant ${aiClass}">${msg.sender}</div>
        <div class="content">${msg.content}</div>
      </div>
    `;
      })
      .join('')}
  </div>
  
  ${
    winner && scores
      ? `
  <div class="winner-section">
    <div class="winner-title">🏆 DEBATE CHAMPION 🏆</div>
    <div class="winner-name">${winner.name}</div>
    <div class="scores">
      ${Object.entries(scores)
        .map(
          ([_, score]) => `
        <div class="score-item">
          <div class="score-name">${score.name}</div>
          <div class="score-value">${score.roundWins}</div>
        </div>
      `
        )
        .join('')}
    </div>
  </div>
  `
      : ''
  }
  
  <div class="footer">
    <div>Generated by Symposium AI</div>
    <div>Where Ideas Converge. Where Understanding Emerges.</div>
    <div class="footer-brand">
      Built with ❤️ by Braveheart Innovations LLC
    </div>
  </div>
</body>
</html>
    `;

    return html;
  };


  // Generate filename with proper convention
  const generateFilename = () => {
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const cleanTopic = topic
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 30);
    const ai1 = participants[0]?.name || 'AI1';
    const ai2 = participants[1]?.name || 'AI2';
    return `SymposiumAI_${cleanTopic}_${ai1}_vs_${ai2}_${date}.pdf`;
  };

  // Handle Save to Device
  const handleSaveToDevice = async () => {
    try {
      setIsGenerating(true);
      
      const html = generatePDFHTML();
      const filename = generateFilename();
      
      // Generate PDF to temp location
      const { uri: tempUri } = await Print.printToFileAsync({
        html,
        base64: false,
      });
      
      // Move to Documents directory with proper filename
      const fileUri = `${FileSystem.documentDirectory}${filename}`;
      await FileSystem.moveAsync({
        from: tempUri,
        to: fileUri,
      });
      
      Alert.alert('Success', `Transcript saved as ${filename}`);
    } catch (error) {
      console.error('Error saving PDF:', error);
      Alert.alert('Error', 'Failed to save PDF. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };
  
  // Handle Share
  const handleShare = async () => {
    try {
      setIsGenerating(true);
      
      const html = generatePDFHTML();
      const filename = generateFilename();
      
      // Generate PDF to temp location
      const { uri: tempUri } = await Print.printToFileAsync({
        html,
        base64: false,
      });
      
      // Move to Documents directory with proper filename
      const fileUri = `${FileSystem.documentDirectory}${filename}`;
      await FileSystem.moveAsync({
        from: tempUri,
        to: fileUri,
      });
      
      // Share the file
      const isAvailable = await Sharing.isAvailableAsync();
      
      if (isAvailable) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Share Debate Transcript',
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert('Error', 'Sharing is not available on this device.');
      }
    } catch (error) {
      console.error('Error sharing PDF:', error);
      Alert.alert('Error', 'Failed to share PDF. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
        {/* Header */}
        <SheetHeader title="Debate Transcript" onClose={onClose} showHandle />

        {/* Metadata */}
        <View style={styles.metadata}>
          <Typography variant="subtitle" weight="semibold">
            {topic}
          </Typography>
          <Typography variant="caption" color="secondary">
            {participants.map((p) => p.name).join(' vs ')} •{' '}
            {new Date().toLocaleDateString()}
          </Typography>
        </View>

        {/* Messages */}
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {debateMessages.map((msg, index) => (
            <View
              key={index}
              style={[
                styles.messageCard,
                {
                  backgroundColor: isDark
                    ? theme.colors.overlays.soft
                    : theme.colors.overlays.soft,
                  borderLeftColor: getAIColor(msg.sender),
                },
              ]}
            >
              <Typography
                variant="subtitle"
                weight="bold"
                style={{ color: getAIColor(msg.sender), marginBottom: 8 }}
              >
                {msg.sender}
              </Typography>
              <Typography variant="body" style={{ lineHeight: 24 }}>
                {msg.content}
              </Typography>
            </View>
          ))}

          {/* Winner section if available */}
          {winner && scores && (
            <LinearGradient
              colors={theme.colors.gradients.premium}
              style={styles.winnerCard}
            >
              <Typography
                variant="title"
                weight="bold"
                style={{ color: theme.colors.text.white, textAlign: 'center', marginBottom: 16 }}
              >
                🏆 {winner.name} Wins!
              </Typography>
              <View style={styles.scoresRow}>
                {Object.entries(scores).map(([_, score]) => (
                  <View key={score.name} style={styles.scoreItem}>
                    <Typography variant="caption" style={{ color: theme.colors.text.white, opacity: 0.9 }}>
                      {score.name}
                    </Typography>
                    <Typography
                      variant="title"
                      weight="bold"
                      style={{ color: theme.colors.text.white, fontSize: 24 }}
                    >
                      {score.roundWins}
                    </Typography>
                  </View>
                ))}
              </View>
            </LinearGradient>
          )}

          <View style={{ height: 100 }} />
        </ScrollView>

        {/* Action Buttons */}
        <BlurView intensity={90} style={styles.actionBar}>
          <View style={styles.actionButtons}>
            <GradientButton
              title={isGenerating ? 'Processing...' : '💾 Save'}
              onPress={handleSaveToDevice}
              gradient={theme.colors.gradients.primary}
              disabled={isGenerating}
              style={styles.actionButton}
              fullWidth
            />
            <GradientButton
              title={isGenerating ? 'Processing...' : '📤 Share'}
              onPress={handleShare}
              gradient={theme.colors.gradients.primary}
              disabled={isGenerating}
              style={styles.actionButton}
              fullWidth
            />
          </View>
          {isGenerating && (
            <ActivityIndicator
              style={styles.loader}
              color={theme.colors.primary[500]}
            />
          )}
        </BlurView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    marginTop: Platform.OS === 'ios' ? 20 : 0,
  },
  closeButton: {
    padding: 10,
    borderRadius: 20,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metadata: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  messageCard: {
    marginVertical: 8,
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
  },
  winnerCard: {
    marginVertical: 24,
    padding: 24,
    borderRadius: 16,
  },
  scoresRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  scoreItem: {
    alignItems: 'center',
  },
  actionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
  },
  loader: {
    position: 'absolute',
    right: 40,
    top: '50%',
    marginTop: -10,
  },
});
