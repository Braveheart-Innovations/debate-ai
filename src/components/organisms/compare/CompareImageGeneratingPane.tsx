import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View, LayoutChangeEvent, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Box } from '../../atoms';
import { Typography } from '../../molecules';
import { useTheme } from '../../../theme';
import { AIConfig } from '../../../types';
import type { BrandColor } from '@/constants/aiColors';

export type ImagePhase = 'sending' | 'queued' | 'rendering' | 'error' | 'cancelled' | 'done';
export type ImageAspectRatio = 'square' | 'portrait' | 'landscape' | 'auto';

export interface CompareImageGeneratingPaneProps {
  ai: AIConfig;
  side: 'left' | 'right';
  startTime: number;
  phase: ImagePhase;
  aspectRatio: ImageAspectRatio;
  onCancel: () => void;
  onRetry?: () => void;
  brandPalette?: BrandColor | null;
}

export const CompareImageGeneratingPane: React.FC<CompareImageGeneratingPaneProps> = ({
  ai,
  side,
  startTime,
  phase,
  aspectRatio,
  onCancel,
  onRetry,
  brandPalette,
}) => {
  const { theme, isDark } = useTheme();
  const translate = useRef(new Animated.Value(0)).current;
  const [containerWidth, setContainerWidth] = useState(0);
  const [dotStep, setDotStep] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);

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

    const dotInterval = setInterval(() => setDotStep(prev => (prev + 1) % 4), 500);
    const timeInterval = setInterval(() => {
      setElapsedSec(Math.max(0, Math.floor((Date.now() - startTime) / 1000)));
    }, 1000);

    return () => {
      loop.stop();
      clearInterval(dotInterval);
      clearInterval(timeInterval);
    };
  }, [translate, startTime]);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w !== containerWidth) setContainerWidth(w);
  };

  const shimmerWidth = Math.max(80, Math.floor(containerWidth * 0.45));
  const translateRange = containerWidth + shimmerWidth;
  const tx = translate.interpolate({
    inputRange: [0, 1],
    outputRange: [-shimmerWidth, translateRange],
  });

  const dots = '.'.repeat(dotStep);

  // Determine phase display text
  const phaseText = (() => {
    if (phase === 'error') return 'Error';
    if (phase === 'cancelled') return 'Cancelled';
    if (phase === 'done') return 'Done';
    if (elapsedSec < 1) return 'Sending';
    if (elapsedSec < 5) return 'Queued';
    return 'Rendering';
  })();

  // Aspect-aware height for pane layout (smaller than full chat row)
  const baseHeight = (() => {
    if (containerWidth <= 0) return 140;
    switch (aspectRatio) {
      case 'portrait':
        return Math.floor(containerWidth * 1.2);
      case 'landscape':
        return Math.floor(containerWidth * 0.6);
      case 'auto':
        return Math.floor(containerWidth * 0.8);
      case 'square':
      default:
        return Math.floor(containerWidth * 0.9);
    }
  })();

  const accentColor = brandPalette
    ? brandPalette[500]
    : (side === 'left' ? theme.colors.warning[500] : theme.colors.info[500]);

  const isErrorState = phase === 'error' || phase === 'cancelled';

  return (
    <Box style={styles.container}>
      <Box style={styles.headerRow}>
        <Typography variant="caption" weight="semibold" style={{ color: theme.colors.text.secondary }}>
          {ai.name}
        </Typography>
      </Box>
      <View
        style={[
          styles.skeleton,
          {
            backgroundColor: isDark ? theme.colors.gray[800] : theme.colors.gray[200],
            borderColor: theme.colors.border,
            height: baseHeight,
          },
        ]}
        onLayout={onLayout}
      >
        {/* Outline pulse */}
        <Animated.View
          style={[
            styles.outlinePulse,
            {
              borderColor: accentColor,
              opacity: translate.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.6] }),
            },
          ]}
        />
        {/* Shimmer effect */}
        {containerWidth > 0 && !isErrorState && (
          <Animated.View style={[styles.shimmerOverlay, { transform: [{ translateX: tx }] }]}>
            <LinearGradient
              colors={[
                'rgba(255,255,255,0.0)',
                isDark ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.8)',
                'rgba(255,255,255,0.0)',
              ]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ width: shimmerWidth, height: '100%' }}
            />
          </Animated.View>
        )}
        {/* Error/Cancelled indicator */}
        {isErrorState && (
          <View style={styles.errorOverlay}>
            <Typography variant="body" color="error">
              {phase === 'error' ? 'Generation failed' : 'Generation cancelled'}
            </Typography>
          </View>
        )}
      </View>
      <Box style={styles.metaRow}>
        <Typography variant="caption" color="secondary">
          {phaseText} • {elapsedSec}s {dots}
        </Typography>
        <Box style={styles.actionRow}>
          {!isErrorState && phase !== 'done' && (
            <TouchableOpacity activeOpacity={0.7} onPress={onCancel}>
              <Typography variant="caption" color="secondary">
                Cancel
              </Typography>
            </TouchableOpacity>
          )}
          {isErrorState && onRetry && (
            <TouchableOpacity activeOpacity={0.7} onPress={onRetry}>
              <Typography variant="caption" style={{ color: accentColor }}>
                Retry
              </Typography>
            </TouchableOpacity>
          )}
        </Box>
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
  skeleton: {
    width: '100%',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  metaRow: {
    marginTop: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
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
  errorOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default CompareImageGeneratingPane;
