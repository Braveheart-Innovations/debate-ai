import React from 'react';
import { Alert } from 'react-native';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

// Mock Alert.prompt (iOS only method)
jest.spyOn(Alert, 'prompt');

// Mock password reset service
const mockSendPasswordResetEmail = jest.fn();
jest.mock('@/services/firebase/auth', () => ({
  sendPasswordResetEmail: () => mockSendPasswordResetEmail(),
}));

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text, TouchableOpacity } = require('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) =>
      React.createElement(Text, null, children),
    Button: ({ title, onPress, loading }: any) =>
      React.createElement(
        TouchableOpacity,
        { onPress, disabled: loading },
        React.createElement(Text, null, loading ? 'Loading...' : title)
      ),
  };
});

const { EmailAuthForm } = require('@/components/molecules/auth/EmailAuthForm');

describe('EmailAuthForm', () => {
  const mockOnSubmit = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockSendPasswordResetEmail.mockReset();
  });

  describe('Sign In Mode', () => {
    it('renders email and password inputs', () => {
      const { getByPlaceholderText } = renderWithProviders(
        <EmailAuthForm mode="signin" onSubmit={mockOnSubmit} />
      );

      expect(getByPlaceholderText('Email address')).toBeTruthy();
      expect(getByPlaceholderText('Password')).toBeTruthy();
    });

    it('renders Sign In button', () => {
      const { getByText } = renderWithProviders(
        <EmailAuthForm mode="signin" onSubmit={mockOnSubmit} />
      );

      expect(getByText('Sign In')).toBeTruthy();
    });

    it('does not render confirm password field', () => {
      const { queryByPlaceholderText } = renderWithProviders(
        <EmailAuthForm mode="signin" onSubmit={mockOnSubmit} />
      );

      expect(queryByPlaceholderText('Confirm password')).toBeNull();
    });

    it('validates email format', () => {
      const { getByPlaceholderText, getByText } = renderWithProviders(
        <EmailAuthForm mode="signin" onSubmit={mockOnSubmit} />
      );

      const emailInput = getByPlaceholderText('Email address');
      const passwordInput = getByPlaceholderText('Password');
      const submitButton = getByText('Sign In');

      fireEvent.changeText(emailInput, 'invalid-email');
      fireEvent.changeText(passwordInput, 'password123');
      fireEvent.press(submitButton);

      expect(mockOnSubmit).not.toHaveBeenCalled();
      expect(getByText('Please enter a valid email')).toBeTruthy();
    });

    it('validates required fields', () => {
      const { getByText } = renderWithProviders(
        <EmailAuthForm mode="signin" onSubmit={mockOnSubmit} />
      );

      const submitButton = getByText('Sign In');
      fireEvent.press(submitButton);

      expect(mockOnSubmit).not.toHaveBeenCalled();
      expect(getByText('Email is required')).toBeTruthy();
      expect(getByText('Password is required')).toBeTruthy();
    });

    it('validates minimum password length', () => {
      const { getByPlaceholderText, getByText } = renderWithProviders(
        <EmailAuthForm mode="signin" onSubmit={mockOnSubmit} />
      );

      const emailInput = getByPlaceholderText('Email address');
      const passwordInput = getByPlaceholderText('Password');
      const submitButton = getByText('Sign In');

      fireEvent.changeText(emailInput, 'test@example.com');
      fireEvent.changeText(passwordInput, '123');
      fireEvent.press(submitButton);

      expect(mockOnSubmit).not.toHaveBeenCalled();
      expect(getByText('Password must be at least 6 characters')).toBeTruthy();
    });

    it('submits with valid credentials', () => {
      const { getByPlaceholderText, getByText } = renderWithProviders(
        <EmailAuthForm mode="signin" onSubmit={mockOnSubmit} />
      );

      const emailInput = getByPlaceholderText('Email address');
      const passwordInput = getByPlaceholderText('Password');
      const submitButton = getByText('Sign In');

      fireEvent.changeText(emailInput, 'test@example.com');
      fireEvent.changeText(passwordInput, 'password123');
      fireEvent.press(submitButton);

      expect(mockOnSubmit).toHaveBeenCalledWith('test@example.com', 'password123');
    });
  });

  describe('Sign Up Mode', () => {
    it('renders confirm password field', () => {
      const { getByPlaceholderText } = renderWithProviders(
        <EmailAuthForm mode="signup" onSubmit={mockOnSubmit} />
      );

      expect(getByPlaceholderText('Confirm password')).toBeTruthy();
    });

    it('renders Create Account button', () => {
      const { getByText } = renderWithProviders(
        <EmailAuthForm mode="signup" onSubmit={mockOnSubmit} />
      );

      expect(getByText('Create Account')).toBeTruthy();
    });

    it('validates password match', () => {
      const { getByPlaceholderText, getByText } = renderWithProviders(
        <EmailAuthForm mode="signup" onSubmit={mockOnSubmit} />
      );

      const emailInput = getByPlaceholderText('Email address');
      const passwordInput = getByPlaceholderText('Password');
      const confirmInput = getByPlaceholderText('Confirm password');
      const submitButton = getByText('Create Account');

      fireEvent.changeText(emailInput, 'test@example.com');
      fireEvent.changeText(passwordInput, 'password123');
      fireEvent.changeText(confirmInput, 'different');
      fireEvent.press(submitButton);

      expect(mockOnSubmit).not.toHaveBeenCalled();
      expect(getByText('Passwords do not match')).toBeTruthy();
    });

    it('submits with valid matching passwords', () => {
      const { getByPlaceholderText, getByText } = renderWithProviders(
        <EmailAuthForm mode="signup" onSubmit={mockOnSubmit} />
      );

      const emailInput = getByPlaceholderText('Email address');
      const passwordInput = getByPlaceholderText('Password');
      const confirmInput = getByPlaceholderText('Confirm password');
      const submitButton = getByText('Create Account');

      fireEvent.changeText(emailInput, 'test@example.com');
      fireEvent.changeText(passwordInput, 'password123');
      fireEvent.changeText(confirmInput, 'password123');
      fireEvent.press(submitButton);

      expect(mockOnSubmit).toHaveBeenCalledWith('test@example.com', 'password123');
    });
  });

  describe('Loading State', () => {
    it('shows loading state on button', () => {
      const { getByLabelText, queryByText } = renderWithProviders(
        <EmailAuthForm mode="signin" onSubmit={mockOnSubmit} loading />
      );

      // Button should be disabled when loading
      const button = getByLabelText('Sign In');
      expect(button.props.accessibilityState.disabled).toBe(true);
      // Button text should not be visible when loading
      expect(queryByText('Sign In')).toBeNull();
    });

    it('disables inputs when loading', () => {
      const { getByPlaceholderText } = renderWithProviders(
        <EmailAuthForm mode="signin" onSubmit={mockOnSubmit} loading />
      );

      const emailInput = getByPlaceholderText('Email address');
      const passwordInput = getByPlaceholderText('Password');

      expect(emailInput.props.editable).toBe(false);
      expect(passwordInput.props.editable).toBe(false);
    });
  });

  describe('Forgot Password', () => {
    it('shows Forgot Password link in signin mode', () => {
      const { getByText } = renderWithProviders(
        <EmailAuthForm mode="signin" onSubmit={mockOnSubmit} />
      );

      expect(getByText('Forgot Password?')).toBeTruthy();
    });

    it('does not show Forgot Password link in signup mode', () => {
      const { queryByText } = renderWithProviders(
        <EmailAuthForm mode="signup" onSubmit={mockOnSubmit} />
      );

      expect(queryByText('Forgot Password?')).toBeNull();
    });

    it('opens password reset prompt when Forgot Password is pressed', () => {
      const { getByText } = renderWithProviders(
        <EmailAuthForm mode="signin" onSubmit={mockOnSubmit} />
      );

      fireEvent.press(getByText('Forgot Password?'));

      expect(Alert.prompt).toHaveBeenCalledWith(
        'Reset Password',
        expect.stringContaining('Enter your email'),
        expect.any(Array),
        'plain-text',
        ''
      );
    });

    it('pre-fills email in prompt when email is entered', () => {
      const { getByText, getByPlaceholderText } = renderWithProviders(
        <EmailAuthForm mode="signin" onSubmit={mockOnSubmit} />
      );

      const emailInput = getByPlaceholderText('Email address');
      fireEvent.changeText(emailInput, 'prefilled@example.com');

      fireEvent.press(getByText('Forgot Password?'));

      expect(Alert.prompt).toHaveBeenCalledWith(
        'Reset Password',
        expect.any(String),
        expect.any(Array),
        'plain-text',
        'prefilled@example.com'
      );
    });
  });
});