import React, { useState } from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import * as Sharing from 'expo-sharing';
import MediaSaveService from '../../../services/media/MediaSaveService';
import { Box } from '../../atoms';
import { Typography } from '../../molecules';
import { useTheme } from '../../../theme';
import { Message } from '../../../types';
import { VideoLightboxModal } from './VideoLightboxModal';

export interface VideoMessageRowProps {
  message: Message;
}

export const VideoMessageRow: React.FC<VideoMessageRowProps> = ({ message }) => {
  const { theme } = useTheme();
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);
  const uris = (message.attachments || []).filter(a => a.type === 'video').map(a => a.uri);
  if (uris.length === 0) return null;

  return (
    <Box style={styles.container}>
      <Box style={{ marginBottom: 4 }}>
        <Typography variant="caption" weight="semibold" style={{ color: theme.colors.text.secondary }}>
          {message.sender}
        </Typography>
      </Box>
      <TouchableOpacity onPress={() => setLightboxUri(uris[0])} style={{ backgroundColor: theme.colors.surface, borderRadius: 8, padding: 8 }}>
        <Typography variant="body" color="secondary">Tap to play video</Typography>
      </TouchableOpacity>
      <Box style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}><TouchableOpacity onPress={async () => { try { await MediaSaveService.saveFileUri(uris[0], { album: 'Symposium AI' }); } catch {} }} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: theme.colors.surface }}><Typography variant="caption" style={{ color: theme.colors.text.primary }}>Save</Typography></TouchableOpacity><TouchableOpacity onPress={async () => { try { if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uris[0]); } catch {} }} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: theme.colors.surface }}><Typography variant="caption" style={{ color: theme.colors.text.primary }}>Share</Typography></TouchableOpacity></Box>
      <Box style={styles.metaRow}>
        <Typography variant="caption" color="secondary">{new Date(message.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</Typography>
      </Box>
      <VideoLightboxModal visible={!!lightboxUri} uri={lightboxUri || ''} onClose={() => setLightboxUri(null)} />
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
  metaRow: { marginTop: 4 },
});

export default VideoMessageRow;
