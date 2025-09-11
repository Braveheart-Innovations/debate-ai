import React from 'react';
import { ActivityIndicator, StyleSheet, ViewStyle } from 'react-native';
import { Box } from '@/components/atoms';
import { Typography } from '../common/Typography';
import { useTheme } from '@/theme';

interface ConnectionStatusProps {
  status: 'idle' | 'testing' | 'success' | 'failed';
  message?: string;
  model?: string;
  responseTime?: number;
  style?: ViewStyle;
  testID?: string;
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  status,
  message,
  model,
  responseTime,
  style,
  testID,
}) => {
  const { theme } = useTheme();

  const getStatusIcon = () => {
    switch (status) {
      case 'testing':
        return (
          <ActivityIndicator 
            size="small" 
            color={theme.colors.primary[500]} 
          />
        );
      case 'success':
        return (
          <Typography variant="body" style={{ color: theme.colors.success[500] }}>
            ✓
          </Typography>
        );
      case 'failed':
        return (
          <Typography variant="body" style={{ color: theme.colors.error[500] }}>
            ✕
          </Typography>
        );
      case 'idle':
      default:
        return null;
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'testing':
        return theme.colors.primary[500];
      case 'success':
        return theme.colors.success[500];
      case 'failed':
        return theme.colors.error[500];
      case 'idle':
      default:
        return theme.colors.text.secondary;
    }
  };

  const getStatusText = () => {
    if (message) return message;
    
    switch (status) {
      case 'testing':
        return 'Testing connection...';
      case 'success':
        return 'Connection successful';
      case 'failed':
        return 'Connection failed';
      case 'idle':
      default:
        return 'Not tested';
    }
  };

  const formatResponseTime = (time: number) => {
    return time < 1000 ? `${time}ms` : `${(time / 1000).toFixed(1)}s`;
  };

  if (status === 'idle') {
    return null;
  }

  return (
    <Box
      style={[
        styles.container,
        style,
      ]}
      testID={testID}
    >
      <Box style={styles.statusRow}>
        {getStatusIcon()}
        <Box style={styles.statusInfo}>
          <Typography
            variant="caption"
            style={{ color: getStatusColor() }}
            weight="medium"
          >
            {getStatusText()}
          </Typography>
          
          {status === 'success' && model && (
            <Typography
              variant="caption"
              color="secondary"
              style={styles.modelText}
            >
              Model: {model}
            </Typography>
          )}
          
          {status === 'success' && responseTime && (
            <Typography
              variant="caption"
              color="secondary"
              style={styles.responseTime}
            >
              Response time: {formatResponseTime(responseTime)}
            </Typography>
          )}
        </Box>
      </Box>
    </Box>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 4,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  statusInfo: {
    flex: 1,
  },
  modelText: {
    marginTop: 2,
  },
  responseTime: {
    marginTop: 2,
  },
});
