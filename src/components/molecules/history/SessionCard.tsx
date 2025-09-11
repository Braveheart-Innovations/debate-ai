import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Box } from '../../atoms';
import { Typography } from '../common/Typography';
import { useTheme } from '../../../theme';
import { dateFormatterService } from '../../../services/history';
import { SessionCardProps } from '../../../types/history';
import { SessionPreview } from './SessionPreview';
import { HighlightedText } from './HighlightedText';

export const SessionCard: React.FC<SessionCardProps> = ({
  session,
  onPress,
  searchTerm,
  index,
  testID
}) => {
  const { theme } = useTheme();
  
  const aiNames = session.selectedAIs.map(ai => ai.name).join(' • ');
  const sessionType = session.sessionType; // No default - must be explicitly set
  
  // Get appropriate preview based on session type
  const getPreview = () => {
    if (sessionType === 'debate') {
      // For debates, show the topic - first check if stored as attribute
      if (session.topic) {
        return `Topic: ${session.topic}`;
      }
      // Fall back to extracting from host message for older sessions
      const topicMessage = session.messages.find(m => m.sender === 'Debate Host');
      if (topicMessage) {
        // Extract topic from the host message (topic is in quotes at the start)
        const topicMatch = topicMessage.content.match(/^"([^"]+)"/);
        const topic = topicMatch ? topicMatch[1] : 'Debate';
        return `Topic: ${topic}`;
      }
      return 'Debate completed';
    } else if (sessionType === 'comparison') {
      const lastMessage = session.messages[session.messages.length - 1];
      const comparisonData = session as { hasDiverged?: boolean; continuedWithAI?: string } & typeof session;
      if (comparisonData.hasDiverged) {
        return `Diverged to ${comparisonData.continuedWithAI || 'single AI'}`;
      }
      return lastMessage?.content || 'Comparison in progress';
    } else {
      const lastMessage = session.messages[session.messages.length - 1];
      return lastMessage?.content || 'No messages yet';
    }
  };
  
  const preview = getPreview();
  
  // Check if this session contains the search term for highlighting
  const containsSearchTerm = searchTerm && (
    session.selectedAIs.some(ai => 
      ai.name.toLowerCase().includes(searchTerm.toLowerCase())
    ) ||
    session.messages.some(msg => 
      msg.content.toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  const handlePress = () => {
    onPress(session);
  };

  return (
    <Animated.View entering={FadeInDown.delay(index * 50).springify()}>
      <TouchableOpacity
        onPress={handlePress}
        testID={testID}
        style={[
          styles.container,
          {
            backgroundColor: theme.colors.card,
            borderColor: containsSearchTerm ? theme.colors.primary[500] : theme.colors.border,
            borderWidth: containsSearchTerm ? 2 : 1,
            shadowColor: theme.colors.shadow,
          }
        ]}
      >
        <Box style={styles.content}>
          {/* Header */}
          <Box style={styles.header}>
            <Box style={{ flex: 1 }}>
              {searchTerm ? (
                <HighlightedText
                  text={aiNames}
                  searchTerm={searchTerm}
                  style={{ 
                    ...styles.aiNames, 
                    color: theme.colors.text.primary 
                  }}
                />
              ) : (
                <Typography 
                  variant="subtitle" 
                  weight="semibold" 
                  numberOfLines={1}
                  style={{ flex: 1 }}
                >
                  {aiNames}
                </Typography>
              )}
            </Box>
            <Typography variant="caption" color="secondary">
              {dateFormatterService.formatRelativeDate(session.createdAt)}
            </Typography>
          </Box>
          
          {/* Message Preview */}
          <SessionPreview 
            text={preview}
            searchTerm={searchTerm}
            style={styles.preview}
            maxLines={2}
          />
          
          {/* Footer */}
          <Box style={styles.footer}>
            <Typography variant="caption" color="secondary">
              {sessionType === 'debate' ? `Debate • ${session.messages.length} messages` : 
               sessionType === 'comparison' ? `Comparison • ${session.messages.length} messages` : 
               `${session.messages.length} message${session.messages.length !== 1 ? 's' : ''}`}
            </Typography>
            
            {/* Search Match Badge */}
            {containsSearchTerm && (
              <Box 
                style={[
                  styles.matchBadge, 
                  { backgroundColor: theme.colors.warning[50] }
                ]}
              >
                <Typography 
                  variant="caption" 
                  style={{ color: theme.colors.warning[600] }}
                >
                  Match found
                </Typography>
              </Box>
            )}
          </Box>
        </Box>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
    borderRadius: 12,
    padding: 16,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  content: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  preview: {
    marginBottom: 8,
    lineHeight: 20,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  matchBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  aiNames: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
});
