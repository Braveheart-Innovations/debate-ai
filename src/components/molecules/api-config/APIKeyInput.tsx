import React from 'react';
import { TextInput, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { Box } from '@/components/atoms';
import { Typography } from '../common/Typography';
import { useTheme } from '@/theme';

interface APIKeyInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  isEditing: boolean;
  onToggleEdit: () => void;
  hasError?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  testID?: string;
  providerName?: string; // For accessibility labels
}

export const APIKeyInput: React.FC<APIKeyInputProps> = ({
  value,
  onChange,
  placeholder,
  isEditing,
  onToggleEdit,
  hasError = false,
  disabled = false,
  style,
  testID,
  providerName = 'API provider',
}) => {
  const { theme } = useTheme();

  const getBorderColor = () => {
    if (hasError) return theme.colors.error[500];
    if (isEditing) return theme.colors.primary[500];
    return theme.colors.border;
  };

  const getBackgroundColor = () => {
    if (disabled) return theme.colors.gray[100];
    return theme.colors.surface;
  };

  return (
    <Box
      style={[
        styles.container,
        {
          borderColor: getBorderColor(),
          backgroundColor: getBackgroundColor(),
        },
        style,
      ]}
      testID={testID}
    >
      <Box style={styles.inputContainer}>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.text.secondary}
          secureTextEntry={!isEditing && value.length > 0}
          editable={!disabled}
          style={[
            styles.input,
            {
              color: theme.colors.text.primary,
              fontSize: theme.typography.sizes.base,
            },
          ]}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          accessibilityLabel={`${providerName} API key input`}
          accessibilityHint={`Enter your ${providerName} API key. Key will be hidden when not editing.`}
        />
      </Box>

      <TouchableOpacity
        onPress={onToggleEdit}
        style={styles.toggleButton}
        disabled={disabled}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityLabel={isEditing ? 'Hide API key' : 'Show API key'}
        accessibilityHint={isEditing ? 'Tap to hide the API key for security' : 'Tap to reveal the API key for editing'}
        accessibilityRole="button"
      >
        <Typography
          variant="caption"
          color="secondary"
          weight="medium"
        >
          {isEditing ? 'Hide' : 'Show'}
        </Typography>
      </TouchableOpacity>
    </Box>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 44,
  },
  inputContainer: {
    flex: 1,
  },
  input: {
    flex: 1,
    paddingVertical: 4,
    margin: 0,
    padding: 0,
  },
  toggleButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginLeft: 8,
  },
});
