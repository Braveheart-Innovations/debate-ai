import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Box } from '../../atoms';
import { Typography, Button, Card } from '../../molecules';
import { useTheme } from '../../../theme';
import { useResponsive } from '../../../hooks/useResponsive';
import { dateFormatterService } from '../../../services/history';
import { ChatSession } from '../../../types';
import { colors } from '../../../theme/colors';

interface SessionDetailPaneProps {
  session: ChatSession | null;
  onOpenSession: (session: ChatSession) => void;
}

/**
 * Detail pane for iPad master-detail view in History screen.
 * Shows session preview with messages and action button.
 */
export const SessionDetailPane: React.FC<SessionDetailPaneProps> = ({
  session,
  onOpenSession,
}) => {
  const { theme, isDark } = useTheme();
  const { rs, fontSize } = useResponsive();

  // Theme-aware colors for message bubbles
  const userMessageBg = isDark ? colors.primary[900] : colors.primary[50];
  const userMessageBorder = isDark ? colors.primary[600] : colors.primary[500];
  const aiMessageBorder = isDark ? colors.gray[700] : colors.gray[300];

  // Empty state when no session is selected
  if (!session) {
    return (
      <Box style={[styles.emptyContainer, { backgroundColor: theme.colors.background }]}>
        <Ionicons
          name="document-text-outline"
          size={64}
          color={theme.colors.text.disabled}
        />
        <Typography
          variant="subtitle"
          color="secondary"
          style={{ marginTop: rs('md'), textAlign: 'center' }}
        >
          Select a session to preview
        </Typography>
      </Box>
    );
  }

  const aiNames = session.selectedAIs.map(ai => ai.name).join(' & ');
  const sessionType = session.sessionType;

  // Get icon based on session type
  const getSessionIcon = () => {
    switch (sessionType) {
      case 'debate':
        return <MaterialCommunityIcons name="sword-cross" size={24} color={theme.colors.primary[500]} />;
      case 'comparison':
        return <Ionicons name="git-compare" size={24} color={theme.colors.primary[500]} />;
      default:
        return <Ionicons name="chatbubbles" size={24} color={theme.colors.primary[500]} />;
    }
  };

  // Get session type label
  const getSessionTypeLabel = () => {
    switch (sessionType) {
      case 'debate':
        return 'Debate';
      case 'comparison':
        return 'Comparison';
      default:
        return 'Chat';
    }
  };

  // Get action button label
  const getActionLabel = () => {
    switch (sessionType) {
      case 'debate':
        return 'View Debate';
      case 'comparison':
        return 'View Comparison';
      default:
        return 'Continue Chat';
    }
  };

  return (
    <Box style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Header */}
      <Card padding="medium" style={styles.headerCard}>
        <Box style={styles.headerRow}>
          {getSessionIcon()}
          <Box style={styles.headerText}>
            <Typography variant="title" weight="semibold" numberOfLines={1}>
              {aiNames}
            </Typography>
            <Typography variant="caption" color="secondary">
              {getSessionTypeLabel()} • {dateFormatterService.formatRelativeDate(session.createdAt)}
            </Typography>
          </Box>
        </Box>

        {/* Topic for debates */}
        {sessionType === 'debate' && session.topic && (
          <Box style={[styles.topicBox, { backgroundColor: theme.colors.surface }]}>
            <Typography variant="caption" color="secondary" style={styles.topicLabel}>
              MOTION
            </Typography>
            <Typography variant="body" style={{ marginTop: 4 }}>
              {session.topic}
            </Typography>
          </Box>
        )}

        {/* Stats row */}
        <Box style={styles.statsRow}>
          <Box style={styles.statItem}>
            <Ionicons name="chatbubble-outline" size={16} color={theme.colors.text.secondary} />
            <Typography variant="caption" color="secondary" style={{ marginLeft: 4 }}>
              {session.messages.length} messages
            </Typography>
          </Box>
          <Box style={styles.statItem}>
            <Ionicons name="people-outline" size={16} color={theme.colors.text.secondary} />
            <Typography variant="caption" color="secondary" style={{ marginLeft: 4 }}>
              {session.selectedAIs.length} AI{session.selectedAIs.length !== 1 ? 's' : ''}
            </Typography>
          </Box>
        </Box>

        {/* Action button */}
        <Button
          title={getActionLabel()}
          onPress={() => onOpenSession(session)}
          variant="primary"
          size="medium"
          style={{ marginTop: rs('md') }}
        />
      </Card>

      {/* Message preview */}
      <Box style={styles.messagesSection}>
        <Typography variant="subtitle" weight="semibold" style={{ marginBottom: rs('sm') }}>
          Recent Messages
        </Typography>
        <ScrollView
          style={styles.messagesList}
          showsVerticalScrollIndicator={false}
        >
          {session.messages.slice(-10).map((message, index) => {
            const isUserMessage = message.senderType === 'user';
            return (
              <Box
                key={`${message.timestamp}-${index}`}
                style={[
                  styles.messageItem,
                  {
                    backgroundColor: isUserMessage
                      ? userMessageBg
                      : theme.colors.surface,
                    borderLeftColor: isUserMessage
                      ? userMessageBorder
                      : aiMessageBorder,
                  }
                ]}
              >
                <Typography
                  variant="caption"
                  weight="semibold"
                  color={isUserMessage ? 'brand' : 'secondary'}
                  style={{ marginBottom: 4 }}
                >
                  {isUserMessage ? 'You' : message.sender}
                </Typography>
                <Typography
                  variant="body"
                  numberOfLines={3}
                  style={{ fontSize: fontSize('sm') }}
                >
                  {message.content}
                </Typography>
              </Box>
            );
          })}
          {session.messages.length === 0 && (
            <Typography variant="body" color="secondary" style={{ textAlign: 'center', padding: rs('lg') }}>
              No messages yet
            </Typography>
          )}
        </ScrollView>
      </Box>
    </Box>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  headerCard: {
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerText: {
    flex: 1,
    marginLeft: 12,
  },
  topicBox: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  topicLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 16,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  messagesSection: {
    flex: 1,
  },
  messagesList: {
    flex: 1,
  },
  messageItem: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderLeftWidth: 3,
  },
});
