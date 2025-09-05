import React, { useEffect } from 'react';
import { View, StyleSheet, ImageSourcePropType } from 'react-native';
import Animated, {
  FadeInDown,
  FadeOut,
  useAnimatedStyle,
  withSpring,
  useSharedValue,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Typography } from '../../molecules';
import { useTheme } from '../../../theme';

export interface SystemAnnouncementProps {
  type: 'topic' | 'exchange-winner' | 'debate-complete' | 'overall-winner' | 'debate-start';
  label?: string;
  content: string;
  icon?: string | ImageSourcePropType;
  gradient?: [string, string];
  brandColor?: string;
  animation?: 'fade' | 'slide-up' | 'scale';
  onDismiss?: () => void;
}

export const SystemAnnouncement: React.FC<SystemAnnouncementProps> = ({
  type,
  label,
  content,
  icon,
  gradient,
  brandColor,
  animation = 'fade',
}) => {
  const { theme, isDark } = useTheme();
  const scale = useSharedValue(0.95);
  
  useEffect(() => {
    scale.value = withSpring(1, { damping: 15 });
  }, [scale]);
  
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  
  const getEnteringAnimation = () => {
    switch (animation) {
      case 'slide-up':
        return FadeInDown.springify().damping(15);
      case 'scale':
        return FadeInDown.duration(300);
      default:
        return FadeInDown.duration(400);
    }
  };
  
  const getDefaultGradient = (): [string, string] => {
    switch (type) {
      case 'topic':
        return [theme.colors.semantic.primary, theme.colors.semantic.secondary];
      case 'debate-start':
        return [theme.colors.semantic.info, theme.colors.semantic.primary];
      case 'exchange-winner':
        return [theme.colors.semantic.success, theme.colors.semantic.info];
      case 'debate-complete':
        return [theme.colors.semantic.warning, theme.colors.semantic.error];
      case 'overall-winner':
        return [theme.colors.semantic.gold, theme.colors.semantic.secondary];
      default:
        return [theme.colors.semantic.primary, theme.colors.semantic.secondary];
    }
  };
  
  const getDefaultIcon = (): string => {
    switch (type) {
      case 'topic':
        return ''; // No icon for topic - looks cleaner
      case 'debate-start':
        return '🥊';
      case 'exchange-winner':
        return '🎯';
      case 'debate-complete':
        return '🏁';
      case 'overall-winner':
        return '🏆';
      default:
        return '📢';
    }
  };
  
  return (
    <Animated.View
      entering={getEnteringAnimation()}
      exiting={FadeOut.duration(200)}
      style={styles.container}
    >
      <Animated.View style={animatedStyle}>
        <BlurView intensity={isDark ? 80 : 60} style={styles.blurContainer}>
          <LinearGradient
            colors={gradient || getDefaultGradient()}
            style={styles.gradientOverlay}
          >
            {label && (
              <Typography
                variant="caption"
                weight="semibold"
                style={{
                  ...styles.label,
                  color: brandColor || theme.colors.text.secondary
                }}
              >
                {label}
              </Typography>
            )}
            
            <View style={styles.contentRow}>
              {(() => {
                const displayIcon = typeof icon === 'string' ? icon : getDefaultIcon();
                return displayIcon ? (
                  <Typography variant="title" style={styles.icon}>
                    {displayIcon}
                  </Typography>
                ) : null;
              })()}
              <Typography
                variant="body"
                weight="bold"
                align="center"
                style={styles.content}
              >
                {content}
              </Typography>
            </View>
          </LinearGradient>
        </BlurView>
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
    marginHorizontal: 16,
  },
  blurContainer: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  gradientOverlay: {
    padding: 16,
    minHeight: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    marginBottom: 4,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  icon: {
    fontSize: 24,
  },
  content: {
    flex: 1,
    textAlign: 'center',
  },
});
