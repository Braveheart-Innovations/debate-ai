import React from 'react';
import { Modal, View, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Typography, SheetHeader, Button } from '@/components/molecules';
import { useTheme } from '@/theme';

interface DemoDebatePickerModalProps {
  visible: boolean;
  loading?: boolean;
  samples: Array<{ id: string; title: string; topic: string }>;
  onSelect: (sample: { id: string; title: string; topic: string }) => void;
  onClose: () => void;
}

export const DemoDebatePickerModal: React.FC<DemoDebatePickerModalProps> = ({ visible, loading = false, samples, onSelect, onClose }) => {
  const { theme } = useTheme();

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: theme.colors.background, borderColor: theme.colors.border }]}> 
          <SheetHeader title="Choose a Demo Debate" onClose={onClose} showHandle />
          <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ padding: 12 }}>
            {loading && (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={theme.colors.primary[500]} />
                <Typography variant="caption" color="secondary" style={{ marginTop: 12 }}>
                  Loading demo debates…
                </Typography>
              </View>
            )}
            {!loading && samples.length === 0 && (
              <View style={styles.emptyState}>
                <Typography variant="body" weight="semibold" align="center">
                  No demo debates available for this pairing yet.
                </Typography>
                <Typography variant="caption" color="secondary" align="center" style={{ marginTop: 8 }}>
                  Try another combination of AIs.
                </Typography>
              </View>
            )}
            {!loading && samples.map((it) => (
              <TouchableOpacity
                key={it.id}
                style={[styles.item, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}
                onPress={() => onSelect(it)}
              >
                <Typography variant="body" weight="semibold" style={{ marginBottom: 4 }}>
                  {it.title || it.topic}
                </Typography>
                <Typography variant="caption" color="secondary">Motion: {it.topic}</Typography>
              </TouchableOpacity>
            ))}
            {!loading && samples.length > 0 && (
              <Button
                title="Cancel"
                variant="ghost"
                fullWidth
                onPress={onClose}
                style={{ marginTop: 4 }}
              />
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  sheet: {
    width: '100%',
    maxWidth: 560,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  item: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
  },
  loadingRow: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    paddingHorizontal: 12,
  },
});

export default DemoDebatePickerModal;
