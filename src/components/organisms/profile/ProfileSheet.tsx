import React, { useRef, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  Animated,
  Dimensions,
  PanResponder,
  TouchableWithoutFeedback,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { SheetHandle } from '../../molecules/SheetHandle';
import { ProfileContent } from './ProfileContent';
import { Typography } from '../../molecules/Typography';
import { useTheme } from '../../../theme';

interface ProfileSheetProps {
  visible: boolean;
  onClose: () => void;
  onSettingsPress?: () => void;
  onSubscriptionPress?: () => void;
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.85; // Increased for auth content
const SWIPE_THRESHOLD = 50;

export const ProfileSheet: React.FC<ProfileSheetProps> = ({
  visible,
  onClose,
  onSettingsPress,
  onSubscriptionPress,
}) => {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  
  const translateY = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const panY = useRef(0);
  
  // Get gradient colors (same as UnifiedSettings)
  const gradientColors: readonly [string, string, ...string[]] = isDark
    ? [theme.colors.gradients.primary[0], theme.colors.gradients.primary[1], theme.colors.primary[700] as string]
    : [theme.colors.gradients.primary[0], theme.colors.gradients.premium[1], theme.colors.gradients.sunrise[0] as string];

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dy) > 5;
      },
      onPanResponderGrant: () => {
        panY.current = (translateY as unknown as { _value: number })._value;
      },
      onPanResponderMove: (_, gestureState) => {
        const newY = panY.current + gestureState.dy;
        if (newY >= 0) {
          translateY.setValue(newY);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        const shouldClose = gestureState.dy > SWIPE_THRESHOLD || gestureState.vy > 0.5;
        
        if (shouldClose) {
          closeSheet();
        } else {
          // Snap back to open position
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            tension: 100,
            friction: 8,
          }).start();
        }
      },
    })
  ).current;

  const openSheet = useCallback(() => {
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      tension: 100,
      friction: 8,
    }).start();
  }, [translateY]);

  const closeSheet = () => {
    Animated.spring(translateY, {
      toValue: SHEET_HEIGHT,
      useNativeDriver: true,
      tension: 100,
      friction: 8,
    }).start(() => {
      onClose();
    });
  };

  useEffect(() => {
    if (visible) {
      openSheet();
    } else {
      translateY.setValue(SHEET_HEIGHT);
    }
  }, [visible, translateY, openSheet]);

  const handleBackdropPress = () => {
    closeSheet();
  };

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={closeSheet}
    >
      <View style={styles.overlay}>
        <TouchableWithoutFeedback onPress={handleBackdropPress}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>
        
        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: theme.colors.background,
              paddingBottom: insets.bottom,
              height: SHEET_HEIGHT + insets.bottom,
              transform: [{ translateY }],
            }
          ]}
        >
          {/* Gradient Header with handle */}
          <LinearGradient
            colors={gradientColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerGradient}
          >
            <View style={styles.handleContainer} {...panResponder.panHandlers}>
              <SheetHandle />
            </View>
            
            <View style={styles.header}>
              <Typography variant="heading" weight="semibold" color="inverse">
                Profile
              </Typography>
              <TouchableOpacity
                onPress={closeSheet}
                style={styles.closeButton}
              >
                <Typography variant="heading" weight="medium" color="inverse">
                  ✕
                </Typography>
              </TouchableOpacity>
            </View>
          </LinearGradient>
          
          {/* Profile Content */}
          <ProfileContent
            onClose={closeSheet}
            onSettingsPress={onSettingsPress}
            onSubscriptionPress={onSubscriptionPress}
          />
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -8,
    },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 20,
  },
  headerGradient: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 16,
  },
  handleContainer: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  closeButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    minWidth: 36,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});