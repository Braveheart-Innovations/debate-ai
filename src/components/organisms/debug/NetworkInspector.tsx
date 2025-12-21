import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Clipboard,
  Alert,
} from 'react-native';
import { Box } from '@/components/atoms';
import { Typography, Button } from '@/components/molecules';
import { useTheme } from '@/theme';
import {
  NetworkInterceptor,
  NetworkRequest,
} from '@/services/debug/NetworkInterceptor';

const STATUS_COLORS: Record<string, string> = {
  success: '#22C55E',
  redirect: '#3B82F6',
  clientError: '#F59E0B',
  serverError: '#EF4444',
  network: '#9CA3AF',
};

const getStatusColor = (status: number): string => {
  if (status === 0) return STATUS_COLORS.network;
  if (status >= 200 && status < 300) return STATUS_COLORS.success;
  if (status >= 300 && status < 400) return STATUS_COLORS.redirect;
  if (status >= 400 && status < 500) return STATUS_COLORS.clientError;
  return STATUS_COLORS.serverError;
};

export const NetworkInspector: React.FC = () => {
  const { theme } = useTheme();
  const [requests, setRequests] = useState<NetworkRequest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<NetworkRequest | null>(
    null
  );

  useEffect(() => {
    // Install interceptor if not already installed
    NetworkInterceptor.install();

    // Initial load
    setRequests(NetworkInterceptor.getRequests());

    // Subscribe to updates
    const unsubscribe = NetworkInterceptor.addListener(setRequests);

    return unsubscribe;
  }, []);

  const clearRequests = useCallback(() => {
    NetworkInterceptor.clearRequests();
    setSelectedRequest(null);
  }, []);

  const copyRequest = useCallback((request: NetworkRequest) => {
    const text = JSON.stringify(request, null, 2);
    Clipboard.setString(text);
    Alert.alert('Copied', 'Request details copied to clipboard');
  }, []);

  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const formatTime = (timestamp: number): string => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const getMethodColor = (method: string): string => {
    switch (method.toUpperCase()) {
      case 'GET':
        return '#22C55E';
      case 'POST':
        return '#3B82F6';
      case 'PUT':
        return '#F59E0B';
      case 'DELETE':
        return '#EF4444';
      case 'PATCH':
        return '#8B5CF6';
      default:
        return '#6B7280';
    }
  };

  const renderRequestItem = ({ item }: { item: NetworkRequest }) => {
    const status = item.response?.status || 0;
    const statusColor = getStatusColor(status);
    const methodColor = getMethodColor(item.method);

    // Extract path from URL for display
    let displayPath = item.url;
    try {
      const url = new URL(item.url);
      displayPath = url.pathname + url.search;
      if (displayPath.length > 50) {
        displayPath = displayPath.substring(0, 47) + '...';
      }
    } catch {
      if (displayPath.length > 50) {
        displayPath = displayPath.substring(0, 47) + '...';
      }
    }

    return (
      <TouchableOpacity
        style={[
          styles.requestItem,
          selectedRequest?.id === item.id && {
            backgroundColor: theme.colors.primary[500] + '10',
          },
        ]}
        onPress={() => setSelectedRequest(item)}
        onLongPress={() => copyRequest(item)}
      >
        <Box style={styles.requestHeader}>
          <Box
            style={[
              styles.methodBadge,
              { backgroundColor: methodColor + '20' },
            ]}
          >
            <Typography
              style={[styles.methodText, { color: methodColor }]}
              variant="caption"
            >
              {item.method}
            </Typography>
          </Box>

          <Box
            style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}
          >
            <Typography
              style={[styles.statusText, { color: statusColor }]}
              variant="caption"
            >
              {status || 'ERR'}
            </Typography>
          </Box>

          <Typography variant="caption" color="secondary" style={styles.time}>
            {formatTime(item.timestamp)}
          </Typography>
        </Box>

        <Typography variant="caption" style={styles.path} numberOfLines={1}>
          {displayPath}
        </Typography>

        {item.response && (
          <Typography variant="caption" color="secondary">
            {formatDuration(item.response.duration)}
          </Typography>
        )}

        {item.error && (
          <Typography variant="caption" style={{ color: STATUS_COLORS.serverError }}>
            {item.error}
          </Typography>
        )}
      </TouchableOpacity>
    );
  };

  const renderRequestDetails = () => {
    if (!selectedRequest) return null;

    return (
      <Box
        style={[
          styles.detailsPanel,
          { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
        ]}
      >
        <Box style={styles.detailsHeader}>
          <Typography variant="subtitle" style={styles.detailsTitle}>
            Request Details
          </Typography>
          <TouchableOpacity onPress={() => setSelectedRequest(null)}>
            <Typography style={{ color: theme.colors.primary[500] }}>Close</Typography>
          </TouchableOpacity>
        </Box>

        <FlatList
          data={[
            { label: 'URL', value: selectedRequest.url },
            { label: 'Method', value: selectedRequest.method },
            {
              label: 'Status',
              value: selectedRequest.response
                ? `${selectedRequest.response.status} ${selectedRequest.response.statusText}`
                : 'Pending',
            },
            {
              label: 'Duration',
              value: selectedRequest.response
                ? formatDuration(selectedRequest.response.duration)
                : '-',
            },
            {
              label: 'Request Headers',
              value: JSON.stringify(selectedRequest.headers, null, 2),
            },
            {
              label: 'Request Body',
              value: selectedRequest.body || 'No body',
            },
            {
              label: 'Response Headers',
              value: selectedRequest.response
                ? JSON.stringify(selectedRequest.response.headers, null, 2)
                : '-',
            },
            {
              label: 'Response Body',
              value: selectedRequest.response?.body || 'No body',
            },
          ]}
          keyExtractor={(item) => item.label}
          renderItem={({ item }) => (
            <Box style={styles.detailRow}>
              <Typography variant="caption" color="secondary" style={styles.detailLabel}>
                {item.label}
              </Typography>
              <Typography
                variant="caption"
                style={styles.detailValue}
                selectable
              >
                {item.value}
              </Typography>
            </Box>
          )}
        />
      </Box>
    );
  };

  return (
    <Box style={styles.container}>
      {/* Controls */}
      <Box style={styles.controls}>
        <Typography variant="caption" color="secondary">
          {requests.length} requests captured
        </Typography>
        <Button
          title="Clear"
          variant="secondary"
          onPress={clearRequests}
          style={styles.clearButton}
        />
      </Box>

      {/* Request List */}
      <FlatList
        data={requests}
        renderItem={renderRequestItem}
        keyExtractor={(item) => item.id}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <Box style={styles.empty}>
            <Typography color="secondary">No network requests captured</Typography>
            <Typography variant="caption" color="secondary" style={styles.emptyHint}>
              Make some API calls to see them here
            </Typography>
          </Box>
        }
      />

      {/* Details Panel */}
      {selectedRequest && renderRequestDetails()}
    </Box>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
  },
  clearButton: {},
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingBottom: 20,
  },
  requestItem: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  requestHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  methodBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 8,
  },
  methodText: {
    fontWeight: '600',
    fontSize: 10,
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 8,
  },
  statusText: {
    fontWeight: '600',
    fontSize: 10,
  },
  time: {
    fontSize: 11,
    marginLeft: 'auto',
  },
  path: {
    fontFamily: 'monospace',
    fontSize: 12,
    marginBottom: 4,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyHint: {
    marginTop: 4,
  },
  detailsPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '70%',
    borderTopWidth: 1,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
  },
  detailsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  detailsTitle: {
    fontWeight: 'bold',
  },
  detailRow: {
    marginBottom: 12,
  },
  detailLabel: {
    fontWeight: '600',
    marginBottom: 4,
  },
  detailValue: {
    fontFamily: 'monospace',
    fontSize: 11,
  },
});
