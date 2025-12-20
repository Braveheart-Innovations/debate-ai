import React from 'react';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';

jest.mock('react-native-svg', () => {
  const React = require('react');
  const { View } = require('react-native');
  const SvgMock = ({ children }: any) => React.createElement(View, null, children);
  return {
    __esModule: true,
    default: SvgMock,
    Svg: SvgMock,
    Rect: (props: any) => React.createElement(View, props),
    Line: (props: any) => React.createElement(View, props),
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
    withSpring: (value: any) => value,
    withDelay: (_: number, value: any) => value,
  };
});

jest.mock('@/components/molecules/common/Typography', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Typography: ({ children }: any) => React.createElement(Text, null, children),
  };
});

const { BarChart } = require('@/components/molecules/charts/BarChart');

describe('BarChart', () => {
  const defaultBars = [
    { value: 60, color: '#FF6B35', label: 'Claude', aiId: 'claude' },
    { value: 40, color: '#10A37F', label: 'ChatGPT', aiId: 'openai' },
    { value: 55, color: '#4285F4', label: 'Gemini', aiId: 'google' },
  ];

  it('renders without crashing', () => {
    const result = renderWithProviders(
      <BarChart bars={defaultBars} />
    );
    expect(result).toBeTruthy();
  });

  it('renders empty state when no bars', () => {
    const { getByText } = renderWithProviders(
      <BarChart bars={[]} />
    );
    expect(getByText('No data available')).toBeTruthy();
  });

  it('renders with horizontal orientation', () => {
    const result = renderWithProviders(
      <BarChart bars={defaultBars} orientation="horizontal" />
    );
    expect(result).toBeTruthy();
  });

  it('renders with vertical orientation', () => {
    const result = renderWithProviders(
      <BarChart bars={defaultBars} orientation="vertical" />
    );
    expect(result).toBeTruthy();
  });

  it('renders labels when showLabels is true', () => {
    const { getByText } = renderWithProviders(
      <BarChart bars={defaultBars} showLabels={true} />
    );
    expect(getByText('Claude')).toBeTruthy();
  });

  it('renders values when showValues is true', () => {
    const { getByText } = renderWithProviders(
      <BarChart bars={defaultBars} showValues={true} maxValue={100} />
    );
    expect(getByText('60%')).toBeTruthy();
  });

  it('applies testID', () => {
    const { getByTestId } = renderWithProviders(
      <BarChart bars={defaultBars} testID="bar-chart" />
    );
    expect(getByTestId('bar-chart')).toBeTruthy();
  });

  it('renders without animations when animated is false', () => {
    const result = renderWithProviders(
      <BarChart bars={defaultBars} animated={false} />
    );
    expect(result).toBeTruthy();
  });

  it('handles custom bar radius', () => {
    const result = renderWithProviders(
      <BarChart bars={defaultBars} barRadius={8} />
    );
    expect(result).toBeTruthy();
  });

  it('handles custom spacing', () => {
    const result = renderWithProviders(
      <BarChart bars={defaultBars} spacing={16} />
    );
    expect(result).toBeTruthy();
  });
});
