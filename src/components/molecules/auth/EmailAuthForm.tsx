import React, { useState } from 'react';
import { View, TextInput, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../theme';
import { Typography } from '../Typography';
import { Button } from '../Button';

interface EmailAuthFormProps {
  mode: 'signin' | 'signup';
  onSubmit: (email: string, password: string) => void;
  loading?: boolean;
}

export const EmailAuthForm: React.FC<EmailAuthFormProps> = ({ 
  mode, 
  onSubmit, 
  loading = false 
}) => {
  const { theme } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; confirmPassword?: string }>({});
  
  const validateForm = () => {
    const newErrors: typeof errors = {};
    
    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email) {
      newErrors.email = 'Email is required';
    } else if (!emailRegex.test(email)) {
      newErrors.email = 'Please enter a valid email';
    }
    
    // Password validation
    if (!password) {
      newErrors.password = 'Password is required';
    } else if (password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }
    
    // Confirm password validation (signup only)
    if (mode === 'signup') {
      if (!confirmPassword) {
        newErrors.confirmPassword = 'Please confirm your password';
      } else if (password !== confirmPassword) {
        newErrors.confirmPassword = 'Passwords do not match';
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
  
  const handleSubmit = () => {
    if (validateForm()) {
      onSubmit(email, password);
    }
  };
  
  return (
    <View style={styles.container}>
      <View style={styles.inputContainer}>
        <View style={[
          styles.inputWrapper,
          { 
            backgroundColor: theme.colors.surface,
            borderColor: errors.email ? theme.colors.error[500] : theme.colors.border,
          }
        ]}>
          <Ionicons name="mail-outline" size={20} color={theme.colors.text.secondary} />
          <TextInput
            style={[styles.input, { color: theme.colors.text.primary }]}
            placeholder="Email address"
            placeholderTextColor={theme.colors.text.disabled}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!loading}
          />
        </View>
        {errors.email && (
          <Typography variant="caption" color="error" style={styles.errorText}>
            {errors.email}
          </Typography>
        )}
      </View>
      
      <View style={styles.inputContainer}>
        <View style={[
          styles.inputWrapper,
          { 
            backgroundColor: theme.colors.surface,
            borderColor: errors.password ? theme.colors.error[500] : theme.colors.border,
          }
        ]}>
          <Ionicons name="lock-closed-outline" size={20} color={theme.colors.text.secondary} />
          <TextInput
            style={[styles.input, { color: theme.colors.text.primary }]}
            placeholder="Password"
            placeholderTextColor={theme.colors.text.disabled}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!loading}
          />
          <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
            <Ionicons 
              name={showPassword ? "eye-outline" : "eye-off-outline"} 
              size={20} 
              color={theme.colors.text.secondary} 
            />
          </TouchableOpacity>
        </View>
        {errors.password && (
          <Typography variant="caption" color="error" style={styles.errorText}>
            {errors.password}
          </Typography>
        )}
      </View>
      
      {mode === 'signup' && (
        <View style={styles.inputContainer}>
          <View style={[
            styles.inputWrapper,
            { 
              backgroundColor: theme.colors.surface,
              borderColor: errors.confirmPassword ? theme.colors.error[500] : theme.colors.border,
            }
          ]}>
            <Ionicons name="lock-closed-outline" size={20} color={theme.colors.text.secondary} />
            <TextInput
              style={[styles.input, { color: theme.colors.text.primary }]}
              placeholder="Confirm password"
              placeholderTextColor={theme.colors.text.disabled}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
            />
          </View>
          {errors.confirmPassword && (
            <Typography variant="caption" color="error" style={styles.errorText}>
              {errors.confirmPassword}
            </Typography>
          )}
        </View>
      )}
      
      <Button
        title={mode === 'signup' ? 'Create Account' : 'Sign In'}
        onPress={handleSubmit}
        variant="primary"
        fullWidth
        loading={loading}
        style={styles.submitButton}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    height: 48,
    gap: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
  },
  errorText: {
    marginTop: 4,
    marginLeft: 4,
  },
  submitButton: {
    marginTop: 8,
  },
});