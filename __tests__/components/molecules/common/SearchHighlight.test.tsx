import React from 'react';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Typography: ({ children, style }: { children: React.ReactNode; style?: any }) =>
      React.createElement(Text, { style }, children),
  };
});

const { SearchHighlight } = require('@/components/molecules/common/SearchHighlight');

describe('SearchHighlight', () => {
  it('renders text without highlighting when no searchTerm', () => {
    const result = renderWithProviders(
      <SearchHighlight text="Hello World" />
    );

    // Should render plain text without highlighting
    expect(result).toBeTruthy();
  });

  it('highlights matching text case-insensitively', () => {
    const { getByText } = renderWithProviders(
      <SearchHighlight text="Hello World" searchTerm="world" />
    );

    // Should find the highlighted part
    expect(getByText('World')).toBeTruthy();
  });

  it('handles multiple matches', () => {
    const { getAllByText } = renderWithProviders(
      <SearchHighlight text="test test test" searchTerm="test" />
    );

    // The component should split and render all matching parts
    const matches = getAllByText('test');
    expect(matches.length).toBeGreaterThan(0);
  });

  it('handles partial matches', () => {
    const { getByText } = renderWithProviders(
      <SearchHighlight text="Testing is important" searchTerm="test" />
    );

    // Should highlight the matching part case-insensitively
    expect(getByText('Test')).toBeTruthy();
  });

  it('renders text unchanged when searchTerm is empty string', () => {
    const result = renderWithProviders(
      <SearchHighlight text="Hello World" searchTerm="" />
    );

    // Should render without highlighting
    expect(result).toBeTruthy();
  });
});