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

const { ConnectionStatus } = require('@/components/molecules/api-config/ConnectionStatus');

describe('ConnectionStatus', () => {
  it('renders nothing when status is idle', () => {
    const { queryByTestId } = renderWithProviders(
      <ConnectionStatus status="idle" testID="connection-status" />
    );

    expect(queryByTestId('connection-status')).toBeNull();
  });

  it('shows "Testing connection..." when status is testing', () => {
    const { getByText } = renderWithProviders(
      <ConnectionStatus status="testing" />
    );

    expect(getByText('Testing connection...')).toBeTruthy();
  });

  it('shows "Connection successful" when status is success', () => {
    const { getByText } = renderWithProviders(
      <ConnectionStatus status="success" />
    );

    expect(getByText('Connection successful')).toBeTruthy();
  });

  it('shows "Connection failed" when status is failed', () => {
    const { getByText } = renderWithProviders(
      <ConnectionStatus status="failed" />
    );

    expect(getByText('Connection failed')).toBeTruthy();
  });

  it('shows custom message when provided', () => {
    const { getByText } = renderWithProviders(
      <ConnectionStatus status="success" message="Custom success message" />
    );

    expect(getByText('Custom success message')).toBeTruthy();
  });

  it('shows model information when status is success', () => {
    const { getByText } = renderWithProviders(
      <ConnectionStatus status="success" model="gpt-4" />
    );

    expect(getByText('Model: gpt-4')).toBeTruthy();
  });

  it('shows response time when status is success', () => {
    const { getByText } = renderWithProviders(
      <ConnectionStatus status="success" responseTime={500} />
    );

    expect(getByText('Response time: 500ms')).toBeTruthy();
  });

  it('formats response time in seconds when over 1000ms', () => {
    const { getByText } = renderWithProviders(
      <ConnectionStatus status="success" responseTime={2500} />
    );

    expect(getByText('Response time: 2.5s')).toBeTruthy();
  });

  it('does not show model when status is not success', () => {
    const { queryByText } = renderWithProviders(
      <ConnectionStatus status="testing" model="gpt-4" />
    );

    expect(queryByText('Model: gpt-4')).toBeNull();
  });

  it('does not show response time when status is not success', () => {
    const { queryByText } = renderWithProviders(
      <ConnectionStatus status="failed" responseTime={500} />
    );

    expect(queryByText(/Response time/)).toBeNull();
  });

  it('applies testID when provided', () => {
    const { getByTestId } = renderWithProviders(
      <ConnectionStatus status="testing" testID="connection-status" />
    );

    expect(getByTestId('connection-status')).toBeTruthy();
  });

  it('shows success icon when status is success', () => {
    const { getByText } = renderWithProviders(
      <ConnectionStatus status="success" />
    );

    expect(getByText('✓')).toBeTruthy();
  });

  it('shows failure icon when status is failed', () => {
    const { getByText } = renderWithProviders(
      <ConnectionStatus status="failed" />
    );

    expect(getByText('✕')).toBeTruthy();
  });
});