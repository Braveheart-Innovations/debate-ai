import React from 'react';
import { Modal, View, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Typography, SheetHeader } from '@/components/molecules';
import { useTheme } from '@/theme';
import { DemoContentService } from '@/services/demo/DemoContentService';

interface CompareSamplePickerModalProps {
  visible: boolean;
  providers: string[];
  onSelect: (sampleId: string) => void;
  onClose: () => void;
}

export const CompareSamplePickerModal: React.FC<CompareSamplePickerModalProps> = ({ visible, providers, onSelect, onClose }) => {
  const { theme } = useTheme();
  const [items, setItems] = React.useState<Array<{ id: string; title: string }>>([]);
  const [loading, setLoading] = React.useState(false);

  const refreshItems = React.useCallback(() => {
    let cancelled = false;
    const run = async () => {
      try {
        setLoading(true);
        const list = await DemoContentService.listCompareSamples(providers);
        if (!cancelled) {
          setItems(list);
        }
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [providers]);

  React.useEffect(() => {
    if (!visible) return;
    const dispose = refreshItems();
    return () => {
      dispose?.();
    };
  }, [visible, refreshItems]);

  React.useEffect(() => {
    if (!visible) return;
    const unsubscribe = DemoContentService.subscribe(() => {
      refreshItems();
    });
    return () => {
      unsubscribe();
    };
  }, [visible, refreshItems]);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: theme.colors.background, borderColor: theme.colors.border }]}> 
          <SheetHeader title="Choose a Comparison" onClose={onClose} showHandle />
          <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ padding: 12 }}>
            {loading && items.length === 0 && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator color={theme.colors.primary[500]} />
              </View>
            )}
            {items.map((it) => (
              <TouchableOpacity
                key={it.id}
                style={[styles.item, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}
                onPress={() => onSelect(it.id)}
              >
                <Typography variant="body" weight="semibold">{it.title}</Typography>
                <Typography variant="caption" color="secondary">{it.id}</Typography>
              </TouchableOpacity>
            ))}
            {!loading && items.length === 0 && (
              <View style={styles.emptyState}>
                <Typography variant="caption" color="secondary" style={{ textAlign: 'center' }}>
                  No demo comparisons available for this pair yet.
                </Typography>
              </View>
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
  loadingContainer: {
    paddingVertical: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    paddingVertical: 24,
    paddingHorizontal: 12,
  },
});

export default CompareSamplePickerModal;
