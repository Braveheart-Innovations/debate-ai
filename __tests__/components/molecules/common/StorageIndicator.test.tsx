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

const { StorageIndicator } = require('@/components/molecules/common/StorageIndicator');

describe('StorageIndicator', () => {
  const mockSegments = [
    { count: 10, limit: 50, color: '#4CAF50', label: 'Chats' },
    { count: 5, limit: 20, color: '#2196F3', label: 'Debates' },
  ];

  it('renders storage summary', () => {
    const { getByText } = renderWithProviders(
      <StorageIndicator segments={mockSegments} />
    );

    expect(getByText('Storage: 15/70 items')).toBeTruthy();
  });

  it('renders all segment labels', () => {
    const { getByText } = renderWithProviders(
      <StorageIndicator segments={mockSegments} />
    );

    expect(getByText('Chats')).toBeTruthy();
    expect(getByText('Debates')).toBeTruthy();
  });

  it('renders segment counts', () => {
    const { getByText } = renderWithProviders(
      <StorageIndicator segments={mockSegments} />
    );

    expect(getByText('10/50')).toBeTruthy();
    expect(getByText('5/20')).toBeTruthy();
  });

  it('renders upgrade link when onUpgrade provided', () => {
    const onUpgrade = jest.fn();
    const { getByText } = renderWithProviders(
      <StorageIndicator segments={mockSegments} onUpgrade={onUpgrade} />
    );

    expect(getByText('Upgrade for unlimited')).toBeTruthy();
  });

  it('does not render upgrade link when onUpgrade not provided', () => {
    const { queryByText } = renderWithProviders(
      <StorageIndicator segments={mockSegments} />
    );

    expect(queryByText('Upgrade for unlimited')).toBeNull();
  });

  it('shows warning when storage nearly full', () => {
    const nearFullSegments = [
      { count: 45, limit: 50, color: '#4CAF50', label: 'Chats' },
    ];

    const { getByText } = renderWithProviders(
      <StorageIndicator segments={nearFullSegments} />
    );

    expect(
      getByText('⚠️ Storage nearly full - oldest items will be auto-deleted')
    ).toBeTruthy();
  });

  it('does not show warning when storage not nearly full', () => {
    const { queryByText } = renderWithProviders(
      <StorageIndicator segments={mockSegments} />
    );

    expect(
      queryByText('⚠️ Storage nearly full - oldest items will be auto-deleted')
    ).toBeNull();
  });

  it('handles empty segments', () => {
    const emptySegments = [
      { count: 0, limit: 50, color: '#4CAF50', label: 'Chats' },
    ];

    const { getByText } = renderWithProviders(
      <StorageIndicator segments={emptySegments} />
    );

    expect(getByText('Storage: 0/50 items')).toBeTruthy();
    expect(getByText('0/50')).toBeTruthy();
  });

  it('handles full segments', () => {
    const fullSegments = [
      { count: 50, limit: 50, color: '#4CAF50', label: 'Chats' },
    ];

    const { getByText } = renderWithProviders(
      <StorageIndicator segments={fullSegments} />
    );

    expect(getByText('Storage: 50/50 items')).toBeTruthy();
  });
});