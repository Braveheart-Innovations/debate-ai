import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, Switch, ScrollView, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Box } from '@/components/atoms';
import { Typography, Button } from '@/components/molecules';
import { useTheme } from '@/theme';
import { CrashlyticsService } from '@/services/crashlytics';
import { Logger } from '@/services/logging';

const FEATURE_FLAGS_KEY = '@debug_feature_flags';

interface FeatureFlag {
  key: string;
  label: string;
  description: string;
  defaultValue: boolean;
}

const AVAILABLE_FLAGS: FeatureFlag[] = [
  {
    key: 'verbose_logging',
    label: 'Verbose Logging',
    description: 'Enable DEBUG level logs in production',
    defaultValue: false,
  },
  {
    key: 'network_logging',
    label: 'Network Logging',
    description: 'Log all network requests to console',
    defaultValue: false,
  },
  {
    key: 'mock_premium',
    label: 'Mock Premium',
    description: 'Simulate premium subscription status',
    defaultValue: false,
  },
  {
    key: 'disable_analytics',
    label: 'Disable Analytics',
    description: 'Disable all analytics tracking',
    defaultValue: false,
  },
];

export const FeatureFlags: React.FC = () => {
  const { theme } = useTheme();
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFlags();
  }, []);

  const loadFlags = async () => {
    try {
      const stored = await AsyncStorage.getItem(FEATURE_FLAGS_KEY);
      if (stored) {
        setFlags(JSON.parse(stored));
      } else {
        // Initialize with defaults
        const defaults: Record<string, boolean> = {};
        AVAILABLE_FLAGS.forEach((flag) => {
          defaults[flag.key] = flag.defaultValue;
        });
        setFlags(defaults);
      }
    } catch (error) {
      console.error('Failed to load feature flags:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveFlags = async (newFlags: Record<string, boolean>) => {
    try {
      await AsyncStorage.setItem(FEATURE_FLAGS_KEY, JSON.stringify(newFlags));
    } catch (error) {
      console.error('Failed to save feature flags:', error);
    }
  };

  const toggleFlag = useCallback(
    (key: string) => {
      const newFlags = { ...flags, [key]: !flags[key] };
      setFlags(newFlags);
      saveFlags(newFlags);

      // Apply flag effects immediately
      applyFlagEffect(key, newFlags[key]);
    },
    [flags]
  );

  const applyFlagEffect = (key: string, value: boolean) => {
    const logger = Logger.getInstance();

    switch (key) {
      case 'verbose_logging':
        logger.setMinLevel(value ? 0 : __DEV__ ? 0 : 2);
        break;
      case 'network_logging':
        logger.setConsoleOutput(value);
        break;
      // Other flags are read directly from flags state
    }
  };

  const resetFlags = useCallback(() => {
    Alert.alert(
      'Reset Feature Flags',
      'This will reset all flags to their default values.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            const defaults: Record<string, boolean> = {};
            AVAILABLE_FLAGS.forEach((flag) => {
              defaults[flag.key] = flag.defaultValue;
              applyFlagEffect(flag.key, flag.defaultValue);
            });
            setFlags(defaults);
            await saveFlags(defaults);
          },
        },
      ]
    );
  }, []);

  const testCrashlytics = useCallback(() => {
    Alert.alert(
      'Test Crashlytics',
      'This will send a test error to Crashlytics.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send Test Error',
          onPress: () => {
            const testError = new Error('Debug Menu Test Error');
            CrashlyticsService.recordError(testError, {
              source: 'debug_menu',
              type: 'test_error',
            });
            Alert.alert('Success', 'Test error sent to Crashlytics');
          },
        },
      ]
    );
  }, []);

  if (loading) {
    return (
      <Box style={styles.loading}>
        <Typography color="secondary">Loading flags...</Typography>
      </Box>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Typography variant="subtitle" style={styles.sectionTitle}>
        Feature Flags
      </Typography>
      <Typography variant="caption" color="secondary" style={styles.sectionDesc}>
        Toggle experimental features for testing
      </Typography>

      {AVAILABLE_FLAGS.map((flag) => (
        <Box
          key={flag.key}
          style={[styles.flagRow, { borderBottomColor: theme.colors.border }]}
        >
          <Box style={styles.flagInfo}>
            <Typography style={styles.flagLabel}>{flag.label}</Typography>
            <Typography variant="caption" color="secondary">
              {flag.description}
            </Typography>
          </Box>
          <Switch
            value={flags[flag.key] ?? flag.defaultValue}
            onValueChange={() => toggleFlag(flag.key)}
            trackColor={{
              false: theme.colors.border,
              true: theme.colors.primary[500] + '80',
            }}
            thumbColor={
              flags[flag.key] ? theme.colors.primary[500] : '#f4f3f4'
            }
          />
        </Box>
      ))}

      <Box style={styles.actions}>
        <Button
          title="Reset All Flags"
          variant="secondary"
          onPress={resetFlags}
          style={styles.actionButton}
        />
      </Box>

      <Typography variant="subtitle" style={[styles.sectionTitle, styles.debugSection]}>
        Debug Actions
      </Typography>

      <Box style={styles.actions}>
        <Button
          title="Test Crashlytics Error"
          variant="secondary"
          onPress={testCrashlytics}
          style={styles.actionButton}
        />
      </Box>

      <Box style={[styles.info, { backgroundColor: theme.colors.surface }]}>
        <Typography variant="caption" color="secondary">
          Feature flags are persisted locally and will survive app restarts.
          Changes take effect immediately.
        </Typography>
      </Box>
    </ScrollView>
  );
};

// Export a function to read flags from other parts of the app
export const getFeatureFlag = async (key: string): Promise<boolean> => {
  try {
    const stored = await AsyncStorage.getItem(FEATURE_FLAGS_KEY);
    if (stored) {
      const flags = JSON.parse(stored);
      return flags[key] ?? false;
    }
  } catch {
    // Ignore
  }
  return false;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontWeight: 'bold',
    marginBottom: 4,
  },
  sectionDesc: {
    marginBottom: 16,
  },
  flagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  flagInfo: {
    flex: 1,
    marginRight: 16,
  },
  flagLabel: {
    fontWeight: '500',
    marginBottom: 2,
  },
  actions: {
    marginTop: 16,
    gap: 12,
  },
  actionButton: {
    alignSelf: 'stretch',
  },
  debugSection: {
    marginTop: 32,
  },
  info: {
    marginTop: 24,
    padding: 12,
    borderRadius: 8,
  },
});
