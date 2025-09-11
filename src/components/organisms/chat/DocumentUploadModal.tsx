import React, { useState } from 'react';
import { StyleSheet, TouchableOpacity, Modal, KeyboardAvoidingView, Platform, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import * as DocumentPicker from 'expo-document-picker';
import { Box } from '../../atoms';
import { useTheme } from '../../../theme';
import { Typography, SheetHeader } from '@/components/molecules';
import { MessageAttachment } from '../../../types';
import { 
  processDocumentForClaude,
  isSupportedDocumentType,
  validateDocumentSize,
  getFileExtensionFromMimeType,
  } from '../../../utils/documentProcessing';
import { getReadableFileSize } from '../../../utils/imageProcessing';

interface DocumentUploadModalProps {
  visible: boolean;
  onClose: () => void;
  onUpload: (attachments: MessageAttachment[]) => void;
}

export const DocumentUploadModal: React.FC<DocumentUploadModalProps> = ({ visible, onClose, onUpload }) => {
  const { theme } = useTheme();
  const [doc, setDoc] = useState<MessageAttachment | null>(null);

  const pickDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    if (!isSupportedDocumentType(asset.mimeType || '')) {
      Alert.alert('Unsupported', 'Select PDF, TXT, MD, CSV, JSON, XML, HTML, DOCX, XLSX, or PPTX.');
      return;
    }
    if (asset.size) {
      const sizeValidation = validateDocumentSize(asset.size);
      if (!sizeValidation.valid) {
        Alert.alert('File Too Large', sizeValidation.error || 'File exceeds size limit');
        return;
      }
    }
    const processed = await processDocumentForClaude(asset.uri, asset.mimeType || 'application/octet-stream', asset.name || `file.${getFileExtensionFromMimeType(asset.mimeType || '')}`);
    setDoc(processed);
  };

  const handleConfirm = () => {
    if (!doc) { Alert.alert('No Document', 'Please choose a document first.'); return; }
    onUpload([doc]);
    setDoc(null);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="overFullScreen" transparent onRequestClose={onClose}>
      <BlurView intensity={20} style={styles.backdrop}>
        <TouchableOpacity style={styles.backdropTouchable} activeOpacity={1} onPress={onClose}>
          <TouchableOpacity activeOpacity={1} style={[styles.sheet, { backgroundColor: theme.colors.background }]} onPress={() => {}}>
            <SafeAreaView style={{ flex: 1 }}>
              <SheetHeader title="Attach Document" onClose={onClose} showHandle />
              <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={styles.content}>
                  <Box style={styles.section}>
                    <Typography variant="body" weight="semibold" color="secondary" style={styles.label}>Select File</Typography>
                    <TouchableOpacity onPress={pickDocument} style={[styles.actionBtn, { borderColor: theme.colors.border }]}>
                      <Typography variant="body">Browse Files</Typography>
                    </TouchableOpacity>
                  </Box>

                  {doc && (
                    <Box style={styles.section}>
                      <Typography variant="body" weight="semibold" color="secondary" style={styles.label}>Selected</Typography>
                      <Typography variant="body">{doc.fileName}</Typography>
                      <Typography variant="caption" color="secondary" style={{ marginTop: 6 }}>
                        {getReadableFileSize(doc.fileSize || 0)} • {doc.mimeType}
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
  sheet: { height: 440, borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' },
  content: { paddingHorizontal: 16, paddingVertical: 12 },
  section: { paddingHorizontal: 16, paddingVertical: 12 },
  label: { marginBottom: 6 },
  actionBtn: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  actionsRow: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24, flexDirection: 'row', justifyContent: 'space-between' },
  actionPill: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth },
});

export default DocumentUploadModal;
