import React, { useMemo, useState } from 'react';
import { TouchableOpacity, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme';
import { Typography } from './Typography';

export type ModalityKey = 'imageUpload' | 'documentUpload' | 'imageGeneration' | 'videoGeneration' | 'voice';

export interface MultimodalAvailability {
  imageUpload: boolean;
  documentUpload: boolean;
  imageGeneration: boolean;
  videoGeneration: boolean;
  voice: boolean;
}

interface MultimodalButtonProps {
  availability: MultimodalAvailability;
  onSelect: (modality: ModalityKey) => void;
  disabled?: boolean;
  availabilityReasons?: Partial<Record<ModalityKey, string>>;
}

export const MultimodalButton: React.FC<MultimodalButtonProps> = ({ availability, onSelect, disabled = false, availabilityReasons }) => {
  const { theme } = useTheme();
  const [expanded, setExpanded] = useState(false);

  const items = useMemo(() => ([
    { key: 'imageUpload' as const, icon: 'image-outline' as const, label: 'Image', enabled: availability.imageUpload },
    { key: 'documentUpload' as const, icon: 'document-text-outline' as const, label: 'Doc', enabled: availability.documentUpload },
    { key: 'imageGeneration' as const, icon: 'color-palette-outline' as const, label: 'Gen', enabled: availability.imageGeneration },
    { key: 'videoGeneration' as const, icon: 'film-outline' as const, label: 'Video', enabled: availability.videoGeneration },
    { key: 'voice' as const, icon: 'mic-outline' as const, label: 'Voice', enabled: availability.voice },
  ]), [availability]);

  return (
    <View style={styles.container}>
      {expanded && (
        <View style={[styles.row, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}> 
          {items.map(item => (
            <View key={item.key} style={styles.actionWrap}>
              <TouchableOpacity
                onPress={() => {
                  if (disabled) return;
                  if (item.enabled) {
                    setExpanded(false);
                    onSelect(item.key);
                  } else if (availabilityReasons?.[item.key]) {
                    const { Alert } = require('react-native');
                    Alert.alert('Unavailable', availabilityReasons[item.key]!);
                  }
                }}
                disabled={disabled}
                style={[styles.action, { opacity: item.enabled ? 1 : 0.5 }]}
                accessibilityLabel={item.enabled ? item.label : `${item.label} unavailable`}
                accessibilityHint={item.enabled ? undefined : availabilityReasons?.[item.key]}
              >
                <Ionicons name={item.icon} size={18} color={item.enabled ? theme.colors.primary[600] : theme.colors.text.secondary} />
              </TouchableOpacity>
              <Typography variant="caption" color={item.enabled ? 'primary' : 'secondary'}>
                {item.label}
              </Typography>
              {!item.enabled && availabilityReasons?.[item.key] && (
                <Typography variant="caption" color="secondary" style={styles.reason}>
                  {(availabilityReasons[item.key] as string).length > 22
                    ? `${(availabilityReasons[item.key] as string).slice(0, 22)}…`
                    : availabilityReasons[item.key]}
                </Typography>
              )}
            </View>
          ))}
        </View>
      )}

      <TouchableOpacity
        onPress={() => !disabled && setExpanded(!expanded)}
        activeOpacity={0.8}
        style={[styles.fab, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}
      >
        <Ionicons name={expanded ? 'close' : 'add'} size={18} color={theme.colors.text.primary} />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', marginRight: 8 },
  fab: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 6,
    paddingVertical: 4,
    marginRight: 8,
    gap: 6,
  },
  actionWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 2, minWidth: 44 },
  action: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reason: { maxWidth: 64, textAlign: 'center' },
});

export default MultimodalButton;
