import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Box } from '../../atoms';
import { Typography, Button } from '../../molecules';
import { EmptyHistoryStateProps } from '../../../types/history';
import { useTheme } from '../../../theme';

export const EmptyHistoryState: React.FC<EmptyHistoryStateProps> = ({
  type,
  searchTerm,
  onRetry,
  onStartChat,
  onClearSearch,
  emptyStateConfig
}) => {
  const { theme } = useTheme();

  const getEmptyStateContent = () => {
    switch (type) {
      case 'no-sessions':
        return {
          icon: emptyStateConfig?.icon,
          iconLibrary: emptyStateConfig?.iconLibrary,
          title: emptyStateConfig?.title || 'No conversations yet',
          message: emptyStateConfig?.message || 'Start a new chat to see it here',
          actionText: emptyStateConfig?.actionText || 'Start Chatting',
          action: onStartChat
        };
      
      case 'no-results':
        return {
          icon: 'search',
          iconLibrary: 'ionicons',
          title: 'No matches found',
          message: searchTerm 
            ? `No conversations match "${searchTerm}"`
            : 'Try a different search term',
          actionText: 'Clear Search',
          action: onClearSearch
        };
      
      case 'loading-error':
        return {
          icon: 'alert-circle-outline',
          iconLibrary: 'ionicons',
          title: 'Failed to load conversations',
          message: 'Check your connection and try again',
          actionText: 'Retry',
          action: onRetry
        };
      
      default:
        return {
          icon: 'chatbubbles-outline',
          iconLibrary: 'ionicons',
          title: 'No conversations',
          message: 'Nothing to show here',
          actionText: undefined,
          action: undefined
        };
    }
  };

  const { icon, iconLibrary, title, message, actionText, action } = getEmptyStateContent();

  const renderIcon = () => {
    if (!icon) return null;

    const iconColor = theme.colors.text.secondary;
    const iconSize = 48;

    if (iconLibrary === 'material-community') {
      return (
        <MaterialCommunityIcons 
          name={icon as keyof typeof MaterialCommunityIcons.glyphMap} 
          size={iconSize} 
          color={iconColor} 
        />
      );
    }
    
    return (
      <Ionicons 
        name={icon as keyof typeof Ionicons.glyphMap} 
        size={iconSize} 
        color={iconColor} 
      />
    );
  };

  return (
    <Box style={styles.container}>
      {icon && (
        <View style={styles.iconContainer}>
          {renderIcon()}
        </View>
      )}
      
      <Typography 
        variant="title" 
        align="center" 
        style={styles.title}
      >
        {title}
      </Typography>
      
      <Typography 
        variant="body" 
        color="secondary" 
        align="center"
        style={styles.message}
      >
        {message}
      </Typography>

      {actionText && action && (
        <Button
          title={actionText}
          onPress={action}
          variant={type === 'loading-error' ? 'primary' : 'secondary'}
          style={styles.actionButton}
        />
      )}

    </Box>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 16, // Match HistoryList's paddingVertical
    paddingBottom: 40,
    paddingHorizontal: 20, // Match HistoryList's paddingHorizontal
  },
  iconContainer: {
    marginBottom: 16,
  },
  title: {
    marginBottom: 8,
  },
  message: {
    marginBottom: 24,
    lineHeight: 20,
  },
  actionButton: {
    marginBottom: 16,
    minWidth: 120,
  },
});