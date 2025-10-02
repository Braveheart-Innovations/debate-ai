import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { DebateHeader } from '@/components/organisms/debate/DebateHeader';

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
  };
});

describe('DebateHeader', () => {
  it('renders title', () => {
    const { getByText } = renderWithProviders(<DebateHeader />);
    expect(getByText(/AI Debate Arena/)).toBeTruthy();
  });

  it('shows exchange counter when active and currentRound provided', () => {
    const { getByText } = renderWithProviders(
      <DebateHeader isActive={true} currentRound={2} maxRounds={3} />
    );

    expect(getByText('Exchange 2 of 3')).toBeTruthy();
  });

  it('does not show exchange counter when not active', () => {
    const { queryByText } = renderWithProviders(
      <DebateHeader isActive={false} currentRound={2} maxRounds={3} />
    );

    expect(queryByText(/Exchange/)).toBeNull();
  });

  it('shows Start Over button when showStartOver is true', () => {
    const mockOnStartOver = jest.fn();
    const { getByText } = renderWithProviders(
      <DebateHeader onStartOver={mockOnStartOver} showStartOver={true} />
    );

    expect(getByText(/Start Over/)).toBeTruthy();
  });

  it('does not show Start Over button when showStartOver is false', () => {
    const { queryByText } = renderWithProviders(
      <DebateHeader showStartOver={false} />
    );

    expect(queryByText(/Start Over/)).toBeNull();
  });

  it('calls onStartOver when Start Over button is pressed', () => {
    const mockOnStartOver = jest.fn();
    const { getByText } = renderWithProviders(
      <DebateHeader onStartOver={mockOnStartOver} showStartOver={true} />
    );

    fireEvent.press(getByText(/Start Over/));
    expect(mockOnStartOver).toHaveBeenCalled();
  });

  it('displays correct exchange numbers', () => {
    const { getByText } = renderWithProviders(
      <DebateHeader isActive={true} currentRound={1} maxRounds={5} />
    );

    expect(getByText('Exchange 1 of 5')).toBeTruthy();
  });

  it('renders without crashing when no props provided', () => {
    const { toJSON } = renderWithProviders(<DebateHeader />);
    expect(toJSON()).toBeTruthy();
  });
});