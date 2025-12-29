import React, { useState } from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { Box } from '../../atoms';
import { Typography } from '../../molecules';
import { useTheme } from '../../../theme';
import { ImageBubble } from './ImageBubble';
import * as Sharing from 'expo-sharing';
import MediaSaveService from '../../../services/media/MediaSaveService';
import { ImageLightboxModal } from './ImageLightboxModal';
import { Message, AIProvider } from '../../../types';

export interface ImageMessageRowProps {
  message: Message;
  /** Whether refinement is available */
  canRefine?: boolean;
  /** Called when user wants to refine an image */
  onRefine?: (imageUri: string, originalPrompt: string, originalProvider: AIProvider, messageId?: string) => void;
}

export const ImageMessageRow: React.FC<ImageMessageRowProps> = ({ message, canRefine, onRefine }) => {
  const { theme } = useTheme();
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);
  const uris = (message.attachments || []).filter(a => a.type === 'image').map(a => a.uri);
  if (uris.length === 0) return null;

  // Extract image generation metadata for refinement
  const generatedImage = (message.metadata as { generatedImage?: { prompt: string; providerId: string } } | undefined)?.generatedImage;
  const originalPrompt = generatedImage?.prompt || '';
  const originalProvider = (generatedImage?.providerId || 'openai') as AIProvider;

  // Only create handler if onRefine is provided
  const handleRefine = onRefine ? (uri: string) => {
    onRefine(uri, originalPrompt, originalProvider, message.id);
  } : undefined;

  return (
    <Box style={styles.container}>
      <Box style={{ marginBottom: 4 }}>
        <Typography variant="caption" weight="semibold" style={{ color: theme.colors.text.secondary }}>
          {message.sender}
        </Typography>
      </Box>
      <ImageBubble
        uris={uris}
        onPressImage={(uri) => setLightboxUri(uri)}
        canRefine={canRefine}
        onRefine={handleRefine}
      />
      <Box style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
        <TouchableOpacity onPress={async () => {
          try { await MediaSaveService.saveFileUri(uris[0], { album: 'Symposium AI' }); } catch (e) { void e; }
        }} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: theme.colors.surface }}>
          <Typography variant="caption" style={{ color: theme.colors.text.primary }}>Save</Typography>
        </TouchableOpacity>
        <TouchableOpacity onPress={async () => { try { if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uris[0]); } catch (e) { void e; } }} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: theme.colors.surface }}>
          <Typography variant="caption" style={{ color: theme.colors.text.primary }}>Share</Typography>
        </TouchableOpacity>
      </Box>
      <Box style={styles.metaRow}>
        <Typography variant="caption" color="secondary">{new Date(message.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</Typography>
      </Box>
      <ImageLightboxModal visible={!!lightboxUri} uri={lightboxUri || ''} onClose={() => setLightboxUri(null)} />
    </Box>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginVertical: 8,
    maxWidth: '80%',
    alignSelf: 'flex-start',
  },
  metaRow: {
    marginTop: 4,
  },
});

export default ImageMessageRow;
