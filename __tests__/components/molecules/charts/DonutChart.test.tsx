import React from 'react';
import { Text } from 'react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';

jest.mock('react-native-svg', () => {
  const React = require('react');
  const { View } = require('react-native');
  const SvgMock = ({ children }: any) => React.createElement(View, null, children);
  return {
    __esModule: true,
    default: SvgMock,
    Svg: SvgMock,
    Path: (props: any) => React.createElement(View, props),
    Circle: (props: any) => React.createElement(View, props),
    G: ({ children }: any) => React.createElement(View, null, children),
  };
});

jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const Reanimated = require('react-native-reanimated/mock');
  Reanimated.default.createAnimatedComponent = (Component: any) => Component;
  return {
    ...Reanimated,
    useSharedValue: (initial: any) => ({ value: initial }),
    useAnimatedProps: (callback: any) => callback(),
    withTiming: (value: any) => value,
  };
});

const { DonutChart } = require('@/components/molecules/charts/DonutChart');

describe('DonutChart', () => {
  const defaultSegments = [
    { value: 6, color: '#4CAF50', label: 'Wins' },
    { value: 4, color: '#F44336', label: 'Losses' },
  ];

  it('renders without crashing', () => {
    const result = renderWithProviders(
      <DonutChart segments={defaultSegments} />
    );
    expect(result).toBeTruthy();
  });

  it('renders with empty segments', () => {
    const result = renderWithProviders(
      <DonutChart segments={[]} />
    );
    expect(result).toBeTruthy();
  });

  it('renders with single segment', () => {
    const result = renderWithProviders(
      <DonutChart segments={[{ value: 10, color: '#4CAF50', label: 'All' }]} />
    );
    expect(result).toBeTruthy();
  });

  it('renders center content when provided', () => {
    const { getByText } = renderWithProviders(
      <DonutChart
        segments={defaultSegments}
        centerContent={<Text>60%</Text>}
      />
    );
    expect(getByText('60%')).toBeTruthy();
  });

  it('renders with custom size', () => {
    const result = renderWithProviders(
      <DonutChart segments={defaultSegments} size={200} />
    );
    expect(result).toBeTruthy();
  });

  it('renders with custom stroke width', () => {
    const result = renderWithProviders(
      <DonutChart segments={defaultSegments} strokeWidth={30} />
    );
    expect(result).toBeTruthy();
  });

  it('applies testID', () => {
    const { getByTestId } = renderWithProviders(
      <DonutChart segments={defaultSegments} testID="donut-chart" />
    );
    expect(getByTestId('donut-chart')).toBeTruthy();
  });

  it('renders without animations when animated is false', () => {
    const result = renderWithProviders(
      <DonutChart segments={defaultSegments} animated={false} />
    );
    expect(result).toBeTruthy();
  });
});
