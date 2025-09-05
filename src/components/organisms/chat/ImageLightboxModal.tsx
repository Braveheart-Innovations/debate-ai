import React from 'react';
import { Modal, StyleSheet, TouchableOpacity, ScrollView, View } from 'react-native';
import { Image } from 'react-native';
import { useTheme } from '../../../theme';
import { Ionicons } from '@expo/vector-icons';
import { Box } from '../../atoms';
import { Typography } from '../../molecules';
import * as Sharing from 'expo-sharing';
import MediaSaveService from '../../../services/media/MediaSaveService';
import { Alert } from 'react-native';

export interface ImageLightboxModalProps {
  visible: boolean;
  uri: string;
  onClose: () => void;
}

export const ImageLightboxModal: React.FC<ImageLightboxModalProps> = ({ visible, uri, onClose }) => {
  const { theme } = useTheme();

  const onShare = async () => {
    try {
      const available = await Sharing.isAvailableAsync();
      if (available) {
        await Sharing.shareAsync(uri);
      }
    } catch (err) { void err; }
  };

  const onSave = async () => {
    try {
      await MediaSaveService.saveFileUri(uri, { album: 'Symposium AI' });
      Alert.alert('Saved', 'Image saved to Photos');
    } catch (e) {
      Alert.alert('Save Failed', e instanceof Error ? e.message : 'Could not save image');
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={styles.backdropTouchable} activeOpacity={1} onPress={onClose}>
          <TouchableOpacity style={styles.content} activeOpacity={1} onPress={() => {}}>
            <Box style={styles.headerRow}>
              <Typography variant="title" color="inverse">Preview</Typography>
              <TouchableOpacity 
                onPress={onClose} 
                hitSlop={{ top: 10, left: 10, bottom: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={28} color="#FFFFFF" />
              </TouchableOpacity>
            </Box>
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              minimumZoomScale={1}
              maximumZoomScale={4}
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              <Image source={{ uri }} style={styles.image} resizeMode="contain" />
            </ScrollView>
            <Box style={styles.actionsRow}>
              <TouchableOpacity onPress={onShare} style={[styles.actionBtn, { backgroundColor: theme.colors.surface }]}> 
                <Typography variant="body" style={{ color: theme.colors.text.primary }}>Share</Typography>
              </TouchableOpacity>
              <TouchableOpacity onPress={onSave} style={[styles.actionBtn, { backgroundColor: theme.colors.surface }]}> 
                <Typography variant="body" style={{ color: theme.colors.text.primary }}>Save</Typography>
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose} style={[styles.actionBtn, { backgroundColor: theme.colors.surface }]}> 
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
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 12 },
  image: { width: '100%', height: '80%' },
  actionsRow: { position: 'absolute', bottom: 24, left: 0, right: 0, paddingHorizontal: 16, flexDirection: 'row', justifyContent: 'space-evenly' },
  actionBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
});

export default ImageLightboxModal;
