import React from 'react';
import { View } from 'react-native';
import Animated, { 
  FadeOut,
  ZoomIn,
} from 'react-native-reanimated';
import { useTheme } from '@/theme';

interface SelectionIndicatorProps {
  isSelected: boolean;
  color?: string;
}

export const SelectionIndicator: React.FC<SelectionIndicatorProps> = ({
  isSelected,
  color,
}) => {
  const { theme } = useTheme();
  
  if (!isSelected) return null;
  
  return (
    <Animated.View
      entering={ZoomIn.springify()}
      exiting={FadeOut}
      style={{
        position: 'absolute',
        top: -4,
        right: -4,
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: color || theme.colors.success[500],
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1,
      }}
    >
      <View
        style={{
          width: 12,
          height: 8,
          borderLeftWidth: 2,
          borderBottomWidth: 2,
          borderColor: '#FFFFFF',
          transform: [{ rotate: '-45deg' }, { translateY: -2 }],
        }}
      />
    </Animated.View>
  );
};
