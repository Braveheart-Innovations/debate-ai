import React, { useState } from 'react';
import { StyleSheet, TouchableOpacity, Modal, KeyboardAvoidingView, Platform, ScrollView, Image, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import * as ImagePicker from 'expo-image-picker';
import { Box } from '../../atoms';
import { useTheme } from '../../../theme';
import { Typography } from '../../molecules/Typography';
import { SheetHeader } from '../../molecules/SheetHeader';
import { MessageAttachment } from '../../../types';
import { processImageForClaude, getReadableFileSize } from '../../../utils/imageProcessing';

interface ImageUploadModalProps {
  visible: boolean;
  onClose: () => void;
  onUpload: (attachments: MessageAttachment[]) => void;
}

export const ImageUploadModal: React.FC<ImageUploadModalProps> = ({ visible, onClose, onUpload }) => {
  const { theme } = useTheme();
  const [attachments, setAttachments] = useState<MessageAttachment[]>([]);

  const pickFromLibrary = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission Required', 'Please allow photo library access.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.9, base64: true });
    if (res.canceled || !res.assets?.length) return;
    const asset = res.assets[0];
    const processed = await processImageForClaude(asset.uri, asset.mimeType || 'image/jpeg', asset.fileName || undefined);
    setAttachments([{ type: 'image', uri: asset.uri, mimeType: processed.mimeType, base64: processed.base64, fileName: processed.fileName, fileSize: processed.fileSize }]);
  };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission Required', 'Please allow camera access.');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.9, base64: true });
    if (res.canceled || !res.assets?.length) return;
    const asset = res.assets[0];
    const processed = await processImageForClaude(asset.uri, asset.mimeType || 'image/jpeg', asset.fileName || undefined);
    setAttachments([{ type: 'image', uri: asset.uri, mimeType: processed.mimeType, base64: processed.base64, fileName: processed.fileName, fileSize: processed.fileSize }]);
  };

  const handleConfirm = () => {
    if (attachments.length === 0) {
      Alert.alert('No Image Selected', 'Please choose an image first.');
      return;
    }
    onUpload(attachments);
    setAttachments([]);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="overFullScreen" transparent onRequestClose={onClose}>
      <BlurView intensity={20} style={styles.backdrop}>
        <TouchableOpacity style={styles.backdropTouchable} activeOpacity={1} onPress={onClose}>
          <TouchableOpacity activeOpacity={1} style={[styles.sheet, { backgroundColor: theme.colors.background }]} onPress={() => {}}>
            <SafeAreaView style={{ flex: 1 }}>
              <SheetHeader title="Attach Image" onClose={onClose} showHandle />
              <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={styles.content}>
                  <Box style={styles.section}>
                    <Typography variant="body" weight="semibold" color="secondary" style={styles.label}>Choose Source</Typography>
                    <Box style={styles.row}>
                      <TouchableOpacity onPress={pickFromLibrary} style={[styles.actionBtn, { borderColor: theme.colors.border }]}> 
                        <Typography variant="body">Photo Library</Typography>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={takePhoto} style={[styles.actionBtn, { borderColor: theme.colors.border }]}> 
                        <Typography variant="body">Camera</Typography>
                      </TouchableOpacity>
                    </Box>
                  </Box>

                  {attachments.length > 0 && (
                    <Box style={styles.section}>
                      <Typography variant="body" weight="semibold" color="secondary" style={styles.label}>Preview</Typography>
                      <Image source={{ uri: attachments[0].uri }} style={styles.preview} />
                      <Typography variant="caption" color="secondary" style={{ marginTop: 6 }}>
                        {getReadableFileSize(attachments[0].fileSize || 0)} • {attachments[0].mimeType}
                      </Typography>
                    </Box>
                  )}

                </ScrollView>
                <Box style={styles.actionsRow}>
                  <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={[styles.actionPill, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                    <Typography variant="body" style={{ color: theme.colors.text.primary }}>Cancel</Typography>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleConfirm} activeOpacity={0.7} style={[styles.actionPill, { backgroundColor: theme.colors.primary[50], borderColor: theme.colors.primary[500] }]}> 
                    <Typography variant="body" weight="semibold" style={{ color: theme.colors.primary[600] }}>Attach</Typography>
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
  sheet: { height: 560, borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' },
  content: { paddingHorizontal: 16, paddingVertical: 12 },
  section: { paddingHorizontal: 16, paddingVertical: 12 },
  label: { marginBottom: 6 },
  row: { flexDirection: 'row', gap: 8 },
  actionBtn: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  preview: { width: '100%', height: 220, borderRadius: 12, marginTop: 8 },
  actionsRow: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24, flexDirection: 'row', justifyContent: 'space-between' },
  actionPill: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth },
});

export default ImageUploadModal;
