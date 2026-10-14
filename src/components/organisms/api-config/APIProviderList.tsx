import React from 'react';
import { StyleSheet } from 'react-native';
import { Box } from '@/components/atoms';
import { Typography } from '@/components/molecules';
import { ProviderCard } from './ProviderCard';
import { AIProvider } from '@/config/aiProviders';
import { DEFAULT_PARAMETERS } from '@/config/modelConfigs';
import { useTheme } from '@/theme';
import { getAPIKeyProviderId } from '@/utils/typeGuards';

export interface APIProviderListProps {
  providers: AIProvider[];
  apiKeys: Record<string, string>;
  verificationStatus: Record<string, {
    status: 'idle' | 'testing' | 'success' | 'failed';
    message?: string;
    model?: string;
  }>;
  onKeyChange?: (providerId: string, key: string) => void;
  onTest: (providerId: string, keyOverride?: string) => Promise<{ success: boolean; message?: string; model?: string; }>;
  onSave: (providerId: string, keyOverride?: string) => Promise<void>;
  onToggleExpand: (providerId: string) => void;
  expandedProvider: string | null;
  expertModeConfigs: Record<string, { enabled: boolean; selectedModel?: string; parameters?: Record<string, number>; }>;
  testID?: string;
  /** Callback when user wants to get an API key for a provider. */
  onGetApiKey?: (providerId: string) => void;
  /** Provider ID that has a detected clipboard key. */
  clipboardKeyProviderId?: string | null;
  /** Callback to use the detected clipboard key for a provider. */
  onUseClipboardKey?: (providerId: string) => void;
  /** Reports each provider card's y offset within the list (for scroll-to). */
  onProviderLayout?: (providerId: string, y: number) => void;
}

export const APIProviderList: React.FC<APIProviderListProps> = ({
  providers,
  apiKeys,
  verificationStatus,
  onKeyChange,
  onTest,
  onSave,
  onToggleExpand,
  expandedProvider,
  expertModeConfigs,
  testID,
  onGetApiKey,
  clipboardKeyProviderId,
  onUseClipboardKey,
  onProviderLayout,
}) => {
  const { theme } = useTheme();

  if (!providers || providers.length === 0) {
    return (
      <Box style={styles.emptyContainer} testID={testID}>
        <Typography variant="body" color="secondary" align="center">
          No AI providers available
        </Typography>
      </Box>
    );
  }

  return (
    <Box style={styles.container} testID={testID}>
      <Typography variant="title" style={styles.sectionTitle}>
        Available AI Services
      </Typography>
      
      {providers.map((provider, index) => {
        const providerKey = getAPIKeyProviderId(provider.id);
        const expertConfig = (providerKey && expertModeConfigs[providerKey]) || { 
          enabled: false, 
          parameters: DEFAULT_PARAMETERS 
        };
        const isExpanded = expandedProvider === provider.id;
        
        return (
          <Box
            key={provider.id}
            style={[styles.providerContainer, { marginBottom: theme.spacing.lg }]}
            onLayout={
              onProviderLayout
                ? (event) => onProviderLayout(provider.id, event.nativeEvent.layout.y)
                : undefined
            }
          >
            <ProviderCard
              provider={provider}
              apiKey={apiKeys[provider.id] || ''}
              onKeyChange={onKeyChange ? (key) => onKeyChange(provider.id, key) : undefined}
              onTest={(keyOverride) => (
                keyOverride === undefined ? onTest(provider.id) : onTest(provider.id, keyOverride)
              )}
              onSave={(keyOverride) => (
                keyOverride === undefined ? onSave(provider.id) : onSave(provider.id, keyOverride)
              )}
              isExpanded={isExpanded}
              onToggleExpand={() => onToggleExpand(provider.id)}
              index={index}
              testStatus={verificationStatus[provider.id]?.status}
              testStatusMessage={verificationStatus[provider.id]?.message}
              verifiedModel={verificationStatus[provider.id]?.model}
              selectedModel={expertConfig.enabled ? expertConfig.selectedModel : undefined}
              expertModeEnabled={expertConfig.enabled === true}
              onGetApiKey={onGetApiKey ? () => onGetApiKey(provider.id) : undefined}
              clipboardKeyDetected={clipboardKeyProviderId === provider.id}
              onUseClipboardKey={onUseClipboardKey ? () => onUseClipboardKey(provider.id) : undefined}
            />
          </Box>
        );
      })}
    </Box>
  );
};

const styles = StyleSheet.create({
  container: {
    // Main container styles
  },
  emptyContainer: {
    padding: 32,
  },
  sectionTitle: {
    marginBottom: 16,
  },
  providerContainer: {
    // Individual provider container styles
  },
  expertModeContainer: {
    // Expert mode settings container styles
  },
});
