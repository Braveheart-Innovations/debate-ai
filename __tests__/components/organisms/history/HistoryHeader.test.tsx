import React from 'react';
import { Text } from 'react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { HistoryHeader } from '@/components/organisms/history/HistoryHeader';

jest.mock('@/components/atoms', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Box: ({ children, style }: { children: React.ReactNode; style: any }) =>
      React.createElement(
        View,
        { testID: 'history-header-container', style },
        children
      ),
  };
});

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
  };
});

describe('HistoryHeader', () => {
  it('renders title with themed container styles', () => {
    const { getByText, getByTestId } = renderWithProviders(
      <HistoryHeader title="History" />
    );

    expect(getByText('History')).toBeTruthy();

    const containerStyle = getByTestId('history-header-container').props.style;
    const styles = Array.isArray(containerStyle) ? containerStyle : [containerStyle];
    const merged = Object.assign({}, ...styles);

    expect(merged.borderBottomWidth).toBe(1);
    expect(typeof merged.backgroundColor).toBe('string');
    expect(typeof merged.borderBottomColor).toBe('string');
  });
});
