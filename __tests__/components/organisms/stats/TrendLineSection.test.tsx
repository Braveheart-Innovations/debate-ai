import React from 'react';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { fireEvent } from '@testing-library/react-native';

jest.mock('react-native-svg', () => {
  const React = require('react');
  return {
    Svg: ({ children }: any) => React.createElement('Svg', null, children),
    Path: (props: any) => React.createElement('Path', props),
    Circle: (props: any) => React.createElement('Circle', props),
    Line: (props: any) => React.createElement('Line', props),
    G: ({ children }: any) => React.createElement('G', null, children),
    Defs: ({ children }: any) => React.createElement('Defs', null, children),
    LinearGradient: ({ children }: any) => React.createElement('LinearGradient', null, children),
    Stop: (props: any) => React.createElement('Stop', props),
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
    Easing: { out: () => () => {}, cubic: () => {} },
  };
});

jest.mock('@/hooks/stats/useChartData', () => ({
  useChartData: () => ({
    getTrendData: () => [
      {
        aiId: 'claude',
        points: [
          { x: 0, y: 40 },
          { x: 1, y: 60 },
          { x: 2, y: 55 },
          { x: 3, y: 70 },
          { x: 4, y: 65 },
          { x: 5, y: 80 },
        ],
        color: '#FF6B35',
        label: 'Claude',
      },
    ],
    hasChartData: true,
    getActiveAIs: [{ id: 'claude', name: 'Claude', color: '#FF6B35' }],
  }),
}));

jest.mock('@/hooks/stats', () => ({
  useDebateStats: () => ({
    history: [
      { debateId: '1', timestamp: Date.now() },
      { debateId: '2', timestamp: Date.now() - 86400000 },
    ],
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
    LineChart: ({ lines }: any) => React.createElement(View, null,
      lines.map((line: any, i: number) => React.createElement(Text, { key: i }, line.label))
    ),
    ChartLegend: ({ items }: any) => React.createElement(View, null,
      items.map((item: any, i: number) => React.createElement(Text, { key: i }, item.label))
    ),
  };
});

const { TrendLineSection } = require('@/components/organisms/stats/TrendLineSection');

describe('TrendLineSection', () => {
  it('renders without crashing', () => {
    const result = renderWithProviders(<TrendLineSection />);
    expect(result).toBeTruthy();
  });

  it('renders title', () => {
    const { getByText } = renderWithProviders(<TrendLineSection />);
    expect(getByText('Performance Trends')).toBeTruthy();
  });

  it('renders period selector buttons', () => {
    const { getByText } = renderWithProviders(<TrendLineSection />);
    expect(getByText('Daily')).toBeTruthy();
    expect(getByText('Weekly')).toBeTruthy();
    expect(getByText('Monthly')).toBeTruthy();
  });

  it('changes period when button is pressed', () => {
    const { getByText } = renderWithProviders(<TrendLineSection />);

    fireEvent.press(getByText('Monthly'));
    expect(getByText('Monthly')).toBeTruthy();
  });

  it('renders AI labels in legend', () => {
    const { getAllByText } = renderWithProviders(<TrendLineSection />);
    expect(getAllByText('Claude').length).toBeGreaterThan(0);
  });

  it('applies testID', () => {
    const { getByTestId } = renderWithProviders(
      <TrendLineSection testID="trend-section" />
    );
    expect(getByTestId('trend-section')).toBeTruthy();
  });

  it('renders without animations when animated is false', () => {
    const result = renderWithProviders(<TrendLineSection animated={false} />);
    expect(result).toBeTruthy();
  });

  it('renders info note', () => {
    const { getByText } = renderWithProviders(<TrendLineSection />);
    expect(getByText(/Trends show win rate/i)).toBeTruthy();
  });
});

