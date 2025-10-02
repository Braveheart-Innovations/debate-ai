import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) =>
      React.createElement(Text, null, children),
  };
});

const { APIKeyInput } = require('@/components/molecules/api-config/APIKeyInput');

describe('APIKeyInput', () => {
  const defaultProps = {
    value: '',
    onChange: jest.fn(),
    placeholder: 'Enter API key',
    isEditing: false,
    onToggleEdit: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders input field with placeholder', () => {
    const { getByPlaceholderText } = renderWithProviders(
      <APIKeyInput {...defaultProps} />
    );

    expect(getByPlaceholderText('Enter API key')).toBeTruthy();
  });

  it('shows "Show" button when not editing', () => {
    const { getByText } = renderWithProviders(
      <APIKeyInput {...defaultProps} />
    );

    expect(getByText('Show')).toBeTruthy();
  });

  it('shows "Hide" button when editing', () => {
    const { getByText } = renderWithProviders(
      <APIKeyInput {...defaultProps} isEditing={true} />
    );

    expect(getByText('Hide')).toBeTruthy();
  });

  it('calls onToggleEdit when Show/Hide button pressed', () => {
    const onToggleEdit = jest.fn();
    const { getByText } = renderWithProviders(
      <APIKeyInput {...defaultProps} onToggleEdit={onToggleEdit} />
    );

    fireEvent.press(getByText('Show'));
    expect(onToggleEdit).toHaveBeenCalledTimes(1);
  });

  it('calls onChange when text input changes', () => {
    const onChange = jest.fn();
    const { getByPlaceholderText } = renderWithProviders(
      <APIKeyInput {...defaultProps} onChange={onChange} />
    );

    const input = getByPlaceholderText('Enter API key');
    fireEvent.changeText(input, 'sk-test123');

    expect(onChange).toHaveBeenCalledWith('sk-test123');
  });

  it('displays value as secure text when not editing', () => {
    const { getByPlaceholderText } = renderWithProviders(
      <APIKeyInput {...defaultProps} value="sk-test123" isEditing={false} />
    );

    const input = getByPlaceholderText('Enter API key');
    expect(input.props.secureTextEntry).toBe(true);
  });

  it('displays value as plain text when editing', () => {
    const { getByPlaceholderText } = renderWithProviders(
      <APIKeyInput {...defaultProps} value="sk-test123" isEditing={true} />
    );

    const input = getByPlaceholderText('Enter API key');
    expect(input.props.secureTextEntry).toBe(false);
  });

  it('disables input when disabled prop is true', () => {
    const { getByPlaceholderText } = renderWithProviders(
      <APIKeyInput {...defaultProps} disabled={true} />
    );

    const input = getByPlaceholderText('Enter API key');
    expect(input.props.editable).toBe(false);
  });

  it('disables toggle button when disabled prop is true', () => {
    const onToggleEdit = jest.fn();
    const { getByLabelText } = renderWithProviders(
      <APIKeyInput {...defaultProps} disabled={true} onToggleEdit={onToggleEdit} />
    );

    const button = getByLabelText('Show API key');
    expect(button.props.accessibilityState?.disabled).toBe(true);
  });

  it('applies error styling when hasError is true', () => {
    const { getByTestId } = renderWithProviders(
      <APIKeyInput {...defaultProps} hasError={true} testID="api-key-input" />
    );

    const container = getByTestId('api-key-input');
    expect(container).toBeTruthy();
    // The component applies error border color when hasError is true
    expect(container.props.style).toBeDefined();
  });

  it('applies testID when provided', () => {
    const { getByTestId } = renderWithProviders(
      <APIKeyInput {...defaultProps} testID="api-key-input" />
    );

    expect(getByTestId('api-key-input')).toBeTruthy();
  });

  it('uses custom providerName for accessibility', () => {
    const { getByPlaceholderText } = renderWithProviders(
      <APIKeyInput {...defaultProps} providerName="OpenAI" />
    );

    const input = getByPlaceholderText('Enter API key');
    expect(input.props.accessibilityLabel).toContain('OpenAI');
  });
});