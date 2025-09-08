import React, { useEffect, useState } from 'react';
import { StyleSheet, TouchableOpacity, Modal, KeyboardAvoidingView, Platform, ScrollView, Alert, ToastAndroid } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Box } from '../../atoms';
import { useTheme } from '../../../theme';
import { Typography } from '../../molecules/Typography';
import { SheetHeader } from '../../molecules/SheetHeader';
import {
  useAudioRecorder,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  RecordingPresets,
} from 'expo-audio';
import TranscriptionService from '../../../services/voice/TranscriptionService';
import OpenAIRealtimeService from '../../../services/voice/OpenAIRealtimeService';
import OpenAIWebRTCService from '../../../services/voice/OpenAIWebRTCService';
import * as ReactRef from 'react';
import { isRealtimeConfigured } from '../../../config/realtime';
import { useSelector } from 'react-redux';
import { RootState } from '../../../store';

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
  const recordingRef = ReactRef.useRef<{ stop: () => Promise<void>; uri: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const hasOpenAIKey = useSelector((state: RootState) => Boolean(state.settings.apiKeys?.openai));
  const configuredRelay = useSelector((state: RootState) => state.settings.realtimeRelayUrl);
  const realtimeAvailable = hasOpenAIKey || isRealtimeConfigured();
  const realtimeRef = ReactRef.useRef<OpenAIRealtimeService | null>(null);
  const webrtcRef = ReactRef.useRef<OpenAIWebRTCService | null>(null);

  // Audio recorder (iOS inline recording)
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  // Auto-hide iOS toast after a short delay
  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => setToastMessage(null), 2500);
    return () => clearTimeout(t);
  }, [toastMessage]);

  const showToast = (message: string) => {
    if (Platform.OS === 'android') {
      ToastAndroid.show(message, ToastAndroid.SHORT);
    } else {
      setToastMessage(message);
    }
  };

  const handleStart = async () => {
    setRecording(true);
    onStart?.();
    // Use expo-audio recorder for inline recording on both platforms
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (perm.status !== 'granted') {
        showToast('Mic permission required. Enable in Settings.');
        setRecording(false);
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      recorder.record();
      // Minimal interface for stop + uri retrieval
      recordingRef.current = {
        stop: async () => {
          await recorder.stop();
        },
        get uri() {
          return recorder.uri;
        },
      } as unknown as { stop: () => Promise<void>; uri: string | null };
      if (advanced) {
        try {
          // Prefer WebRTC path using BYOK ephemeral session
          const rtc = new OpenAIWebRTCService();
          webrtcRef.current = rtc;
          await rtc.startWebRTC();
        } catch (e) {
          // Fallback to WS relay if configured
          if (configuredRelay) {
            const svc = new OpenAIRealtimeService({ relayUrl: configuredRelay });
            realtimeRef.current = svc;
            await svc.connect();
          } else {
            throw e;
          }
        }
      }
    } catch {
      Alert.alert('Recording Not Available', 'Recording failed to start. Please check microphone permissions in Settings.');
    }
  };

  const handleStop = async () => {
    setRecording(false);
    onStop?.();
    try {
      if (recordingRef.current) {
        setBusy(true);
        const rec = recordingRef.current;
        await rec.stop();
        const uri = rec.uri;
        if (uri) {
          if (advanced && (webrtcRef.current || realtimeRef.current)) {
            try {
              if (realtimeRef.current) {
                await realtimeRef.current.sendRecordedAudioFile(uri, 'audio/m4a');
                // Wait briefly and fetch output audio
                setTimeout(async () => {
                  // Optional playback skipped cross-platform to avoid build issues
                  await realtimeRef.current?.disconnect();
                }, 500);
              } else if (webrtcRef.current) {
                // For WebRTC path, audio plays via remote track; nothing to send.
                // Optionally, we could also record and send via data channel, but not required.
              }
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

  // Removed pick-file fallback: inline recording is supported on both platforms

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
                    <TouchableOpacity onPress={() => setAdvanced(!advanced)} disabled={!realtimeAvailable} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: theme.colors.surface, opacity: realtimeAvailable ? 1 : 0.6 }}>
                      <Typography variant="caption" style={{ color: theme.colors.text.primary }}>
                        {advanced ? 'Advanced (Realtime) On' : 'Advanced (Realtime) Off'}
                      </Typography>
                    </TouchableOpacity>
                    {!realtimeAvailable && (
                      <Typography variant="caption" color="secondary">
                        Configure OPENAI_REALTIME_RELAY_URL to enable realtime.
                      </Typography>
                    )}
                  </Box>
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
                {toastMessage && (
                  <Box
                    style={{
                      position: 'absolute',
                      bottom: 12,
                      left: 16,
                      right: 16,
                      alignSelf: 'center',
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      borderRadius: 10,
                      backgroundColor: theme.colors.semantic.error,
                      borderWidth: StyleSheet.hairlineWidth,
                      borderColor: theme.colors.error[600],
                    }}
                  >
                    <Typography variant="caption" style={{ color: theme.colors.text.inverse }}>
                      {toastMessage}
                    </Typography>
                  </Box>
                )}
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
