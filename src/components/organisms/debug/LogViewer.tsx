import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Clipboard,
  Alert,
} from 'react-native';
import { Box } from '@/components/atoms';
import { Typography, Button } from '@/components/molecules';
import { useTheme } from '@/theme';
import { Logger, LogLevel, LogEntry } from '@/services/logging';

const LOG_LEVEL_COLORS: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: '#9CA3AF',
  [LogLevel.INFO]: '#3B82F6',
  [LogLevel.WARN]: '#F59E0B',
  [LogLevel.ERROR]: '#EF4444',
};

const LOG_LEVEL_NAMES: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.ERROR]: 'ERROR',
};

export const LogViewer: React.FC = () => {
  const { theme } = useTheme();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filterLevel, setFilterLevel] = useState<LogLevel>(LogLevel.DEBUG);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    const logger = Logger.getInstance();

    // Initial load
    setLogs(logger.getBuffer());

    // Subscribe to updates
    const unsubscribe = logger.addListener(() => {
      setLogs(logger.getBuffer());
    });

    return unsubscribe;
  }, []);

  const filteredLogs = logs.filter((log) => {
    if (log.level < filterLevel) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        log.message.toLowerCase().includes(query) ||
        JSON.stringify(log.context).toLowerCase().includes(query)
      );
    }
    return true;
  });

  const toggleExpanded = useCallback((timestamp: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(timestamp)) {
        next.delete(timestamp);
      } else {
        next.add(timestamp);
      }
      return next;
    });
  }, []);

  const copyLog = useCallback((log: LogEntry) => {
    const text = `[${LOG_LEVEL_NAMES[log.level]}] ${new Date(log.timestamp).toISOString()}\n${log.message}\n${log.context ? JSON.stringify(log.context, null, 2) : ''}`;
    Clipboard.setString(text);
    Alert.alert('Copied', 'Log entry copied to clipboard');
  }, []);

  const clearLogs = useCallback(() => {
    Logger.getInstance().clearBuffer();
    setLogs([]);
  }, []);

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const renderLogEntry = ({ item }: { item: LogEntry }) => {
    const isExpanded = expandedIds.has(item.timestamp);
    const levelColor = LOG_LEVEL_COLORS[item.level];

    return (
      <TouchableOpacity
        onPress={() => toggleExpanded(item.timestamp)}
        onLongPress={() => copyLog(item)}
        style={[styles.logEntry, { borderLeftColor: levelColor }]}
      >
        <Box style={styles.logHeader}>
          <Box
            style={[styles.levelBadge, { backgroundColor: levelColor + '20' }]}
          >
            <Typography
              style={[styles.levelText, { color: levelColor }]}
              variant="caption"
            >
              {LOG_LEVEL_NAMES[item.level]}
            </Typography>
          </Box>
          <Typography variant="caption" color="secondary" style={styles.time}>
            {formatTime(item.timestamp)}
          </Typography>
        </Box>

        <Typography style={styles.message} numberOfLines={isExpanded ? undefined : 2}>
          {item.message}
        </Typography>

        {isExpanded && item.context && (
          <Box style={[styles.context, { backgroundColor: theme.colors.surface }]}>
            <Typography variant="caption" style={styles.contextText}>
              {JSON.stringify(item.context, null, 2)}
            </Typography>
          </Box>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <Box style={styles.container}>
      {/* Controls */}
      <Box style={styles.controls}>
        <TextInput
          style={[
            styles.searchInput,
            {
              backgroundColor: theme.colors.surface,
              color: theme.colors.text.primary,
              borderColor: theme.colors.border,
            },
          ]}
          placeholder="Search logs..."
          placeholderTextColor={theme.colors.text.secondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />

        <Box style={styles.filterButtons}>
          {Object.entries(LOG_LEVEL_NAMES).map(([level, name]) => {
            const numLevel = Number(level) as LogLevel;
            const isActive = filterLevel === numLevel;
            return (
              <TouchableOpacity
                key={level}
                style={[
                  styles.filterButton,
                  isActive && {
                    backgroundColor: LOG_LEVEL_COLORS[numLevel] + '30',
                    borderColor: LOG_LEVEL_COLORS[numLevel],
                  },
                ]}
                onPress={() => setFilterLevel(numLevel)}
              >
                <Typography
                  variant="caption"
                  style={[
                    styles.filterText,
                    isActive && { color: LOG_LEVEL_COLORS[numLevel] },
                  ]}
                >
                  {name}
                </Typography>
              </TouchableOpacity>
            );
          })}
        </Box>

        <Button
          title="Clear"
          variant="secondary"
          onPress={clearLogs}
          style={styles.clearButton}
        />
      </Box>

      {/* Log List */}
      <FlatList
        data={filteredLogs}
        renderItem={renderLogEntry}
        keyExtractor={(item, index) => `${item.timestamp}-${index}`}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <Box style={styles.empty}>
            <Typography color="secondary">No logs to display</Typography>
          </Box>
        }
      />
    </Box>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  controls: {
    padding: 12,
    gap: 8,
  },
  searchInput: {
    height: 40,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  filterButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  filterButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  filterText: {
    fontWeight: '500',
  },
  clearButton: {
    alignSelf: 'flex-start',
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingBottom: 20,
  },
  logEntry: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderLeftWidth: 3,
    marginBottom: 8,
  },
  logHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  levelBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 8,
  },
  levelText: {
    fontWeight: '600',
    fontSize: 10,
  },
  time: {
    fontSize: 11,
  },
  message: {
    fontSize: 13,
    lineHeight: 18,
  },
  context: {
    marginTop: 8,
    padding: 8,
    borderRadius: 4,
  },
  contextText: {
    fontFamily: 'monospace',
    fontSize: 11,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
});
