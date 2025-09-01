import React, { useState } from 'react';
import { StyleSheet, TextInput, TouchableOpacity, Text as RNText, ScrollView, Image, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Box } from '../../atoms';
import { useTheme } from '../../../theme';
import { MessageAttachment } from '../../../types';
import { processImageForClaude, getReadableFileSize } from '../../../utils/imageProcessing';
import { 
  processDocumentForClaude, 
  isSupportedDocumentType,
  validateDocumentSize,
  getDocumentIcon,
  getFileExtensionFromMimeType
} from '../../../utils/documentProcessing';

export interface ChatInputBarProps {
  inputText: string;
  onInputChange: (text: string) => void;
  onSend: (messageText?: string, attachments?: MessageAttachment[]) => void;
  onOpenImageModal?: () => void;
  placeholder?: string;
  disabled?: boolean;
  multiline?: boolean;
  attachmentSupport?: { images: boolean; documents: boolean };
  maxAttachments?: number;
  imageGenerationEnabled?: boolean;
}

export const ChatInputBar: React.FC<ChatInputBarProps> = ({
  inputText,
  onInputChange,
  onSend,
  onOpenImageModal,
  placeholder = "Type a message...",
  disabled = false,
  multiline = true,
  attachmentSupport = { images: false, documents: false },
  maxAttachments = 20, // Claude's limit
  imageGenerationEnabled = false,
}) => {
  const { theme } = useTheme();
  const [attachments, setAttachments] = useState<MessageAttachment[]>([]);
  // keep prompt prefill only in parent modal
  // Image modal state handled inside ImageGenerationModal; keep only prompt prefill here
  const canSend = (inputText.trim().length > 0 || attachments.length > 0) && !disabled;
  
  const handleSend = () => {
    if (canSend) {
      onSend(inputText, attachments.length > 0 ? attachments : undefined);
      setAttachments([]); // Clear attachments after sending
    }
  };
  
  const pickAttachment = async () => {
    if (attachments.length >= maxAttachments) {
      Alert.alert('Limit Reached', `Maximum ${maxAttachments} attachments allowed per message`);
      return;
    }
    
    // Show action sheet based on what's supported
    const options = [];
    if (attachmentSupport.documents) {
      options.push({
        text: 'Document',
        onPress: pickDocument,
      });
    }
    if (attachmentSupport.images) {
      options.push({
        text: 'Image', 
        onPress: pickImage,
      });
    }
    options.push({
      text: 'Cancel',
      style: 'cancel' as const,
    });
    
    Alert.alert(
      'Add Attachment',
      'What would you like to attach?',
      options,
      { cancelable: true }
    );
  };
  
  const pickDocument = async () => {
    if (attachments.length >= maxAttachments) {
      Alert.alert('Limit Reached', `Maximum ${maxAttachments} attachments allowed per message`);
      return;
    }
    
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*', // Allow all file types, we'll validate later
        copyToCacheDirectory: true,
        multiple: false, // expo-document-picker doesn't support multiple selection
      });
      
      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }
      
      const asset = result.assets[0];
      
      // Validate document type
      if (!isSupportedDocumentType(asset.mimeType || '')) {
        Alert.alert(
          'Unsupported File Type',
          'Please select a PDF, TXT, MD, CSV, JSON, XML, HTML, DOCX, XLSX, or PPTX file.'
        );
        return;
      }
      
      // Validate file size
      if (asset.size) {
        const sizeValidation = validateDocumentSize(asset.size);
        if (!sizeValidation.valid) {
          Alert.alert('File Too Large', sizeValidation.error || 'File exceeds size limit');
          return;
        }
      }
      
      // Process document
      const processed = await processDocumentForClaude(
        asset.uri,
        asset.mimeType || 'application/octet-stream',
        asset.name
      );
      
      setAttachments([...attachments, processed]);
    } catch (error) {
      Alert.alert('Error', `Failed to pick document: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };
  
  const pickImage = async () => {
    if (attachments.length >= maxAttachments) {
      Alert.alert('Limit Reached', `Maximum ${maxAttachments} attachments allowed per message`);
      return;
    }
    
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        quality: 0.9,
        base64: true,
      });
      
      if (!result.canceled && result.assets) {
        const newAttachments: MessageAttachment[] = [];
        
        for (const asset of result.assets) {
          if (attachments.length + newAttachments.length >= maxAttachments) break;
          
          try {
            // Process image for Claude
            const processed = await processImageForClaude(
              asset.uri,
              asset.mimeType || 'image/jpeg',
              asset.fileName || undefined
            );
            
            newAttachments.push({
              type: 'image',
              uri: asset.uri,
              mimeType: asset.mimeType || 'image/jpeg',
              base64: processed.base64,
              fileName: asset.fileName || undefined,
              fileSize: processed.fileSize,
            });
          } catch (error) {
            Alert.alert('Error', `Failed to process image: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }
        
        setAttachments([...attachments, ...newAttachments]);
      }
    } catch (error) {
      Alert.alert('Error', `Failed to pick image: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };
  
  const removeAttachment = (index: number) => {
    setAttachments(attachments.filter((_, i) => i !== index));
  };

  return (
    <Box style={styles.container}>
      {/* Attachment preview row */}
      {attachments.length > 0 && (
        <ScrollView 
          horizontal 
          style={[
            styles.attachmentPreview,
            {
              backgroundColor: theme.colors.surface,
              borderTopColor: theme.colors.border,
            }
          ]}
          showsHorizontalScrollIndicator={false}
        >
          {attachments.map((attachment, index) => (
            <Box key={index} style={styles.attachmentItem}>
              {attachment.type === 'image' ? (
                <Image source={{ uri: attachment.uri }} style={styles.attachmentImage} />
              ) : (
                <Box style={[
                  styles.documentPreview,
                  { backgroundColor: theme.colors.surface }
                ]}>
                  <RNText style={[
                    styles.documentIcon,
                    { color: theme.colors.primary[500] }
                  ]}>
                    {getDocumentIcon(getFileExtensionFromMimeType(attachment.mimeType))}
                  </RNText>
                  <RNText 
                    style={[
                      styles.documentName,
                      { color: theme.colors.text.primary }
                    ]}
                    numberOfLines={2}
                  >
                    {attachment.fileName || 'Document'}
                  </RNText>
                </Box>
              )}
              <TouchableOpacity
                style={[
                  styles.removeButton,
                  { backgroundColor: theme.colors.error[500] }
                ]}
                onPress={() => removeAttachment(index)}
              >
                <RNText style={styles.removeButtonText}>×</RNText>
              </TouchableOpacity>
              {attachment.fileSize && (
                <Box style={[
                  styles.sizeLabel,
                  { backgroundColor: theme.colors.background }
                ]}>
                  <RNText style={[
                    styles.sizeLabelText,
                    { color: theme.colors.text.secondary }
                  ]}>
                    {getReadableFileSize(attachment.fileSize)}
                  </RNText>
                </Box>
              )}
            </Box>
          ))}
        </ScrollView>
      )}
      
      {/* Input row */}
      <Box style={[
        styles.inputContainer,
        {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
        }
      ]}>
        {imageGenerationEnabled && (
          <TouchableOpacity
            style={[
              styles.attachButton,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
              }
            ]}
            onPress={() => {
              if (onOpenImageModal) onOpenImageModal();
            }}
            disabled={disabled}
          >
            <RNText style={[
              styles.attachButtonText,
              { color: theme.colors.text.primary }
            ]}>🖼️</RNText>
          </TouchableOpacity>
        )}
        {(attachmentSupport.images || attachmentSupport.documents) && (
          <TouchableOpacity
            style={[
              styles.attachButton,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
              }
            ]}
            onPress={pickAttachment}
            disabled={disabled}
          >
            <RNText style={[
              styles.attachButtonText,
              { color: theme.colors.text.primary }
            ]}>📎</RNText>
          </TouchableOpacity>
        )}
        
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: theme.colors.surface,
              borderRadius: theme.borderRadius.xl,
              color: theme.colors.text.primary,
              maxHeight: 100,
            }
          ]}
          value={inputText}
          onChangeText={onInputChange}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.text.secondary}
          multiline={multiline}
          editable={!disabled}
        />
        
        <TouchableOpacity
          style={[
            styles.sendButton,
            {
              backgroundColor: canSend ? theme.colors.primary[500] : theme.colors.gray[400],
            }
          ]}
          onPress={handleSend}
          disabled={!canSend}
          activeOpacity={0.7}
        >
          <RNText style={styles.sendButtonText}>↑</RNText>
        </TouchableOpacity>
      </Box>

      {/* Image modal rendered at screen level for consistent overlay */}
    </Box>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 0,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    marginRight: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 16,
  },
  sendButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 18,
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
  attachButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    marginRight: 8,
  },
  attachButtonText: {
    fontSize: 18,
  },
  attachmentPreview: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: 1,
    maxHeight: 100,
  },
  attachmentItem: {
    marginRight: 8,
    position: 'relative',
  },
  attachmentImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
  },
  removeButton: {
    position: 'absolute',
    top: -5,
    right: -5,
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  sizeLabel: {
    position: 'absolute',
    bottom: 2,
    left: 2,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  sizeLabelText: {
    fontSize: 10,
  },
  documentPreview: {
    width: 80,
    height: 80,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
  },
  documentIcon: {
    fontSize: 32,
    marginBottom: 4,
  },
  documentName: {
    fontSize: 10,
    textAlign: 'center',
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    width: '90%',
    borderRadius: 12,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  modalInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    padding: 8,
    minHeight: 60,
    marginBottom: 8,
  },
  modalRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  modalActions: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
