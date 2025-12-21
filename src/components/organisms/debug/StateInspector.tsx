import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Clipboard,
  Alert,
} from 'react-native';
import { useSelector } from 'react-redux';
import { Box } from '@/components/atoms';
import { Typography } from '@/components/molecules';
import { useTheme } from '@/theme';
import { RootState } from '@/store';

interface TreeNodeProps {
  keyName: string;
  value: unknown;
  depth: number;
  searchQuery: string;
}

const TreeNode: React.FC<TreeNodeProps> = ({
  keyName,
  value,
  depth,
  searchQuery,
}) => {
  const { theme } = useTheme();
  const [isExpanded, setIsExpanded] = useState(depth < 1);

  const isObject = value !== null && typeof value === 'object';
  const isArray = Array.isArray(value);
  const entries = isObject ? Object.entries(value as object) : [];
  const hasChildren = entries.length > 0;

  const matchesSearch =
    searchQuery &&
    (keyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (!isObject &&
        String(value).toLowerCase().includes(searchQuery.toLowerCase())));

  const copyValue = useCallback(() => {
    const text =
      typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    Clipboard.setString(text);
    Alert.alert('Copied', 'Value copied to clipboard');
  }, [value]);

  const getValueColor = (val: unknown): string => {
    if (val === null) return '#9CA3AF';
    if (typeof val === 'string') return '#22C55E';
    if (typeof val === 'number') return '#3B82F6';
    if (typeof val === 'boolean') return '#F59E0B';
    return theme.colors.text.primary;
  };

  const getValueDisplay = (val: unknown): string => {
    if (val === null) return 'null';
    if (val === undefined) return 'undefined';
    if (typeof val === 'string') {
      if (val.length > 50) return `"${val.substring(0, 47)}..."`;
      return `"${val}"`;
    }
    if (typeof val === 'boolean') return val ? 'true' : 'false';
    if (typeof val === 'number') return String(val);
    return '';
  };

  const getTypeLabel = (): string => {
    if (isArray) return `Array(${entries.length})`;
    if (isObject) return `Object(${entries.length})`;
    return '';
  };

  return (
    <Box style={[styles.node, { marginLeft: depth * 16 }]}>
      <TouchableOpacity
        style={[
          styles.nodeHeader,
          matchesSearch && { backgroundColor: theme.colors.primary[500] + '20' },
        ]}
        onPress={() => hasChildren && setIsExpanded(!isExpanded)}
        onLongPress={copyValue}
      >
        {hasChildren && (
          <Typography style={styles.expandIcon}>
            {isExpanded ? '▼' : '▶'}
          </Typography>
        )}

        <Typography style={styles.keyName} variant="caption">
          {keyName}:
        </Typography>

        {isObject ? (
          <Typography variant="caption" color="secondary" style={styles.typeLabel}>
            {getTypeLabel()}
          </Typography>
        ) : (
          <Typography
            variant="caption"
            style={[styles.value, { color: getValueColor(value) }]}
            numberOfLines={1}
          >
            {getValueDisplay(value)}
          </Typography>
        )}
      </TouchableOpacity>

      {isExpanded &&
        hasChildren &&
        entries.map(([childKey, childValue]) => (
          <TreeNode
            key={childKey}
            keyName={childKey}
            value={childValue}
            depth={depth + 1}
            searchQuery={searchQuery}
          />
        ))}
    </Box>
  );
};

export const StateInspector: React.FC = () => {
  const { theme } = useTheme();
  const state = useSelector((s: RootState) => s);
  const [searchQuery, setSearchQuery] = useState('');

  const stateSlices = Object.entries(state);

  return (
    <Box style={styles.container}>
      {/* Search */}
      <Box style={styles.searchContainer}>
        <TextInput
          style={[
            styles.searchInput,
            {
              backgroundColor: theme.colors.surface,
              color: theme.colors.text.primary,
              borderColor: theme.colors.border,
            },
          ]}
          placeholder="Search state..."
          placeholderTextColor={theme.colors.text.secondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </Box>

      {/* State Tree */}
      <ScrollView style={styles.tree} contentContainerStyle={styles.treeContent}>
        {stateSlices.map(([sliceName, sliceValue]) => (
          <TreeNode
            key={sliceName}
            keyName={sliceName}
            value={sliceValue}
            depth={0}
            searchQuery={searchQuery}
          />
        ))}
      </ScrollView>

      {/* Footer */}
      <Box style={[styles.footer, { borderTopColor: theme.colors.border }]}>
        <Typography variant="caption" color="secondary">
          Long press any value to copy
        </Typography>
      </Box>
    </Box>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchContainer: {
    padding: 12,
  },
  searchInput: {
    height: 40,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  tree: {
    flex: 1,
  },
  treeContent: {
    paddingHorizontal: 12,
    paddingBottom: 20,
  },
  node: {
    marginBottom: 2,
  },
  nodeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderRadius: 4,
  },
  expandIcon: {
    width: 16,
    fontSize: 10,
    marginRight: 4,
  },
  keyName: {
    fontWeight: '600',
    marginRight: 4,
    color: '#8B5CF6',
  },
  typeLabel: {
    fontStyle: 'italic',
  },
  value: {
    flex: 1,
  },
  footer: {
    padding: 12,
    borderTopWidth: 1,
    alignItems: 'center',
  },
});
