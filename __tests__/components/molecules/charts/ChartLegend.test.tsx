import React from 'react';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { fireEvent } from '@testing-library/react-native';

jest.mock('@/components/molecules/common/Typography', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Typography: ({ children }: any) => React.createElement(Text, null, children),
  };
});

const { ChartLegend } = require('@/components/molecules/charts/ChartLegend');

describe('ChartLegend', () => {
  const defaultItems = [
    { color: '#4CAF50', label: 'Wins', value: 6 },
    { color: '#F44336', label: 'Losses', value: 4 },
  ];

  it('renders without crashing', () => {
    const result = renderWithProviders(
      <ChartLegend items={defaultItems} />
    );
    expect(result).toBeTruthy();
  });

  it('returns null when items is empty', () => {
    const { toJSON } = renderWithProviders(
      <ChartLegend items={[]} />
    );
    expect(toJSON()).toBeNull();
  });

  it('renders labels', () => {
    const { getByText } = renderWithProviders(
      <ChartLegend items={defaultItems} />
    );
    expect(getByText('Wins')).toBeTruthy();
    expect(getByText('Losses')).toBeTruthy();
  });

  it('renders values when showValues is true', () => {
    const { getByText } = renderWithProviders(
      <ChartLegend items={defaultItems} showValues={true} />
    );
    expect(getByText('6')).toBeTruthy();
    expect(getByText('4')).toBeTruthy();
  });

  it('hides values when showValues is false', () => {
    const { queryByText } = renderWithProviders(
      <ChartLegend items={defaultItems} showValues={false} />
    );
    expect(queryByText('6')).toBeNull();
    expect(queryByText('4')).toBeNull();
  });

  it('renders horizontal orientation by default', () => {
    const result = renderWithProviders(
      <ChartLegend items={defaultItems} orientation="horizontal" />
    );
    expect(result).toBeTruthy();
  });

  it('renders vertical orientation', () => {
    const result = renderWithProviders(
      <ChartLegend items={defaultItems} orientation="vertical" />
    );
    expect(result).toBeTruthy();
  });

  it('calls onItemPress when item is pressed', () => {
    const mockOnPress = jest.fn();
    const { getByText } = renderWithProviders(
      <ChartLegend items={defaultItems} onItemPress={mockOnPress} />
    );

    fireEvent.press(getByText('Wins'));
    expect(mockOnPress).toHaveBeenCalledWith(0);
  });

  it('applies testID', () => {
    const { getByTestId } = renderWithProviders(
      <ChartLegend items={defaultItems} testID="chart-legend" />
    );
    expect(getByTestId('chart-legend')).toBeTruthy();
  });

  it('renders string values correctly', () => {
    const itemsWithStringValue = [
      { color: '#4CAF50', label: 'Wins', value: '60%' },
    ];
    const { getByText } = renderWithProviders(
      <ChartLegend items={itemsWithStringValue} showValues={true} />
    );
    expect(getByText('60%')).toBeTruthy();
  });
});
