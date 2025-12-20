import React from 'react';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';

jest.mock('react-native-svg', () => {
  const React = require('react');
  return {
    Svg: ({ children }: any) => React.createElement('Svg', null, children),
    Path: (props: any) => React.createElement('Path', props),
    Circle: (props: any) => React.createElement('Circle', props),
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
    withTiming: (value: any) => value,
  };
});

jest.mock('@/hooks/stats/useChartData', () => ({
  useChartData: () => ({
    getDonutSegments: (aiId: string) => [
      { value: 6, color: '#4CAF50', label: 'Wins' },
      { value: 4, color: '#F44336', label: 'Losses' },
    ],
    getActiveAIs: [
      { id: 'claude', name: 'Claude', color: '#FF6B35' },
      { id: 'openai', name: 'ChatGPT', color: '#10A37F' },
    ],
    hasChartData: true,
    chartColors: {
      wins: '#4CAF50',
      losses: '#F44336',
      neutral: '#9E9E9E',
    },
  }),
}));

jest.mock('@/hooks/stats', () => ({
  useAIProviderInfo: () => ({
    getAIInfo: (aiId: string) => ({
      name: aiId === 'claude' ? 'Claude' : 'ChatGPT',
      color: aiId === 'claude' ? '#FF6B35' : '#10A37F',
    }),
  }),
}));

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text, View } = require('react-native');
  return {
    Typography: ({ children }: any) => React.createElement(Text, null, children),
  };
});

jest.mock('@/components/molecules/charts', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  return {
    DonutChart: ({ centerContent }: any) => React.createElement(View, null, centerContent),
    ChartLegend: ({ items }: any) => React.createElement(View, null,
      items.map((item: any, i: number) => React.createElement(Text, { key: i }, item.label))
    ),
  };
});

const { WinRateDonutSection } = require('@/components/organisms/stats/WinRateDonutSection');

describe('WinRateDonutSection', () => {
  it('renders without crashing', () => {
    const result = renderWithProviders(<WinRateDonutSection />);
    expect(result).toBeTruthy();
  });

  it('renders AI names', () => {
    const { getByText } = renderWithProviders(<WinRateDonutSection />);
    expect(getByText('Claude')).toBeTruthy();
  });

  it('renders win rate percentage', () => {
    const { getAllByText } = renderWithProviders(<WinRateDonutSection />);
    expect(getAllByText('60%').length).toBeGreaterThan(0);
  });

  it('renders legend items', () => {
    const { getAllByText } = renderWithProviders(<WinRateDonutSection />);
    expect(getAllByText('Wins').length).toBeGreaterThan(0);
    expect(getAllByText('Losses').length).toBeGreaterThan(0);
  });

  it('applies testID', () => {
    const { getByTestId } = renderWithProviders(
      <WinRateDonutSection testID="win-rate-section" />
    );
    expect(getByTestId('win-rate-section')).toBeTruthy();
  });

  it('renders without animations when animated is false', () => {
    const result = renderWithProviders(<WinRateDonutSection animated={false} />);
    expect(result).toBeTruthy();
  });
});

