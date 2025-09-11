import React from 'react';
import { TouchableOpacity, Text } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/theme';

interface IconButtonProps {
  icon?: string;
  type?: 'increment' | 'decrement'; // For backward compatibility
  onPress: () => void;
  disabled?: boolean;
  size?: number;
}

export const IconButton: React.FC<IconButtonProps> = ({
  icon,
  type,
  onPress,
  disabled = false,
  size = 36,
}) => {
  const { theme } = useTheme();
  
  const handlePress = () => {
    if (!disabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onPress();
    }
  };
  
  // Determine the icon to display
  const displayIcon = icon || (type === 'increment' ? '+' : '−');
  
  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={disabled}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: disabled 
          ? theme.colors.gray[200] 
          : theme.colors.primary[100],
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <Text style={{ 
        color: disabled 
          ? theme.colors.gray[400] 
          : theme.colors.primary[600], 
        fontSize: size * 0.55, 
        fontWeight: 'bold',
      }}>
        {displayIcon}
      </Text>
    </TouchableOpacity>
  );
};
