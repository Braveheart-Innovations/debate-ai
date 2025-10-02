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

const { InputField } = require('@/components/molecules/common/InputField');

describe('InputField', () => {
  it('renders input field', () => {
    const { getByPlaceholderText } = renderWithProviders(
      <InputField placeholder="Enter text" />
    );

    expect(getByPlaceholderText('Enter text')).toBeTruthy();
  });

  it('renders label when provided', () => {
    const { getByText } = renderWithProviders(
      <InputField label="Username" placeholder="Enter username" />
    );

    expect(getByText('Username')).toBeTruthy();
  });

  it('renders error message when provided', () => {
    const { getByText } = renderWithProviders(
      <InputField
        placeholder="Enter email"
        error="Invalid email address"
      />
    );

    expect(getByText('Invalid email address')).toBeTruthy();
  });

  it('renders helper text when provided and no error', () => {
    const { getByText } = renderWithProviders(
      <InputField
        placeholder="Enter password"
        helperText="Must be at least 8 characters"
      />
    );

    expect(getByText('Must be at least 8 characters')).toBeTruthy();
  });

  it('does not render helper text when error present', () => {
    const { getByText, queryByText } = renderWithProviders(
      <InputField
        placeholder="Enter password"
        error="Password too short"
        helperText="Must be at least 8 characters"
      />
    );

    expect(getByText('Password too short')).toBeTruthy();
    expect(queryByText('Must be at least 8 characters')).toBeNull();
  });

  it('handles text change', () => {
    const onChangeText = jest.fn();
    const { getByPlaceholderText } = renderWithProviders(
      <InputField placeholder="Enter text" onChangeText={onChangeText} />
    );

    const input = getByPlaceholderText('Enter text');
    fireEvent.changeText(input, 'Hello World');

    expect(onChangeText).toHaveBeenCalledWith('Hello World');
  });

  it('passes through TextInput props', () => {
    const { getByPlaceholderText } = renderWithProviders(
      <InputField
        placeholder="Enter text"
        secureTextEntry
        autoCapitalize="none"
        keyboardType="email-address"
      />
    );

    const input = getByPlaceholderText('Enter text');
    expect(input.props.secureTextEntry).toBe(true);
    expect(input.props.autoCapitalize).toBe('none');
    expect(input.props.keyboardType).toBe('email-address');
  });

  it('applies value prop', () => {
    const { getByDisplayValue } = renderWithProviders(
      <InputField placeholder="Enter text" value="Initial value" />
    );

    expect(getByDisplayValue('Initial value')).toBeTruthy();
  });
});