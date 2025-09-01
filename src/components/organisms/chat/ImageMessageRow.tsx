import React, { useState } from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { Box } from '../../atoms';
import { Typography } from '../../molecules';
import { useTheme } from '../../../theme';
import { ImageBubble } from './ImageBubble';
import * as Sharing from 'expo-sharing';
import MediaSaveService from '../../../services/media/MediaSaveService';
import { ImageLightboxModal } from './ImageLightboxModal';
import { Message } from '../../../types';

export interface ImageMessageRowProps {
  message: Message;
}

export const ImageMessageRow: React.FC<ImageMessageRowProps> = ({ message }) => {
  const { theme } = useTheme();
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);
  const uris = (message.attachments || []).filter(a => a.type === 'image').map(a => a.uri);
  if (uris.length === 0) return null;

  return (
    <Box style={styles.container}>
      <Box style={{ marginBottom: 4 }}>
        <Typography variant="caption" weight="semibold" style={{ color: theme.colors.text.secondary }}>
          {message.sender}
        </Typography>
      </Box>
      <ImageBubble uris={uris} onPressImage={(uri) => setLightboxUri(uri)} />
      <Box style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
        <TouchableOpacity onPress={async () => {
          try { await MediaSaveService.saveFileUri(uris[0], { album: 'Symposium AI' }); } catch {}
        }} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: theme.colors.surface }}>
          <Typography variant="caption" style={{ color: theme.colors.text.primary }}>Save</Typography>
        </TouchableOpacity>
        <TouchableOpacity onPress={async () => { try { if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uris[0]); } catch {} }} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: theme.colors.surface }}>
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
