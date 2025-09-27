import React, { useMemo } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { CompareMessageBubble } from './CompareMessageBubble';
import { ContinueButton } from './ContinueButton';
import { CompareTypingIndicator } from './CompareTypingIndicator';
import { Box } from '../../atoms';
import { Message, AIConfig } from '../../../types';
import { useTheme } from '../../../theme';
import { Ionicons } from '@expo/vector-icons';
import type { BrandColor } from '@/constants/aiColors';
import { getBrandPalette } from '@/utils/aiBrandColors';

interface CompareResponsePaneProps {
  ai: AIConfig;
  messages: Message[];
  isTyping: boolean;
  streamingContent?: string;
  onContinueWithAI: () => void;
  side: 'left' | 'right';
  isExpanded?: boolean;
  isDisabled?: boolean;
  onExpand?: () => void;
}

export const CompareResponsePane: React.FC<CompareResponsePaneProps> = ({
  ai,
  messages,
  isTyping,
  streamingContent,
  onContinueWithAI,
  side,
  isExpanded = false,
  isDisabled = false,
  onExpand,
}) => {
  const { theme, isDark } = useTheme();

  const brandPalette: BrandColor | null = useMemo(
    () => getBrandPalette(ai.provider, ai.name),
    [ai.name, ai.provider]
  );

  const paneBorderColor = brandPalette
    ? (isDark ? brandPalette[500] : brandPalette[300])
    : (side === 'left' ? theme.colors.warning[200] : theme.colors.info[200]);
  const paneBackgroundColor = brandPalette
    ? (isDark ? theme.colors.card : brandPalette[50])
    : (isDark ? theme.colors.card : side === 'left' ? theme.colors.warning[50] : theme.colors.info[50]);
  const accentColor = brandPalette
    ? brandPalette[500]
    : (side === 'left' ? theme.colors.warning[500] : theme.colors.info[500]);

  const paneStyle = {
    backgroundColor: paneBackgroundColor,
    borderColor: paneBorderColor,
    opacity: isDisabled ? 0.5 : 1,
  } as const;

  return (
    <View style={[styles.pane, paneStyle]}>
      {/* Expand Button - Floating in top-right corner */}
      {onExpand && (
        <TouchableOpacity 
          onPress={onExpand} 
          disabled={isDisabled}
          style={styles.expandButton}
        >
          <Ionicons 
            name={isExpanded ? 'contract-outline' : 'expand-outline'} 
            size={20} 
            color={isDisabled ? theme.colors.text.disabled : theme.colors.text.primary}
          />
        </TouchableOpacity>
      )}
      
      {/* Scrollable Response Area */}
      <ScrollView 
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {messages.map((message) => (
          <Box key={message.id} style={styles.messageWrapper}>
            <CompareMessageBubble
              message={message}
              side={side}
              brandPalette={brandPalette}
              providerName={ai.name}
            />
          </Box>
        ))}
        
        {/* Streaming Content */}
        {streamingContent && (
          <Box style={styles.messageWrapper}>
            <CompareMessageBubble
              message={{
                id: `streaming_${side}`,
                sender: ai.name,
                senderType: 'ai',
                content: streamingContent,
                timestamp: Date.now(),
                metadata: { providerId: ai.provider },
              }}
              side={side}
              brandPalette={brandPalette}
              providerName={ai.name}
            />
          </Box>
        )}
        
        {/* Typing Indicator */}
        <CompareTypingIndicator 
          isVisible={isTyping && !streamingContent}
          accentColor={accentColor}
        />
      </ScrollView>
      
      {/* Continue Button */}
      <ContinueButton
        onPress={onContinueWithAI}
        isDisabled={isDisabled}
        side={side}
        accentColor={accentColor}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  pane: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  expandButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 1,
    padding: 4,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 6, // Reduced from 12
  },
  messageWrapper: {
    marginBottom: 6, // Reduced from 8
  },
});
