import React, { useEffect, useMemo } from 'react';
import { Keyboard, Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme';
import { Typography, SheetHeader } from '@/components/molecules';
import { AI_PROVIDERS } from '@/config/aiProviders';
import { ProviderOptionList, ProviderPickerItem } from './ProviderOptionList';

export type { ProviderPickerItem } from './ProviderOptionList';

interface ProviderPickerSheetProps {
  visible: boolean;
  onClose: () => void;
  onSelectProvider: (providerId: string) => void;
  selectedProviderIds: string[];
  configuredProviderIds: string[];
  /** When set (demo mode), only these providers are listed and Add-key rows are hidden. */
  allowedProviderIds?: string[];
  /** Compare allows the same provider on both sides (different models). */
  allowDuplicates?: boolean;
  /** Routes to API configuration for that provider; the sheet closes first. */
  onRequestAddKey?: (providerId: string) => void;
  /** Catalog override (e.g. Create's media providers). Defaults to enabled AI_PROVIDERS. */
  providers?: ProviderPickerItem[];
  /** One line under the title saying why the sheet opened (e.g. a blocked send). */
  message?: string | null;
  testID?: string;
}

/**
 * Bottom sheet listing providers for the composer's [+] Add AI chip.
 * Keyed providers are selectable; un-keyed ones are dimmed and route to
 * that provider's API key card.
 */
export const ProviderPickerSheet: React.FC<ProviderPickerSheetProps> = ({
  visible,
  onClose,
  onSelectProvider,
  selectedProviderIds,
  configuredProviderIds,
  allowedProviderIds,
  allowDuplicates = false,
  onRequestAddKey,
  providers: providersProp,
  message,
  testID,
}) => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  // A composer input left focused keeps the keyboard up behind the sheet,
  // and the list's first tap would only dismiss it.
  useEffect(() => {
    if (visible) Keyboard.dismiss();
  }, [visible]);

  const providers = useMemo<ProviderPickerItem[]>(
    () =>
      (providersProp ?? AI_PROVIDERS.filter(provider => provider.enabled)).filter(
        provider => !allowedProviderIds || allowedProviderIds.includes(provider.id)
      ),
    [providersProp, allowedProviderIds]
  );

  const handleSelect = (providerId: string) => {
    onSelectProvider(providerId);
    onClose();
  };

  const handleAddKey = onRequestAddKey
    ? (providerId: string) => {
        onClose();
        onRequestAddKey(providerId);
      }
    : undefined;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
          accessibilityLabel="Close AI picker"
          testID={testID ? `${testID}-backdrop` : undefined}
        />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: theme.colors.background,
              paddingBottom: insets.bottom + 16,
            },
          ]}
        >
          <SheetHeader title="Add an AI" onClose={onClose} showHandle testID={testID} />
          {message ? (
            <View style={styles.message} testID={testID ? `${testID}-message` : undefined}>
              <Typography variant="caption" color="secondary">
                {message}
              </Typography>
            </View>
          ) : null}
          <ScrollView
            style={styles.list}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <ProviderOptionList
              providers={providers}
              configuredProviderIds={configuredProviderIds}
              selectedProviderIds={selectedProviderIds}
              allowDuplicates={allowDuplicates}
              onSelectProvider={handleSelect}
              onRequestAddKey={handleAddKey}
              testID={testID ? `${testID}-list` : undefined}
            />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    maxHeight: '75%',
  },
  message: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  list: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
});

export default ProviderPickerSheet;
