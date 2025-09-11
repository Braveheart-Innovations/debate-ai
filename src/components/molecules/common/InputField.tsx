import React from 'react';
import { StyleSheet, TextInput, TextInputProps, ViewStyle } from 'react-native';
import { Box } from '@/components/atoms';
import { Typography } from './Typography';
import { useTheme } from '@/theme';

interface InputFieldProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  error?: string;
  helperText?: string;
  containerStyle?: ViewStyle;
  inputStyle?: ViewStyle;
}

export const InputField: React.FC<InputFieldProps> = ({
  label,
  error,
  helperText,
  containerStyle,
  inputStyle,
  ...inputProps
}) => {
  const { theme } = useTheme();

  return (
    <Box style={[styles.container, containerStyle]}>
      {label && (
        <Typography
          variant="caption"
          color="secondary"
          style={styles.label}
        >
          {label}
        </Typography>
      )}
      
      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: theme.colors.surface,
            borderColor: error ? theme.colors.error[500] : theme.colors.border,
            color: theme.colors.text.primary,
          },
          inputStyle,
        ]}
        placeholderTextColor={theme.colors.text.disabled}
        {...inputProps}
      />
      
      {error && (
        <Typography
          variant="caption"
          color="error"
          style={styles.errorText}
        >
          {error}
        </Typography>
      )}
      
      {helperText && !error && (
        <Typography
          variant="caption"
          color="secondary"
          style={styles.helperText}
        >
          {helperText}
        </Typography>
      )}
    </Box>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  errorText: {
    marginTop: 4,
  },
  helperText: {
    marginTop: 4,
  },
});

