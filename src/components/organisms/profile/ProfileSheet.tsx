import React, { useRef, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  Animated,
  Dimensions,
  PanResponder,
  TouchableWithoutFeedback,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SheetHandle } from '../../molecules/SheetHandle';
import { ProfileContent } from './ProfileContent';
import { useTheme } from '../../../theme';

interface ProfileSheetProps {
  visible: boolean;
  onClose: () => void;
  onSettingsPress?: () => void;
  onSubscriptionPress?: () => void;
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.4; // 40% of screen height
const SWIPE_THRESHOLD = 50;

export const ProfileSheet: React.FC<ProfileSheetProps> = ({
  visible,
  onClose,
  onSettingsPress,
  onSubscriptionPress,
}) => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  
  const translateY = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const panY = useRef(0);

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

  if (!visible) {
    return null;
  }

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
          {...panResponder.panHandlers}
        >
          <View style={styles.handleContainer}>
            <SheetHandle />
          </View>
          
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
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -4,
    },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 16,
  },
  handleContainer: {
    paddingTop: 8,
  },
});