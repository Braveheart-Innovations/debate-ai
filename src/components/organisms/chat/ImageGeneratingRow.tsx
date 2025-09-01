import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View, LayoutChangeEvent, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Box } from '../../atoms';
import { Typography } from '../../molecules';
import { useTheme } from '../../../theme';
import { Message } from '../../../types';

export interface ImageGeneratingRowProps {
  message: Message;
  onCancel?: (message: Message) => void;
  onRetry?: (message: Message) => void;
}

export const ImageGeneratingRow: React.FC<ImageGeneratingRowProps> = ({ message, onCancel, onRetry }) => {
  void onRetry; // reserved for future retry link; avoids unused warning
  const { theme } = useTheme();
  const translate = useRef(new Animated.Value(0)).current;
  const [containerWidth, setContainerWidth] = useState(0);
  const [dotStep, setDotStep] = useState(0);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(translate, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: true,
      })
    );
    translate.setValue(0);
    loop.start();
    const interval = setInterval(() => setDotStep(prev => (prev + 1) % 4), 500);
    return () => {
      loop.stop();
      clearInterval(interval);
    };
  }, [translate]);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w !== containerWidth) setContainerWidth(w);
  };

  const shimmerWidth = Math.max(120, Math.floor(containerWidth * 0.45));
  const translateRange = containerWidth + shimmerWidth;
  const tx = translate.interpolate({
    inputRange: [0, 1],
    outputRange: [-shimmerWidth, translateRange],
  });

  const dots = '.'.repeat(dotStep);
  const meta = message.metadata as { providerMetadata?: { imageStartTime?: number; imagePhase?: string } } | undefined;
  const startedAt = meta?.providerMetadata?.imageStartTime || message.timestamp;
  const elapsedSec = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const phase = (() => {
    if (meta?.providerMetadata?.imagePhase === 'error') return 'Error';
    if (meta?.providerMetadata?.imagePhase === 'cancelled') return 'Cancelled';
    const s = elapsedSec;
    if (s < 1) return 'Sending';
    if (s < 5) return 'Queued';
    if (s < 60) return 'Rendering';
    return 'Rendering';
  })();

  // Aspect-aware height based on requested size (if available)
  const params = (message.metadata as { providerMetadata?: { imageParams?: { size?: 'auto' | 'square' | 'portrait' | 'landscape' } } } | undefined)?.providerMetadata?.imageParams;
  const aspect = params?.size || 'square';
  const baseHeight = (() => {
    if (containerWidth <= 0) return 220;
    switch (aspect) {
      case 'portrait':
        return Math.floor(containerWidth * 0.9);
      case 'landscape':
        return Math.floor(containerWidth * 0.5);
      case 'auto':
        return Math.floor(containerWidth * 0.65);
      case 'square':
      default:
        return Math.floor(containerWidth * 0.75);
    }
  })();

  return (
    <Box style={styles.container}>
      <Box style={{ marginBottom: 4 }}>
        <Typography variant="caption" weight="semibold" style={{ color: theme.colors.text.secondary }}>
          {message.sender}
        </Typography>
      </Box>
      <View style={[styles.skeleton, { backgroundColor: theme.colors.gray[200], borderColor: theme.colors.border, height: baseHeight }]} onLayout={onLayout}>
        {/* Outline pulse */}
        <Animated.View style={[styles.outlinePulse, { borderColor: theme.colors.primary[500], opacity: translate.interpolate({ inputRange: [0,1], outputRange: [0.35, 0.6] }) }]} />
        {containerWidth > 0 && (
          <Animated.View style={[styles.shimmerOverlay, { transform: [{ translateX: tx }] }]}>
            <LinearGradient
              colors={[ 'rgba(255,255,255,0.0)', 'rgba(255,255,255,0.8)', 'rgba(255,255,255,0.0)' ]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ width: shimmerWidth, height: '100%' }}
            />
          </Animated.View>
        )}
      </View>
      <Box style={[styles.metaRow, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
        <Typography variant="caption" color="secondary">{phase} • {elapsedSec}s {dots}</Typography>
        <Box style={{ flexDirection: 'row' }}>
          <View style={{ paddingHorizontal: 8 }}>
            <Typography variant="caption" color="secondary"> </Typography>
          </View>
          <TouchableOpacity activeOpacity={0.7} onPress={() => onCancel?.(message)}>
            <Typography variant="caption" color="secondary">Cancel</Typography>
          </TouchableOpacity>
          {phase === 'Error' || phase === 'Cancelled' ? (
            <TouchableOpacity activeOpacity={0.7} onPress={() => onRetry?.(message)} style={{ marginLeft: 16 }}>
              <Typography variant="caption" color="secondary">Retry</Typography>
            </TouchableOpacity>
          ) : null}
        </Box>
      </Box>
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
  skeleton: {
    width: '100%',
    height: 220,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  metaRow: { marginTop: 4 },
  shimmerOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
  },
  outlinePulse: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    borderRadius: 8,
    borderWidth: 2,
  },
});

export default ImageGeneratingRow;
