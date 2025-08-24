import React from 'react';
import { TouchableOpacity, StyleSheet, View } from 'react-native';
import { Typography } from '../../molecules';
import { useTheme } from '../../../theme';

interface ContinueButtonProps {
  onPress: () => void;
  isDisabled?: boolean;
  side: 'left' | 'right';
}

export const ContinueButton: React.FC<ContinueButtonProps> = ({ 
  onPress, 
  isDisabled = false,
  side 
}) => {
  const { theme } = useTheme();
  
  const buttonColors = {
    backgroundColor: isDisabled 
      ? theme.colors.disabled[100] 
      : theme.colors.background,
    borderColor: isDisabled 
      ? theme.colors.disabled[300]
      : side === 'left' 
        ? theme.colors.warning[500] 
        : theme.colors.info[500],
    textColor: isDisabled
      ? theme.colors.text.disabled
      : side === 'left'
        ? theme.colors.warning[700]
        : theme.colors.info[700],
  };

  return (
    <View style={[styles.container, { borderTopColor: theme.colors.border }]}>
      <TouchableOpacity 
        onPress={onPress}
        disabled={isDisabled}
        style={[
          styles.button,
          {
            backgroundColor: buttonColors.backgroundColor,
            borderColor: buttonColors.borderColor,
            opacity: isDisabled ? 0.5 : 1,
          }
        ]}
        activeOpacity={0.7}
      >
        <Typography 
          variant="body" 
          weight="semibold"
          style={{ color: buttonColors.textColor }}
        >
          Continue with this AI
        </Typography>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderTopWidth: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
});