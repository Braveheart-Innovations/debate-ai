import React, { useMemo, useState } from 'react';
import { Image, StyleSheet, TouchableOpacity, Text, Dimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Box } from '../../atoms';
import { useTheme } from '../../../theme';

export interface ImageBubbleProps {
  uris: string[];
  onPressImage?: (uri: string) => void;
  /** Called when user taps Refine button - receives the image URI */
  onRefine?: (uri: string) => void;
  /** Whether refinement is available (at least one provider supports img2img) */
  canRefine?: boolean;
}

export const ImageBubble: React.FC<ImageBubbleProps> = ({ uris, onPressImage, onRefine, canRefine }) => {
  const { theme } = useTheme();
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [, setSizes] = useState<Record<string, { w: number; h: number }>>({});
  const containerWidth = useMemo(() => {
    const screenWidth = Dimensions.get('window').width;
    // Match ChatMessageList bubble max width (~80%) minus horizontal margins (16*2)
    return Math.max(120, Math.floor(screenWidth * 0.8) - 32);
  }, []);
  if (!uris || uris.length === 0) return null;

  return (
    <Box style={styles.container}>
      {uris.map((uri, idx) => (
        <TouchableOpacity
          key={`${uri}-${idx}`}
          onPress={() => onPressImage?.(uri)}
          activeOpacity={0.8}
          style={{ marginBottom: 8, position: 'relative' }}
        >
          <Image
            source={{ uri }}
            style={[styles.image, { borderColor: theme.colors.border, width: containerWidth, height: calcHeight(uri, containerWidth) }]}
            resizeMode="contain"
            accessible
            accessibilityLabel="generated image"
            onError={() => setErrors(prev => ({ ...prev, [uri]: true }))}
            onLoad={e => {
              const w = e?.nativeEvent?.source?.width || 1024;
              const h = e?.nativeEvent?.source?.height || 1024;
              setSizes(prev => ({ ...prev, [uri]: { w, h } }));
            }}
          />
          {/* Expand icon - top right */}
          <View style={styles.expandIconContainer}>
            <Ionicons name="expand-outline" size={16} color="#FFFFFF" />
          </View>
          {/* Refine button - bottom right */}
          {canRefine && onRefine && (
            <TouchableOpacity
              style={[styles.refineButton, { backgroundColor: theme.colors.primary[500] }]}
              onPress={(e) => {
                e?.stopPropagation?.();
                onRefine(uri);
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="color-wand-outline" size={14} color="#FFFFFF" />
              <Text style={styles.refineButtonText}>Refine</Text>
            </TouchableOpacity>
          )}
          {errors[uri] && (
            <Text style={{ color: theme.colors.error[500], marginTop: 4 }}>Failed to load image</Text>
          )}
        </TouchableOpacity>
      ))}
    </Box>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
  },
  image: {
    width: '100%',
    height: 220,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  expandIconContainer: {
    position: 'absolute',
    top: 8,
    right: 8,
    padding: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  refineButton: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  refineButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
});

export default ImageBubble;

function calcHeight(_uri: string, maxWidth: number): number {
  // Reasonable default height to avoid layout jump.
  return Math.max(180, Math.floor(maxWidth * 0.75));
}
