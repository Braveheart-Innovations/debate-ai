import React from 'react';
import { Modal, View, ScrollView, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Typography, SheetHeader, InputField, Button } from '@/components/molecules';
import { useTheme } from '@/theme';
import { DemoContentService } from '@/services/demo/DemoContentService';

interface ChatTopicPickerModalProps {
  visible: boolean;
  providers: string[];
  personaId?: string; // only for 1x AI chats
  onSelect: (sampleId: string, title: string) => void;
  onClose: () => void;
}

export const ChatTopicPickerModal: React.FC<ChatTopicPickerModalProps> = ({ visible, providers, personaId, onSelect, onClose }) => {
  const { theme } = useTheme();
  const [items, setItems] = React.useState<Array<{ id: string; title: string }>>([]);
  const [creatingNew, setCreatingNew] = React.useState(false);
  const [newId, setNewId] = React.useState('');
  const [newTitle, setNewTitle] = React.useState('');

  const refreshItems = React.useCallback(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const list = await DemoContentService.listChatSamples(providers);
        if (!cancelled) setItems(list);
      } catch {
        if (!cancelled) setItems([]);
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
          <SheetHeader title="Choose a Chat Topic" onClose={onClose} showHandle />

          {!!personaId && providers.length === 1 && (
            <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
              <Typography variant="caption" color="secondary">
                Persona: {personaId === 'default' ? 'Default' : personaId}
              </Typography>
            </View>
          )}

          <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ padding: 12 }}>
            {/* New sample option */}
            {!creatingNew && (
              <TouchableOpacity
                style={[styles.item, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}
                onPress={() => setCreatingNew(true)}
              >
                <Typography variant="body" weight="semibold">＋ New sample…</Typography>
                <Typography variant="caption" color="secondary">Start blank and type your own first prompt</Typography>
              </TouchableOpacity>
            )}
            {creatingNew && (
              <View style={[styles.form, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}> 
                <Typography variant="caption" color="secondary" style={{ marginBottom: 8 }}>
                  Enter a unique ID and title for this recording.
                </Typography>
                <InputField
                  placeholder="e.g., chat_o_custom_v1"
                  value={newId}
                  onChangeText={setNewId}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <View style={{ height: 8 }} />
                <InputField
                  placeholder="e.g., Custom Kyoto itinerary (OpenAI)"
                  value={newTitle}
                  onChangeText={setNewTitle}
                />
                <View style={{ height: 12 }} />
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
                  <Button title="Cancel" variant="secondary" size="small" onPress={() => { setCreatingNew(false); setNewId(''); setNewTitle(''); }} />
                  <Button title="Create & Start" variant="primary" size="small" onPress={() => {
                    const id = newId.trim();
                    const title = newTitle.trim() || newId.trim();
                    if (!id) return;
                    onSelect(`new:${id}`, title);
                  }} />
                </View>
              </View>
            )}
            {items.map((it) => (
              <TouchableOpacity
                key={it.id}
                style={[styles.item, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}
                onPress={() => onSelect(it.id, it.title)}
              >
                <Typography variant="body" weight="semibold">{it.title}</Typography>
                <Typography variant="caption" color="secondary">{it.id}</Typography>
              </TouchableOpacity>
            ))}
            {items.length === 0 && (
              <View style={{ padding: 16 }}>
                <Typography variant="caption" color="secondary">No topics available for this combination.</Typography>
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
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.15,
        shadowRadius: 20,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  item: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
  },
  form: {
    padding: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
  },
});

export default ChatTopicPickerModal;
