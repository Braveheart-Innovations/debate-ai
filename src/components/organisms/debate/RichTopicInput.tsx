/**
 * RichTopicInput Component
 * Enhanced text input with formatting options for debate topics
 */

import React, { useState } from 'react';
import { View, TextInput, StyleSheet, ViewStyle } from 'react-native';
import { GlassCard, Typography } from '@/components/molecules';
import { useTheme } from '../../../theme';

export interface RichTopicInputProps {
  value: string;
  onChange: (text: string) => void;
  maxLength?: number;
  placeholder?: string;
}

export const RichTopicInput: React.FC<RichTopicInputProps> = ({
  value,
  onChange,
  maxLength = 200,
  placeholder = "Enter your custom debate motion...",
}) => {
  const { theme } = useTheme();
  const [isFocused, setIsFocused] = useState(false);
  
  const handleTextChange = (text: string) => {
    onChange(text);
  };
  
  const dynamicContainerStyle: ViewStyle = {
    ...styles.container,
    borderColor: isFocused ? theme.colors.primary[500] : theme.colors.border,
    borderWidth: isFocused ? 2 : 1,
  };
  
  return (
    <GlassCard style={dynamicContainerStyle}>
      <TextInput
        value={value}
        onChangeText={handleTextChange}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.text.disabled}
        multiline
        maxLength={maxLength}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        style={[
          styles.input,
          {
            color: theme.colors.text.primary,
            backgroundColor: 'transparent',
          },
        ]}
        textAlignVertical="top"
      />
      
      <View style={[styles.simplifiedToolbar, { 
        borderTopColor: theme.colors.border,
        backgroundColor: theme.colors.overlays.subtle,
      }]}>
        <Typography 
          variant="caption" 
          color="secondary"
          style={value.length > maxLength * 0.9 ? 
            { ...styles.counter, color: theme.colors.error[500] } : 
            styles.counter
          }
        >
          {value.length}/{maxLength}
        </Typography>
      </View>
    </GlassCard>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 0,
    overflow: 'hidden',
  },
  input: {
    fontSize: 16,
    lineHeight: 24,
    padding: 16,
    minHeight: 100,
    maxHeight: 200,
  },
  simplifiedToolbar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  counter: {
    fontSize: 12,
    fontWeight: '500',
  },
});
