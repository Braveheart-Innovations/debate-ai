import React from 'react';
import { StyleSheet } from 'react-native';
import { Box } from '../../atoms';
import { Button } from '../common/Button';
import { useTheme } from '../../../theme';
import { SwipeableActionsProps } from '../../../types/history';

export const SwipeableActions: React.FC<SwipeableActionsProps> = ({
  onDelete,
  onArchive,
  onShare
}) => {
  const { theme } = useTheme();

  return (
    <Box style={styles.container}>
      {/* Delete Action (Primary - always shown) */}
      <Box 
        style={[
          styles.deleteAction, 
          { backgroundColor: theme.colors.error[500] }
        ]}
      >
        <Button
          title="Delete"
          onPress={onDelete}
          variant="ghost"
          style={styles.actionButton}
        />
      </Box>

      {/* Archive Action (Optional) */}
      {onArchive && (
        <Box 
          style={[
            styles.archiveAction, 
            { backgroundColor: theme.colors.warning[500] }
          ]}
        >
          <Button
            title="Archive"
            onPress={onArchive}
            variant="ghost"
            style={styles.actionButton}
          />
        </Box>
      )}

      {/* Share Action (Optional) */}
      {onShare && (
        <Box 
          style={[
            styles.shareAction, 
            { backgroundColor: theme.colors.primary[500] }
          ]}
        >
          <Button
            title="Share"
            onPress={onShare}
            variant="ghost"
            style={styles.actionButton}
          />
        </Box>
      )}
    </Box>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    height: '100%',
  },
  deleteAction: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    marginBottom: 12,
    borderRadius: 12,
    marginLeft: 8,
  },
  archiveAction: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    marginBottom: 12,
    borderRadius: 12,
    marginLeft: 4,
  },
  shareAction: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    marginBottom: 12,
    borderRadius: 12,
    marginLeft: 4,
  },
  actionButton: {
    backgroundColor: 'transparent',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
});
