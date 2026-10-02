import React from 'react';
import { StyleSheet, Animated, Easing } from 'react-native';
import { Box } from '../../atoms';
import { useTheme } from '../../../theme';

interface HistoryListSkeletonProps {
  count?: number;
}

const SkeletonCard: React.FC<{ index: number }> = React.memo(({ index }) => {
  const { theme } = useTheme();
  const animatedValue = React.useRef(new Animated.Value(0)).current;
  const animationRef = React.useRef<Animated.CompositeAnimation | null>(null);

  React.useEffect(() => {
    // Only create animation once, not on every render
    animationRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(animatedValue, {
          toValue: 1,
          duration: 1500,
          delay: Math.min(index * 100, 200), // Cap delay to prevent excessive memory use
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(animatedValue, {
          toValue: 0,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
      { iterations: 3 } // Limit iterations instead of infinite loop
    );
    
    animationRef.current.start();
    
    return () => {
      animationRef.current?.stop();
      animationRef.current = null;
    };
  }, [animatedValue, index]); // both stable per card, so the loop is created once

  const shimmerOpacity = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.7],
  });

  const baseColor = theme.colors.card;
  const shimmerColor = theme.colors.border;

  return (
    <Box style={[styles.skeletonCard, { backgroundColor: baseColor, borderColor: theme.colors.border }]}>
      {/* Header skeleton */}
      <Box style={styles.skeletonHeader}>
        <Animated.View 
          style={[
            styles.skeletonText, 
            styles.skeletonTitleLarge,
            { backgroundColor: shimmerColor, opacity: shimmerOpacity }
          ]} 
        />
        <Animated.View 
          style={[
            styles.skeletonText, 
            styles.skeletonDate,
            { backgroundColor: shimmerColor, opacity: shimmerOpacity }
          ]} 
        />
      </Box>

      {/* Preview skeleton */}
      <Box style={styles.skeletonPreview}>
        <Animated.View 
          style={[
            styles.skeletonText, 
            styles.skeletonPreviewLine,
            { backgroundColor: shimmerColor, opacity: shimmerOpacity }
          ]} 
        />
        <Animated.View 
          style={[
            styles.skeletonText, 
            styles.skeletonPreviewLineShort,
            { backgroundColor: shimmerColor, opacity: shimmerOpacity }
          ]} 
        />
      </Box>

      {/* Footer skeleton */}
      <Box style={styles.skeletonFooter}>
        <Animated.View 
          style={[
            styles.skeletonText, 
            styles.skeletonMessageCount,
            { backgroundColor: shimmerColor, opacity: shimmerOpacity }
          ]} 
        />
      </Box>
    </Box>
  );
});

export const HistoryListSkeleton: React.FC<HistoryListSkeletonProps> = React.memo(({ count = 4 }) => {
  // Limit skeleton count to prevent memory issues
  const safeCount = Math.min(count, 4);
  const skeletons = React.useMemo(
    () => Array.from({ length: safeCount }, (_, index) => (
      <SkeletonCard key={`skeleton-${index}`} index={index} />
    )),
    [safeCount]
  );

  return <Box style={styles.container}>{skeletons}</Box>;
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  skeletonCard: {
    marginBottom: 12,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  skeletonHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  skeletonPreview: {
    marginBottom: 12,
  },
  skeletonFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  skeletonText: {
    borderRadius: 4,
  },
  skeletonTitleLarge: {
    height: 20,
    width: '60%',
  },
  skeletonDate: {
    height: 14,
    width: 80,
  },
  skeletonPreviewLine: {
    height: 16,
    width: '100%',
    marginBottom: 8,
  },
  skeletonPreviewLineShort: {
    height: 16,
    width: '75%',
  },
  skeletonMessageCount: {
    height: 14,
    width: 70,
  },
});