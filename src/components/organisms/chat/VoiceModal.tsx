import React, { useState } from 'react';
import { StyleSheet, TouchableOpacity, Modal, KeyboardAvoidingView, Platform, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Box } from '../../atoms';
import { useTheme } from '../../../theme';
import { Typography } from '../../molecules/Typography';
import { SheetHeader } from '../../molecules/SheetHeader';
import * as DocumentPicker from 'expo-document-picker';
import TranscriptionService from '../../../services/voice/TranscriptionService';
import OpenAIRealtimeService from '../../../services/voice/OpenAIRealtimeService';
import * as ReactRef from 'react';

interface VoiceModalProps {
  visible: boolean;
  onClose: () => void;
  onStart?: () => void;
  onStop?: () => void;
  onTranscribed?: (text: string) => void;
}

export const VoiceModal: React.FC<VoiceModalProps> = ({ visible, onClose, onStart, onStop, onTranscribed }) => {
  const { theme } = useTheme();
  const [recording, setRecording] = useState(false);
  const recordingRef = ReactRef.useRef<any>(null);
  const [busy, setBusy] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const realtimeRef = ReactRef.useRef<OpenAIRealtimeService | null>(null);

  const handleStart = async () => {
    setRecording(true);
    onStart?.();
    // Use expo-av if available
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { Audio } = require('expo-av');
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const recordingObj = new Audio.Recording();
      await recordingObj.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recordingObj.startAsync();
      recordingRef.current = recordingObj;
      if (advanced) {
        const svc = new OpenAIRealtimeService();
        realtimeRef.current = svc;
        await svc.connect();
      }
    } catch (e) {
      Alert.alert('Recording Not Available', 'expo-av not available or recording failed to start. You can still choose an existing audio file.');
    }
  };

  const handleStop = async () => {
    setRecording(false);
    onStop?.();
    try {
      if (recordingRef.current) {
        setBusy(true);
        await recordingRef.current.stopAndUnloadAsync();
        const uri = recordingRef.current.getURI();
        if (uri) {
          if (advanced && realtimeRef.current) {
            try {
              await realtimeRef.current.sendRecordedAudioFile(uri, 'audio/m4a');
              // Wait briefly and fetch output audio
              setTimeout(async () => {
                const out = await realtimeRef.current?.saveOutputAudioToFile();
                if (out) {
                  const { Audio } = require('expo-av');
                  const sound = new Audio.Sound();
                  await sound.loadAsync({ uri: out });
                  await sound.playAsync();
                }
                await realtimeRef.current?.disconnect();
              }, 500);
            } catch (e) {
              Alert.alert('Realtime Error', e instanceof Error ? e.message : 'Realtime session failed');
            }
          } else {
            const text = await TranscriptionService.transcribeWithOpenAI(uri, 'audio/m4a', 'recording.m4a');
            onTranscribed?.(text);
            Alert.alert('Transcription Complete', text.slice(0, 200));
            onClose();
          }
        }
      }
    } catch (e) {
      Alert.alert('Transcription Error', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
      recordingRef.current = null;
    }
  };

  const pickAudioAndTranscribe = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.length) return;
      const asset = res.assets[0];
      const text = await TranscriptionService.transcribeWithOpenAI(asset.uri);
      onTranscribed?.(text);
      Alert.alert('Transcription Complete', text.slice(0, 200));
      onClose();
    } catch (e) {
      Alert.alert('Transcription Error', e instanceof Error ? e.message : 'Unknown error');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="overFullScreen" transparent onRequestClose={onClose}>
      <BlurView intensity={20} style={styles.backdrop}>
        <TouchableOpacity style={styles.backdropTouchable} activeOpacity={1} onPress={onClose}>
          <TouchableOpacity activeOpacity={1} style={[styles.sheet, { backgroundColor: theme.colors.background }]} onPress={() => {}}>
            <SafeAreaView style={{ flex: 1 }}>
              <SheetHeader title="Voice Input" onClose={onClose} showHandle />
              <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={styles.content}>
                  <Box style={styles.section}>
                    <Typography variant="body" color="secondary" style={{ marginBottom: 8 }}>
                      Tap and speak to transcribe your prompt.
                    </Typography>
                  <Typography variant="caption" color="secondary">
                    Tip: Ensure microphone permissions are granted in system settings.
                  </Typography>
                  <Box style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
                    <TouchableOpacity onPress={() => setAdvanced(!advanced)} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: theme.colors.surface }}>
                      <Typography variant="caption" style={{ color: theme.colors.text.primary }}>{advanced ? 'Advanced (Realtime) On' : 'Advanced (Realtime) Off'}</Typography>
                    </TouchableOpacity>
                  </Box>
                    <TouchableOpacity onPress={pickAudioAndTranscribe} style={{ marginTop: 12 }}>
                      <Typography variant="body" weight="semibold" color="primary">
                        Or choose an existing audio file →
                      </Typography>
                    </TouchableOpacity>
                  </Box>
                </ScrollView>
                <Box style={styles.actionsRow}>
                  <TouchableOpacity
                    onPress={recording ? handleStop : handleStart}
                    activeOpacity={0.8}
                    style={[styles.recordBtn, { backgroundColor: recording ? theme.colors.error[500] : theme.colors.primary[500], opacity: busy ? 0.6 : 1 }]}
                    disabled={busy}
                  >
                    <Typography variant="body" weight="bold" style={{ color: '#fff' }}>
                      {recording ? 'Stop' : 'Start'} Recording
                    </Typography>
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
  sheet: { height: 360, borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' },
  content: { paddingHorizontal: 16, paddingVertical: 12 },
  section: { paddingHorizontal: 16, paddingVertical: 12 },
  actionsRow: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24, flexDirection: 'row', justifyContent: 'center' },
  recordBtn: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 10 },
});

export default VoiceModal;
