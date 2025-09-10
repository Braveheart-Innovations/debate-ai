import React from 'react';
import { View, TextInput } from 'react-native';
import { Typography, ParameterLabel, IconButton } from '@/components/molecules';
import { useTheme } from '@/theme';

interface ParameterSliderProps {
  name: string;
  value: number;
  min: number;
  max: number;
  step: number;
  description?: string;
  onChange: (value: number) => void;
}

export const ParameterSlider: React.FC<ParameterSliderProps> = ({
  name,
  value,
  min,
  max,
  step,
  description,
  onChange,
}) => {
  const { theme } = useTheme();
  
  const handleDecrement = () => {
    const newValue = Math.max(min, value - step);
    onChange(Number(newValue.toFixed(2)));
  };
  
  const handleIncrement = () => {
    const newValue = Math.min(max, value + step);
    onChange(Number(newValue.toFixed(2)));
  };
  
  const handleTextChange = (text: string) => {
    const num = parseFloat(text);
    if (!isNaN(num) && num >= min && num <= max) {
      onChange(num);
    }
  };
  
  return (
    <View style={{ marginBottom: theme.spacing.md }}>
      <ParameterLabel 
        name={name}
        value={value}
        description={description}
      />
      
      <View style={{ 
        flexDirection: 'row', 
        alignItems: 'center',
        marginTop: theme.spacing.sm,
      }}>
        <IconButton 
          type="decrement"
          onPress={handleDecrement}
          disabled={value <= min}
        />
        
        <TextInput
          style={{
            flex: 1,
            marginHorizontal: theme.spacing.md,
            backgroundColor: theme.colors.background,
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: theme.borderRadius.sm,
            paddingHorizontal: theme.spacing.md,
            paddingVertical: theme.spacing.sm,
            textAlign: 'center',
            color: theme.colors.text.primary,
            fontSize: 16,
            fontWeight: '600',
          }}
          value={String(value)}
          onChangeText={handleTextChange}
          keyboardType="numeric"
        />
        
        <IconButton 
          type="increment"
          onPress={handleIncrement}
          disabled={value >= max}
        />
      </View>
      
      <View style={{ 
        flexDirection: 'row', 
        justifyContent: 'space-between',
        marginTop: theme.spacing.xs,
      }}>
        <Typography variant="caption" color="secondary">
          Min: {min}
        </Typography>
        <Typography variant="caption" color="secondary">
          Max: {max}
        </Typography>
      </View>
    </View>
  );
};
