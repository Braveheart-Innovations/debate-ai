import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/theme';
import { Typography } from '@/components/molecules';
import { AIAvatar } from '../common/AIAvatar';
import { getAIProviderIcon } from '@/utils/aiProviderAssets';

/** Minimal provider row data; AI_PROVIDERS entries satisfy it structurally. */
export interface ProviderPickerItem {
  id: string;
  name: string;
  company: string;
  color: string;
}

export interface ProviderOptionListProps {
  providers: ProviderPickerItem[];
  configuredProviderIds: string[];
  selectedProviderIds: string[];
  /** Compare and Debate allow the same provider more than once (different models). */
  allowDuplicates?: boolean;
  onSelectProvider: (providerId: string) => void;
  /** Un-keyed rows show an "Add key" action when set (hidden in demo mode). */
  onRequestAddKey?: (providerId: string) => void;
  testID?: string;
}

/**
 * Provider rows shared by the composer's Add-AI sheet and the Debate slot
 * sheet's "Change provider" page. Keyed providers are selectable; un-keyed
 * ones are dimmed with an "Add key" action for that provider.
 */
export const ProviderOptionList: React.FC<ProviderOptionListProps> = ({
  providers,
  configuredProviderIds,
  selectedProviderIds,
  allowDuplicates = false,
  onSelectProvider,
  onRequestAddKey,
  testID,
}) => {
  const { theme } = useTheme();

  const handleSelect = (providerId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onSelectProvider(providerId);
  };

  return (
    <View testID={testID}>
      {providers.map(provider => {
        const iconData = getAIProviderIcon(provider.id);
        const isConfigured = configuredProviderIds.includes(provider.id);
        const isSelected = selectedProviderIds.includes(provider.id);
        const isBlocked = isSelected && !allowDuplicates;
        const canSelect = isConfigured && !isBlocked;
        const showAddKey = !isConfigured && Boolean(onRequestAddKey);

        return (
          <TouchableOpacity
            key={provider.id}
            onPress={() => {
              if (canSelect) handleSelect(provider.id);
              else if (showAddKey) onRequestAddKey?.(provider.id);
            }}
            disabled={!canSelect && !showAddKey}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={showAddKey ? `Add API key for ${provider.name}` : provider.name}
            accessibilityState={{ disabled: !canSelect && !showAddKey, selected: isSelected }}
            style={[
              styles.row,
              {
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.card,
              },
            ]}
            testID={testID ? `${testID}-row-${provider.id}` : undefined}
          >
            <View style={[styles.rowIdentity, { opacity: isConfigured ? 1 : 0.55 }]}>
              <AIAvatar
                icon={iconData.icon}
                iconType={iconData.iconType}
                size="small"
                color={provider.color}
              />
              <View style={styles.rowText}>
                <Typography variant="body" weight="medium">
                  {provider.name}
                </Typography>
                <Typography variant="caption" color="secondary">
                  {provider.company}
                </Typography>
              </View>
            </View>
            {isBlocked ? (
              <View style={styles.rowTrailing}>
                <Ionicons name="checkmark-circle" size={20} color={theme.colors.success[500]} />
                <Typography variant="caption" color="secondary">
                  Added
                </Typography>
              </View>
            ) : showAddKey ? (
              <View style={[styles.addKeyChip, { borderColor: theme.colors.primary[400] }]}>
                <Typography
                  variant="caption"
                  weight="medium"
                  style={{ color: theme.colors.primary[500] }}
                >
                  Add key
                </Typography>
              </View>
            ) : canSelect ? (
              <Ionicons name="add-circle-outline" size={22} color={theme.colors.text.secondary} />
            ) : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  rowIdentity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowText: {
    flex: 1,
  },
  rowTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addKeyChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
});

export default ProviderOptionList;
