/**
 * RichTopicInput Component
 * Enhanced text input with formatting options for debate topics
 */

import React, { useState } from 'react';
import { View, TextInput, StyleSheet, ViewStyle } from 'react-native';
import { GlassCard, MicButton, Typography } from '@/components/molecules';
import { useDictation } from '@/hooks/useDictation';
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
  const dictation = useDictation({ text: value, onTextChange: onChange, maxLength });

  const handleTextChange = (text: string) => {
    if (dictation.error) dictation.clearError();
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
        {dictation.isAvailable && (
          <MicButton
            isListening={dictation.isListening}
            onPress={dictation.toggle}
            testID="topic-input-mic"
          />
        )}
        <View
          style={styles.toolbarMessage}
          accessibilityRole={dictation.error ? 'alert' : undefined}
        >
          {dictation.error && (
            <Typography variant="caption" style={{ color: theme.colors.warning[600] }}>
              {dictation.error}
            </Typography>
          )}
        </View>
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
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  toolbarMessage: {
    flex: 1,
  },
  counter: {
    fontSize: 12,
    fontWeight: '500',
  },
});
