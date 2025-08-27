import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Typography } from './Typography';
import { Box } from '../atoms';
import { useTheme } from '../../theme';

interface StorageSegment {
  count: number;
  limit: number;
  color: string;
  label: string;
}

interface StorageIndicatorProps {
  segments: StorageSegment[];
  onUpgrade?: () => void;
}

export const StorageIndicator: React.FC<StorageIndicatorProps> = ({ segments, onUpgrade }) => {
  const { theme } = useTheme();
  
  // Calculate total usage
  const totalUsed = segments.reduce((sum, seg) => sum + seg.count, 0);
  const totalLimit = segments.reduce((sum, seg) => sum + seg.limit, 0);
  const overallPercentage = totalLimit > 0 ? (totalUsed / totalLimit) * 100 : 0;
  
  return (
    <Box style={[styles.container, { backgroundColor: theme.colors.surface }]}>
      {/* Header */}
      <View style={styles.header}>
        <Typography variant="caption" color="secondary">
          Storage: {totalUsed}/{totalLimit} items
        </Typography>
        {onUpgrade && (
          <Typography 
            variant="caption" 
            style={{ color: theme.colors.primary[500], textDecorationLine: 'underline' }}
          >
            Upgrade for unlimited
          </Typography>
        )}
      </View>
      
      {/* Progress bars for each type */}
      <View style={styles.barsContainer}>
        {segments.map((segment, index) => {
          const percentage = segment.limit > 0 ? (segment.count / segment.limit) * 100 : 0;
          const isNearLimit = percentage >= 80;
          
          return (
            <View key={index} style={styles.barRow}>
              <Typography variant="caption" style={styles.label}>
                {segment.label}
              </Typography>
              <View style={[styles.barContainer, { backgroundColor: theme.colors.border }]}>
                <View 
                  style={[
                    styles.barFill,
                    { 
                      width: `${Math.min(percentage, 100)}%`,
                      backgroundColor: isNearLimit ? theme.colors.error[500] : segment.color
                    }
                  ]} 
                />
              </View>
              <Typography 
                variant="caption" 
                style={{
                  ...styles.count,
                  color: isNearLimit ? theme.colors.error[500] : theme.colors.text.secondary
                }}
              >
                {segment.count}/{segment.limit}
              </Typography>
            </View>
          );
        })}
      </View>
      
      {/* Warning message */}
      {overallPercentage >= 80 && (
        <Typography 
          variant="caption" 
          style={{
            ...styles.warning,
            color: theme.colors.warning[500]
          }}
        >
          ⚠️ Storage nearly full - oldest items will be auto-deleted
        </Typography>
      )}
    </Box>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 12,
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  barsContainer: {
    gap: 6,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 20,
  },
  label: {
    width: 60,
    marginRight: 8,
  },
  barContainer: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    marginRight: 8,
  },
  barFill: {
    height: '100%',
    borderRadius: 2,
  },
  count: {
    width: 35,
    textAlign: 'right',
  },
  warning: {
    marginTop: 8,
    textAlign: 'center',
  },
});