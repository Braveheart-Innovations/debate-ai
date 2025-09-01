import React, { useState } from 'react';
import { StyleSheet, TextInput, TouchableOpacity, Modal, KeyboardAvoidingView, Platform, ScrollView, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Box } from '../../atoms';
import { useTheme } from '../../../theme';
import { Typography } from '../../molecules/Typography';
import { SheetHeader } from '../../molecules/SheetHeader';

const { height } = Dimensions.get('window');

export interface VideoGenerationModalProps {
  visible: boolean;
  onClose: () => void;
  onGenerate: (opts: { prompt: string; resolution: '720p' | '1080p'; duration: 5 | 10 | 15 }) => void;
}

export const VideoGenerationModal: React.FC<VideoGenerationModalProps> = ({ visible, onClose, onGenerate }) => {
  const { theme } = useTheme();
  const [prompt, setPrompt] = useState('');
  const [resolution, setResolution] = useState<'720p' | '1080p'>('720p');
  const [duration, setDuration] = useState<5 | 10 | 15>(5);

  const Chip: React.FC<{ label: string; selected: boolean; onPress: () => void }> = ({ label, selected, onPress }) => (
    <TouchableOpacity onPress={onPress} style={[styles.chip, { borderColor: selected ? theme.colors.primary[500] : theme.colors.border, backgroundColor: selected ? theme.colors.primary[50] : 'transparent' }]} activeOpacity={0.7}>
      <Typography variant="body" weight={selected ? 'semibold' : 'normal'} style={{ color: theme.colors.text.primary }}>{label}</Typography>
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="overFullScreen" transparent onRequestClose={onClose}>
      <BlurView intensity={20} style={styles.backdrop}>
        <TouchableOpacity style={styles.backdropTouchable} activeOpacity={1} onPress={onClose}>
          <TouchableOpacity activeOpacity={1} style={[styles.sheet, { backgroundColor: theme.colors.background }]} onPress={() => {}}>
            <SafeAreaView style={{ flex: 1 }}>
              <SheetHeader title="Generate Video" onClose={onClose} showHandle />
              <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                  <Box style={styles.section}>
                    <Typography variant="body" weight="semibold" color="secondary" style={styles.label}>Prompt</Typography>
                    <TextInput
                      style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text.primary }]}
                      placeholder="Describe the video you want"
                      placeholderTextColor={theme.colors.text.secondary}
                      value={prompt}
                      onChangeText={setPrompt}
                      multiline
                    />
                  </Box>
                  <Box style={styles.section}>
                    <Typography variant="body" weight="semibold" color="secondary" style={styles.label}>Resolution</Typography>
                    <Box style={styles.row}>
                      <Chip label="720p" selected={resolution==='720p'} onPress={() => setResolution('720p')} />
                      <Chip label="1080p" selected={resolution==='1080p'} onPress={() => setResolution('1080p')} />
                    </Box>
                  </Box>
                  <Box style={styles.section}>
                    <Typography variant="body" weight="semibold" color="secondary" style={styles.label}>Duration</Typography>
                    <Box style={styles.row}>
                      <Chip label="5s" selected={duration===5} onPress={() => setDuration(5)} />
                      <Chip label="10s" selected={duration===10} onPress={() => setDuration(10)} />
                      <Chip label="15s" selected={duration===15} onPress={() => setDuration(15)} />
                    </Box>
                  </Box>
                </ScrollView>
                <Box style={styles.actionsRow}>
                  <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={[styles.actionBtn, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                    <Typography variant="body" style={{ color: theme.colors.text.primary }}>Cancel</Typography>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => onGenerate({ prompt: prompt.trim(), resolution, duration })}
                    activeOpacity={0.7}
                    disabled={!prompt.trim()}
                    style={[styles.actionBtn, { backgroundColor: theme.colors.primary[50], borderColor: theme.colors.primary[500], opacity: prompt.trim() ? 1 : 0.6 }]}
                  >
                    <Typography variant="body" weight="semibold" style={{ color: theme.colors.primary[600] }}>Generate</Typography>
                  </TouchableOpacity>
                </Box>
              </KeyboardAvoidingView>
            </SafeAreaView>
          </TouchableOpacity>
        </TouchableOpacity>
      </BlurView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  backdropTouchable: { flex: 1, justifyContent: 'flex-end' },
  sheet: { height: height * 0.6, borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' },
  content: { paddingHorizontal: 16, paddingVertical: 12, flexGrow: 1 },
  section: { paddingHorizontal: 16, paddingVertical: 12 },
  label: { marginBottom: 6 },
  input: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, padding: 8, minHeight: 64 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, paddingVertical: 6, paddingHorizontal: 10 },
  actionsRow: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24, flexDirection: 'row', justifyContent: 'space-between' },
  actionBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth },
});

export default VideoGenerationModal;

