import React from 'react';
import { Modal, View, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Typography, SheetHeader, InputField, Button } from '@/components/molecules';
import { useTheme } from '@/theme';
import { DemoContentService } from '@/services/demo/DemoContentService';

interface CompareRecordPickerModalProps {
  visible: boolean;
  leftProvider: string;
  rightProvider: string;
  onSelect: (sel: { type: 'new'; id: string; title: string } | { type: 'existing'; id: string; title: string }) => void;
  onClose: () => void;
}

export const CompareRecordPickerModal: React.FC<CompareRecordPickerModalProps> = ({ visible, leftProvider, rightProvider, onSelect, onClose }) => {
  const { theme } = useTheme();
  const [items, setItems] = React.useState<Array<{ id: string; title: string }>>([]);
  const [creatingNew, setCreatingNew] = React.useState(false);
  const [newId, setNewId] = React.useState('');
  const [newTitle, setNewTitle] = React.useState('');

  React.useEffect(() => {
    const run = async () => {
      if (!visible) return;
      try {
        const list = await DemoContentService.listCompareSamples([leftProvider, rightProvider]);
        setItems(list);
      } catch {
        setItems([]);
      }
    };
    run();
  }, [visible, leftProvider, rightProvider]);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: theme.colors.background, borderColor: theme.colors.border }]}> 
          <SheetHeader title="Record Comparison" onClose={onClose} showHandle />
          <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ padding: 12 }}>
            {!creatingNew && (
              <TouchableOpacity
                style={[styles.item, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}
                onPress={() => setCreatingNew(true)}
              >
                <Typography variant="body" weight="semibold">＋ New sample…</Typography>
                <Typography variant="caption" color="secondary">Enter ID and title</Typography>
              </TouchableOpacity>
            )}
            {creatingNew && (
              <View style={[styles.form, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}> 
                <Typography variant="caption" color="secondary" style={{ marginBottom: 8 }}>
                  New comparison sample
                </Typography>
                <InputField placeholder="e.g., compare_co_custom_v1" value={newId} onChangeText={setNewId} autoCapitalize="none" />
                <View style={{ height: 8 }} />
                <InputField placeholder="Title" value={newTitle} onChangeText={setNewTitle} />
                <View style={{ height: 12 }} />
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
                  <Button title="Cancel" variant="secondary" size="small" onPress={() => { setCreatingNew(false); setNewId(''); setNewTitle(''); }} />
                  <Button title="Create & Start" variant="primary" size="small" onPress={() => {
                    const id = newId.trim();
                    const title = newTitle.trim() || newId.trim();
                    if (!id) return;
                    onSelect({ type: 'new', id, title });
                  }} />
                </View>
              </View>
            )}

            {items.map((it) => (
              <TouchableOpacity
                key={it.id}
                style={[styles.item, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}
                onPress={() => onSelect({ type: 'existing', id: it.id, title: it.title })}
              >
                <Typography variant="body" weight="semibold">{it.title}</Typography>
                <Typography variant="caption" color="secondary">{it.id}</Typography>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  sheet: { width: '100%', maxWidth: 560, borderRadius: 16, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  item: { paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, marginBottom: 8 },
  form: { padding: 12, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, marginBottom: 8 },
});

export default CompareRecordPickerModal;

