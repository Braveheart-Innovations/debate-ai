import React from 'react';
import { View, Text, ViewStyle, Image } from 'react-native';
import Animated, { 
  useAnimatedStyle, 
  withSpring,
  useSharedValue,
  withSequence,
} from 'react-native-reanimated';
import { useTheme } from '@/theme';

interface AIAvatarProps {
  icon?: string | number; // Letter(s) or image source (require returns number)
  iconType?: 'letter' | 'image';
  size?: 'small' | 'medium' | 'large';
  color?: string;
  isSelected?: boolean;
  providerId?: string;
  style?: ViewStyle;
}

export const AIAvatar: React.FC<AIAvatarProps> = ({
  icon,
  iconType = 'letter',
  size = 'medium',
  color,
  isSelected = false,
  providerId: _providerId,
  style,
}) => {
  const { theme } = useTheme();
  const scale = useSharedValue(1);
  
  const sizeMap = {
    small: { container: 36, text: 14, image: 30 },
    medium: { container: 56, text: 20, image: 46 },
    large: { container: 140, text: 28, image: 80 },  // Made logo 80px within container (was 120px which was too big)
  };
  
  const dimensions = sizeMap[size];
  
  React.useEffect(() => {
    if (isSelected) {
      scale.value = withSequence(
        withSpring(1.1, { damping: 10 }),
        withSpring(1, { damping: 15 })
      );
    }
  }, [isSelected, scale]);
  
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  
  const renderIcon = () => {
    if (iconType === 'letter' && typeof icon === 'string') {
      return (
        <Text style={{ 
          fontSize: dimensions.text,
          fontWeight: 'bold',
          color: color || theme.colors.primary[500],
          textAlign: 'center',
        }}>
          {icon}
        </Text>
      );
    }
    
    if (iconType === 'image' && icon) {
      // Apply white tint to ALL logos for consistent appearance on colored backgrounds
      const shouldTintWhite = true;
      
      return (
        <Image
          source={typeof icon === 'number' ? icon : { uri: icon }}
          style={{ 
            width: dimensions.image, 
            height: dimensions.image,
            resizeMode: 'contain',
            ...(shouldTintWhite && { tintColor: '#FFFFFF' }),
          }}
        />
      );
    }
    
    // Fallback to first letter of icon if it's a string
    if (typeof icon === 'string') {
      return (
        <Text style={{ 
          fontSize: dimensions.text,
          fontWeight: 'bold',
          color: color || theme.colors.primary[500],
          textAlign: 'center',
        }}>
          {icon.charAt(0)}
        </Text>
      );
    }
    
    return null;
  };
  
  return (
    <Animated.View style={[animatedStyle, style]}>
      {iconType === 'image' ? (
        // Use provider's color as background like debate voting buttons - no circles
        <View
          style={{
            width: dimensions.container,
            height: dimensions.container,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: color || theme.colors.primary[500],
            borderRadius: 12, // Rounded corners, not circular
          }}
        >
          {renderIcon()}
        </View>
      ) : (
        // For letters: keep the circular design
        <View
          style={{
            width: dimensions.container,
            height: dimensions.container,
            borderRadius: dimensions.container / 2,
            backgroundColor: color 
              ? `${color}20` 
              : theme.colors.surface,
            justifyContent: 'center',
            alignItems: 'center',
            borderWidth: 2,
            borderColor: color || theme.colors.primary[500],
          }}
        >
          {renderIcon()}
        </View>
      )}
    </Animated.View>
  );
};
