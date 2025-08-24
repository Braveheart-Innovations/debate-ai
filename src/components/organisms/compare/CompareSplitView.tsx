import React from 'react';
import { View, StyleSheet } from 'react-native';
import { CompareResponsePane } from './CompareResponsePane';
import { Message, AIConfig } from '../../../types';
import { useTheme } from '../../../theme';

type ViewMode = 'split' | 'left-full' | 'right-full' | 'left-only' | 'right-only';

interface CompareSplitViewProps {
  leftAI: AIConfig;
  rightAI: AIConfig;
  leftMessages: Message[];
  rightMessages: Message[];
  leftTyping: boolean;
  rightTyping: boolean;
  leftStreamingContent?: string;
  rightStreamingContent?: string;
  onContinueWithLeft: () => void;
  onContinueWithRight: () => void;
  viewMode: ViewMode;
  continuedSide: 'left' | 'right' | null;
  onExpandLeft: () => void;
  onExpandRight: () => void;
}

export const CompareSplitView: React.FC<CompareSplitViewProps> = ({
  leftAI,
  rightAI,
  leftMessages,
  rightMessages,
  leftTyping,
  rightTyping,
  leftStreamingContent,
  rightStreamingContent,
  onContinueWithLeft,
  onContinueWithRight,
  viewMode,
  continuedSide,
  onExpandLeft,
  onExpandRight,
}) => {
  const { theme } = useTheme();
  
  // Determine visibility based on view mode
  const showLeft = viewMode !== 'right-full' && viewMode !== 'right-only';
  const showRight = viewMode !== 'left-full' && viewMode !== 'left-only';
  const leftFullWidth = viewMode === 'left-full' || viewMode === 'left-only';
  const rightFullWidth = viewMode === 'right-full' || viewMode === 'right-only';
  
  return (
    <View style={styles.container}>
      {/* Left AI Response Pane */}
      {showLeft && (
        <View style={[
          styles.leftPane,
          leftFullWidth && styles.fullWidthPane
        ]}>
          <CompareResponsePane
            ai={leftAI}
            messages={leftMessages}
            isTyping={leftTyping}
            streamingContent={leftStreamingContent}
            onContinueWithAI={onContinueWithLeft}
            side="left"
            isExpanded={leftFullWidth}
            isDisabled={continuedSide === 'right'}
            onExpand={onExpandLeft}
          />
        </View>
      )}
      
      {/* Divider - only show in split mode */}
      {showLeft && showRight && !leftFullWidth && !rightFullWidth && (
        <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
      )}
      
      {/* Right AI Response Pane */}
      {showRight && (
        <View style={[
          styles.rightPane,
          rightFullWidth && styles.fullWidthPane
        ]}>
          <CompareResponsePane
            ai={rightAI}
            messages={rightMessages}
            isTyping={rightTyping}
            streamingContent={rightStreamingContent}
            onContinueWithAI={onContinueWithRight}
            side="right"
            isExpanded={rightFullWidth}
            isDisabled={continuedSide === 'left'}
            onExpand={onExpandRight}
          />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    paddingHorizontal: 4, // Reduced from 8
    paddingVertical: 4, // Reduced from 8
  },
  leftPane: {
    flex: 1,
    paddingRight: 2, // Reduced from 4
  },
  rightPane: {
    flex: 1,
    paddingLeft: 2, // Reduced from 4
  },
  fullWidthPane: {
    paddingHorizontal: 0,
  },
  divider: {
    width: 1,
    marginVertical: 4, // Reduced from 8
  },
});