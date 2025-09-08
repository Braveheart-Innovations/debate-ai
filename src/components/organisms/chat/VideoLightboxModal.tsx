import React from 'react';
import { Modal, StyleSheet, TouchableOpacity, View, Alert } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useTheme } from '../../../theme';
import { Ionicons } from '@expo/vector-icons';
import { Box } from '../../atoms';
import { Typography } from '../../molecules';
import * as Sharing from 'expo-sharing';
import MediaSaveService from '../../../services/media/MediaSaveService';

interface VideoLightboxModalProps {
  visible: boolean;
  uri: string;
  onClose: () => void;
}

export const VideoLightboxModal: React.FC<VideoLightboxModalProps> = ({ visible, uri, onClose }) => {
  const { theme } = useTheme();
  const player = useVideoPlayer(uri);

  const onShare = async () => {
    try {
      const available = await Sharing.isAvailableAsync();
      if (available) await Sharing.shareAsync(uri);
    } catch (err) { void err; }
  };

  const onSave = async () => {
    try {
      await MediaSaveService.saveFileUri(uri, { album: 'Symposium AI' });
      Alert.alert('Saved', 'Video saved to Photos');
    } catch (e) {
      Alert.alert('Save Failed', e instanceof Error ? e.message : 'Could not save video');
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={styles.backdropTouchable} activeOpacity={1} onPress={onClose}>
          <TouchableOpacity style={styles.content} activeOpacity={1} onPress={() => {}}>
            <Box style={styles.headerRow}>
              <Typography variant="title" color="inverse">Video</Typography>
              <TouchableOpacity 
                onPress={onClose}
                hitSlop={{ top: 10, left: 10, bottom: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={28} color="#FFFFFF" />
              </TouchableOpacity>
            </Box>
            <VideoView
              player={player}
              style={styles.video}
              nativeControls
              contentFit="contain"
            />
            <Box style={styles.actionsRow}>
              <TouchableOpacity onPress={onShare} style={styles.actionBtn}>
                <Typography variant="body" style={{ color: theme.colors.text.primary }}>Share</Typography>
              </TouchableOpacity>
              <TouchableOpacity onPress={onSave} style={styles.actionBtn}>
                <Typography variant="body" style={{ color: theme.colors.text.primary }}>Save</Typography>
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose} style={styles.actionBtn}>
                <Typography variant="body" style={{ color: theme.colors.text.primary }}>Close</Typography>
              </TouchableOpacity>
            </Box>
          </TouchableOpacity>
        </TouchableOpacity>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' },
  backdropTouchable: { flex: 1, width: '100%', justifyContent: 'center', alignItems: 'center' },
  content: { width: '100%', height: '100%', paddingTop: 40 },
  headerRow: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  video: { width: '100%', height: '80%' },
  actionsRow: { position: 'absolute', bottom: 24, left: 0, right: 0, paddingHorizontal: 16, flexDirection: 'row', justifyContent: 'space-evenly' },
  actionBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
});

export default VideoLightboxModal;
