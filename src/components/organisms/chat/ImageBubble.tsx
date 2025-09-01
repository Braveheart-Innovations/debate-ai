import React, { useMemo, useState } from 'react';
import { Image, StyleSheet, TouchableOpacity, Text, Dimensions } from 'react-native';
import { Box } from '../../atoms';
import { useTheme } from '../../../theme';

export interface ImageBubbleProps {
  uris: string[];
  onPressImage?: (uri: string) => void;
}

export const ImageBubble: React.FC<ImageBubbleProps> = ({ uris, onPressImage }) => {
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
          style={{ marginBottom: 8 }}
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
});

export default ImageBubble;

function calcHeight(_uri: string, maxWidth: number): number {
  // Reasonable default height to avoid layout jump.
  return Math.max(180, Math.floor(maxWidth * 0.75));
}
