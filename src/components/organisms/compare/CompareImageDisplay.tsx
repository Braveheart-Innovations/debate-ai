import React, { useState, useMemo } from 'react';
import { StyleSheet, TouchableOpacity, Image, Dimensions, Text } from 'react-native';
import { Box } from '../../atoms';
import { Typography } from '../../molecules';
import { useTheme } from '../../../theme';
import * as Sharing from 'expo-sharing';
import MediaSaveService from '../../../services/media/MediaSaveService';
import { AIConfig } from '../../../types';
import type { BrandColor } from '@/constants/aiColors';

export interface CompareImageDisplayProps {
  ai: AIConfig;
  side: 'left' | 'right';
  uri: string;
  mimeType?: string;
  timestamp: number;
  onOpenLightbox: (uri: string) => void;
  brandPalette?: BrandColor | null;
}

export const CompareImageDisplay: React.FC<CompareImageDisplayProps> = ({
  ai,
  side: _side,
  uri,
  timestamp,
  onOpenLightbox,
  brandPalette: _brandPalette,
}) => {
  const { theme, isDark } = useTheme();
  const [error, setError] = useState(false);
  const [imageSize, setImageSize] = useState<{ w: number; h: number } | null>(null);

  // Calculate container width for pane layout
  const containerWidth = useMemo(() => {
    const screenWidth = Dimensions.get('window').width;
    // Pane is roughly half screen minus padding
    return Math.max(100, Math.floor((screenWidth / 2) - 32));
  }, []);

  // Calculate image height based on aspect ratio
  const imageHeight = useMemo(() => {
    if (imageSize) {
      const ratio = imageSize.h / imageSize.w;
      return Math.floor(containerWidth * ratio);
    }
    // Default to square-ish
    return Math.floor(containerWidth * 0.85);
  }, [containerWidth, imageSize]);

  const handleSave = async () => {
    try {
      await MediaSaveService.saveFileUri(uri, { album: 'Symposium AI' });
    } catch (e) {
      console.warn('Failed to save image:', e);
    }
  };

  const handleShare = async () => {
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri);
      }
    } catch (e) {
      console.warn('Failed to share image:', e);
    }
  };

  if (!uri) return null;

  return (
    <Box style={styles.container}>
      <Box style={styles.headerRow}>
        <Typography variant="caption" weight="semibold" style={{ color: theme.colors.text.secondary }}>
          {ai.name}
        </Typography>
      </Box>
      <TouchableOpacity
        onPress={() => onOpenLightbox(uri)}
        activeOpacity={0.8}
        style={styles.imageWrapper}
      >
        <Image
          source={{ uri }}
          style={[
            styles.image,
            {
              borderColor: theme.colors.border,
              width: containerWidth,
              height: imageHeight,
            },
          ]}
          resizeMode="contain"
          accessible
          accessibilityLabel={`Generated image by ${ai.name}`}
          onError={() => setError(true)}
          onLoad={(e) => {
            const w = e?.nativeEvent?.source?.width || 1024;
            const h = e?.nativeEvent?.source?.height || 1024;
            setImageSize({ w, h });
          }}
        />
        {error && (
          <Text style={{ color: theme.colors.error[500], marginTop: 4 }}>
            Failed to load image
          </Text>
        )}
      </TouchableOpacity>
      <Box style={styles.actionRow}>
        <TouchableOpacity
          onPress={handleSave}
          style={[
            styles.actionButton,
            {
              backgroundColor: isDark ? theme.colors.gray[800] : theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Typography variant="caption" style={{ color: theme.colors.text.primary }}>
            Save
          </Typography>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleShare}
          style={[
            styles.actionButton,
            {
              backgroundColor: isDark ? theme.colors.gray[800] : theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Typography variant="caption" style={{ color: theme.colors.text.primary }}>
            Share
          </Typography>
        </TouchableOpacity>
      </Box>
      <Box style={styles.metaRow}>
        <Typography variant="caption" color="secondary">
          {new Date(timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
        </Typography>
      </Box>
    </Box>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  headerRow: {
    marginBottom: 4,
  },
  imageWrapper: {
    marginBottom: 6,
  },
  image: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  metaRow: {
    marginTop: 4,
  },
});

export default CompareImageDisplay;
