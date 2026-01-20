/**
 * PromptHeroInput
 *
 * Large, prominent auto-expanding text input for image generation prompts.
 * Features integrated character count and focus state styling.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  NativeSyntheticEvent,
  TextInputContentSizeChangeEventData,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  withTiming,
  useSharedValue,
} from 'react-native-reanimated';
import { useTheme } from '@/theme';
import { Typography } from '../common/Typography';

const MIN_HEIGHT = 120;
const MAX_HEIGHT = 280;

interface PromptHeroInputProps {
  value: string;
  onChangeText: (text: string) => void;
  maxLength: number;
  placeholder?: string;
  testID?: string;
}

export const PromptHeroInput: React.FC<PromptHeroInputProps> = ({
  value,
  onChangeText,
  maxLength,
  placeholder = 'Describe what you want to create...',
  testID,
}) => {
  const { theme } = useTheme();
  const [isFocused, setIsFocused] = useState(false);
  const [inputHeight, setInputHeight] = useState(MIN_HEIGHT);
  const borderOpacity = useSharedValue(0);

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    borderOpacity.value = withTiming(1, { duration: 200 });
  }, [borderOpacity]);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    borderOpacity.value = withTiming(0, { duration: 200 });
  }, [borderOpacity]);

  const handleContentSizeChange = useCallback(
    (event: NativeSyntheticEvent<TextInputContentSizeChangeEventData>) => {
      const contentHeight = event.nativeEvent.contentSize.height;
      // Add padding to content height (top + bottom padding = 40)
      const newHeight = Math.min(Math.max(contentHeight + 40, MIN_HEIGHT), MAX_HEIGHT);
      setInputHeight(newHeight);
    },
    []
  );

  const containerAnimatedStyle = useAnimatedStyle(() => {
    return {
      borderColor: borderOpacity.value === 1
        ? theme.colors.primary[500]
        : theme.colors.border,
      shadowOpacity: borderOpacity.value * 0.1,
    };
  });

  const characterCount = value.length;
  const isNearLimit = characterCount > maxLength * 0.9;

  return (
    <View style={styles.wrapper}>
      <Animated.View
        style={[
          styles.container,
          containerAnimatedStyle,
          {
            backgroundColor: theme.colors.surface,
            borderColor: isFocused ? theme.colors.primary[500] : theme.colors.border,
            height: inputHeight,
            shadowColor: theme.colors.primary[500],
          },
        ]}
      >
        <TextInput
          style={[
            styles.input,
            {
              color: theme.colors.text.primary,
              height: inputHeight - 32, // Account for character count space
            },
          ]}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.text.secondary}
          value={value}
          onChangeText={onChangeText}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onContentSizeChange={handleContentSizeChange}
          multiline
          maxLength={maxLength}
          textAlignVertical="top"
          testID={testID}
          accessibilityLabel="Image prompt input"
          accessibilityHint={`Enter a description for your image, up to ${maxLength} characters`}
        />
        <View style={styles.characterCountContainer}>
          <Typography
            variant="caption"
            color={isNearLimit ? undefined : 'secondary'}
            style={[
              styles.characterCount,
              isNearLimit && { color: theme.colors.warning[500] },
            ]}
          >
            {characterCount.toLocaleString()}/{maxLength.toLocaleString()}
          </Typography>
        </View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 8,
  },
  container: {
    borderRadius: 16,
    borderWidth: 1.5,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 3,
  },
  input: {
    fontSize: 17,
    lineHeight: 26,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  characterCountContainer: {
    position: 'absolute',
    bottom: 12,
    right: 16,
  },
  characterCount: {
    fontSize: 12,
  },
});
