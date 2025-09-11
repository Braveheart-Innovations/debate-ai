import React from 'react';
import { View, Text } from 'react-native';
import { useTheme } from '@/theme';

interface BadgeProps {
  label: string;
  type?: 'premium' | 'default' | 'new' | 'experimental';
}

export const Badge: React.FC<BadgeProps> = ({
  label,
  type = 'default',
}) => {
  const { theme } = useTheme();
  
  const getColors = () => {
    switch (type) {
      case 'premium':
        return {
          bg: theme.colors.warning[500],
          text: '#FFFFFF',
        };
      case 'new':
        return {
          bg: theme.colors.success[500],
          text: '#FFFFFF',
        };
      case 'experimental':
        return {
          bg: theme.colors.primary[400],
          text: '#FFFFFF',
        };
      default:
        return {
          bg: theme.colors.gray[200],
          text: theme.colors.text.secondary,
        };
    }
  };
  
  const colors = getColors();
  
  return (
    <View style={{
      backgroundColor: colors.bg,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 12,
    }}>
      <Text style={{ 
        color: colors.text, 
        fontSize: 10, 
        fontWeight: 'bold',
        textTransform: 'uppercase',
      }}>
        {label}
      </Text>
    </View>
  );
};
