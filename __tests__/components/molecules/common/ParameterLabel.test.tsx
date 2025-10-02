import React from 'react';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) =>
      React.createElement(Text, null, children),
  };
});

const { ParameterLabel } = require('@/components/molecules/common/ParameterLabel');

describe('ParameterLabel', () => {
  it('renders name and value', () => {
    const { getByText } = renderWithProviders(
      <ParameterLabel name="temperature" value={0.7} />
    );

    expect(getByText('Temperature')).toBeTruthy();
    expect(getByText('0.7')).toBeTruthy();
  });

  it('renders string value', () => {
    const { getByText } = renderWithProviders(
      <ParameterLabel name="model" value="gpt-4" />
    );

    expect(getByText('Model')).toBeTruthy();
    expect(getByText('gpt-4')).toBeTruthy();
  });

  it('formats camelCase names correctly', () => {
    const { getByText } = renderWithProviders(
      <ParameterLabel name="maxTokens" value={1000} />
    );

    expect(getByText('Max Tokens')).toBeTruthy();
  });

  it('renders description when provided', () => {
    const { getByText } = renderWithProviders(
      <ParameterLabel
        name="temperature"
        value={0.7}
        description="Controls randomness"
      />
    );

    expect(getByText('Controls randomness')).toBeTruthy();
  });

  it('does not render description when not provided', () => {
    const { queryByText } = renderWithProviders(
      <ParameterLabel name="temperature" value={0.7} />
    );

    expect(queryByText('Controls randomness')).toBeNull();
  });

  it('capitalizes first letter of name', () => {
    const { getByText } = renderWithProviders(
      <ParameterLabel name="test" value={123} />
    );

    expect(getByText('Test')).toBeTruthy();
  });
});