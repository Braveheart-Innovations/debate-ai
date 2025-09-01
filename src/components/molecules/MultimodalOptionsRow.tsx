import React, { useMemo } from 'react';
import { View, TouchableOpacity, StyleSheet, useWindowDimensions, Alert } from 'react-native';
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

interface MultimodalOptionsRowProps {
  availability: MultimodalAvailability;
  availabilityReasons?: Partial<Record<ModalityKey, string>>;
  onSelect: (modality: ModalityKey) => void;
  onClose: () => void;
}

const MultimodalOptionsRow: React.FC<MultimodalOptionsRowProps> = ({ availability, availabilityReasons, onSelect, onClose }) => {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const compact = width < 360;
  const showReasons = width >= 420;

  const items = useMemo(() => ([
    { key: 'imageUpload' as const, icon: 'image-outline' as const, label: 'Image', enabled: availability.imageUpload },
    { key: 'documentUpload' as const, icon: 'document-text-outline' as const, label: 'Doc', enabled: availability.documentUpload },
    { key: 'imageGeneration' as const, icon: 'color-palette-outline' as const, label: 'Gen', enabled: availability.imageGeneration },
    // Video removed for v1
    { key: 'voice' as const, icon: 'mic-outline' as const, label: 'Voice', enabled: availability.voice },
  ]), [availability]);

  return (
    <View style={[styles.container, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface, paddingVertical: compact ? 4 : 6 }]}> 
      <View style={[styles.items, { paddingHorizontal: compact ? 8 : 12 }]}>
        {items.map(item => (
          <View key={item.key} style={styles.actionWrap}>
            <TouchableOpacity
              onPress={() => {
                if (item.enabled) {
                  onClose();
                  onSelect(item.key);
                } else if (availabilityReasons?.[item.key]) {
                  Alert.alert('Unavailable', availabilityReasons[item.key]!);
                }
              }}
              style={[styles.action, { opacity: item.enabled ? 1 : 0.5 }]}
              accessibilityLabel={item.enabled ? item.label : `${item.label} unavailable`}
              accessibilityHint={item.enabled ? undefined : availabilityReasons?.[item.key]}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Ionicons name={item.icon} size={compact ? 18 : 20} color={item.enabled ? theme.colors.primary[600] : theme.colors.text.secondary} />
            </TouchableOpacity>
            {!compact && (
              <Typography variant="caption" color={item.enabled ? 'primary' : 'secondary'}>
                {item.label}
              </Typography>
            )}
            {!compact && showReasons && !item.enabled && availabilityReasons?.[item.key] && (
              <Typography variant="caption" color="secondary" style={styles.reason}>
                {(availabilityReasons[item.key] as string).length > 22
                  ? `${(availabilityReasons[item.key] as string).slice(0, 22)}…`
                  : availabilityReasons[item.key]}
              </Typography>
            )}
          </View>
        ))}
      </View>
      <TouchableOpacity onPress={onClose} style={[styles.close, { borderColor: theme.colors.border, backgroundColor: theme.colors.background }]} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
        <Ionicons name="close" size={compact ? 16 : 18} color={theme.colors.text.primary} />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
  },
  items: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'space-evenly',
  },
  actionWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 2 },
  action: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reason: { maxWidth: 64, textAlign: 'center' },
  close: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  }
});

export default MultimodalOptionsRow;
