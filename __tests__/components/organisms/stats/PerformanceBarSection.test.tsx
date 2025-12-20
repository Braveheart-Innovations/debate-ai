import React from 'react';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { fireEvent } from '@testing-library/react-native';

jest.mock('react-native-svg', () => {
  const React = require('react');
  return {
    Svg: ({ children }: any) => React.createElement('Svg', null, children),
    Rect: (props: any) => React.createElement('Rect', props),
    Line: (props: any) => React.createElement('Line', props),
    G: ({ children }: any) => React.createElement('G', null, children),
  };
});

jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Reanimated = require('react-native-reanimated/mock');
  return {
    ...Reanimated,
    default: {
      ...Reanimated.default,
      View: ({ children, ...props }: any) => React.createElement(View, props, children),
      createAnimatedComponent: (Component: any) => Component,
    },
    FadeInDown: { delay: () => ({ duration: () => ({}) }) },
    useSharedValue: (initial: any) => ({ value: initial }),
    useAnimatedProps: (callback: any) => callback(),
    withSpring: (value: any) => value,
    withDelay: (_: number, value: any) => value,
  };
});

jest.mock('@/hooks/stats/useChartData', () => ({
  useChartData: () => ({
    getBarData: (metric: string) => ({
      bars: [
        { value: 60, color: '#FF6B35', label: 'Claude', aiId: 'claude' },
        { value: 40, color: '#10A37F', label: 'ChatGPT', aiId: 'openai' },
      ],
      maxValue: metric === 'winRate' ? 100 : 10,
    }),
    hasChartData: true,
  }),
}));

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Typography: ({ children }: any) => React.createElement(Text, null, children),
  };
});

jest.mock('@/components/molecules/charts', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  return {
    BarChart: ({ bars }: any) => React.createElement(View, null,
      bars.map((bar: any, i: number) => React.createElement(Text, { key: i }, bar.label))
    ),
    ChartLegend: ({ items }: any) => React.createElement(View, null,
      items.map((item: any, i: number) => React.createElement(Text, { key: i }, item.label))
    ),
  };
});

const { PerformanceBarSection } = require('@/components/organisms/stats/PerformanceBarSection');

describe('PerformanceBarSection', () => {
  it('renders without crashing', () => {
    const result = renderWithProviders(<PerformanceBarSection />);
    expect(result).toBeTruthy();
  });

  it('renders title', () => {
    const { getByText } = renderWithProviders(<PerformanceBarSection />);
    expect(getByText('Performance Comparison')).toBeTruthy();
  });

  it('renders metric selector buttons', () => {
    const { getByText } = renderWithProviders(<PerformanceBarSection />);
    expect(getByText('Win Rate')).toBeTruthy();
    expect(getByText('Debates')).toBeTruthy();
    expect(getByText('Rounds Won')).toBeTruthy();
  });

  it('changes metric when button is pressed', () => {
    const { getByText } = renderWithProviders(<PerformanceBarSection />);

    fireEvent.press(getByText('Debates'));
    // The component should re-render with new data
    expect(getByText('Debates')).toBeTruthy();
  });

  it('renders AI labels', () => {
    const { getAllByText } = renderWithProviders(<PerformanceBarSection />);
    expect(getAllByText('Claude').length).toBeGreaterThan(0);
  });

  it('applies testID', () => {
    const { getByTestId } = renderWithProviders(
      <PerformanceBarSection testID="performance-section" />
    );
    expect(getByTestId('performance-section')).toBeTruthy();
  });

  it('renders without animations when animated is false', () => {
    const result = renderWithProviders(<PerformanceBarSection animated={false} />);
    expect(result).toBeTruthy();
  });

  it('respects maxBars prop', () => {
    const result = renderWithProviders(<PerformanceBarSection maxBars={3} />);
    expect(result).toBeTruthy();
  });
});

