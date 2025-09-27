import React from 'react';
import { TouchableOpacity, StyleSheet, View } from 'react-native';
import { Typography } from '../../molecules';
import { useTheme } from '../../../theme';

interface ContinueButtonProps {
  onPress: () => void;
  isDisabled?: boolean;
  side: 'left' | 'right';
  accentColor?: string;
}

export const ContinueButton: React.FC<ContinueButtonProps> = ({ 
  onPress, 
  isDisabled = false,
  side,
  accentColor,
}) => {
  const { theme, isDark } = useTheme();
  
  const resolvedAccent = accentColor || (side === 'left' ? theme.colors.warning[500] : theme.colors.info[500]);
  const textAccent = accentColor
    ? accentColor
    : (side === 'left' ? theme.colors.warning[700] : theme.colors.info[700]);

  const buttonColors = {
    backgroundColor: isDisabled 
      ? theme.colors.disabled[100] 
      : theme.colors.background,
    borderColor: isDisabled 
      ? theme.colors.disabled[300]
      : resolvedAccent,
    textColor: isDisabled
      ? theme.colors.text.disabled
      : textAccent,
  };

  const containerStyle = {
    borderTopColor: theme.colors.border,
    backgroundColor: isDark ? theme.colors.card : theme.colors.background,
    shadowOpacity: isDark ? 0 : 0.15,
    elevation: isDark ? 0 : 4,
  } as const;

  return (
    <View style={[styles.container, containerStyle]}>
      <TouchableOpacity 
        onPress={onPress}
        disabled={isDisabled}
        style={[
          styles.button,
          {
            backgroundColor: 'transparent',
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
    borderTopWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowRadius: 4,
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 0,
  },
});
