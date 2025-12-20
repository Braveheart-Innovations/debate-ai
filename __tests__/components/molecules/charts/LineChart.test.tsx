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
    Path: (props: any) => React.createElement(View, props),
    Circle: (props: any) => React.createElement(View, props),
    Line: (props: any) => React.createElement(View, props),
    G: ({ children }: any) => React.createElement(View, null, children),
    Defs: ({ children }: any) => React.createElement(View, null, children),
    LinearGradient: ({ children }: any) => React.createElement(View, null, children),
    Stop: (props: any) => React.createElement(View, props),
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
    Easing: { out: () => () => {}, cubic: () => {} },
  };
});

jest.mock('@/components/molecules/common/Typography', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Typography: ({ children }: any) => React.createElement(Text, null, children),
  };
});

const { LineChart } = require('@/components/molecules/charts/LineChart');

describe('LineChart', () => {
  const defaultLines = [
    {
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
    {
      points: [
        { x: 0, y: 50 },
        { x: 1, y: 45 },
        { x: 2, y: 60 },
        { x: 3, y: 55 },
        { x: 4, y: 50 },
        { x: 5, y: 55 },
      ],
      color: '#10A37F',
      label: 'ChatGPT',
    },
  ];

  it('renders without crashing', () => {
    const result = renderWithProviders(
      <LineChart lines={defaultLines} />
    );
    expect(result).toBeTruthy();
  });

  it('renders empty state when no lines', () => {
    const { getByText } = renderWithProviders(
      <LineChart lines={[]} />
    );
    expect(getByText('No data available')).toBeTruthy();
  });

  it('renders with grid when showGrid is true', () => {
    const result = renderWithProviders(
      <LineChart lines={defaultLines} showGrid={true} />
    );
    expect(result).toBeTruthy();
  });

  it('renders without grid when showGrid is false', () => {
    const result = renderWithProviders(
      <LineChart lines={defaultLines} showGrid={false} />
    );
    expect(result).toBeTruthy();
  });

  it('renders dots when showDots is true', () => {
    const result = renderWithProviders(
      <LineChart lines={defaultLines} showDots={true} />
    );
    expect(result).toBeTruthy();
  });

  it('renders area fill when showArea is true', () => {
    const result = renderWithProviders(
      <LineChart lines={defaultLines} showArea={true} />
    );
    expect(result).toBeTruthy();
  });

  it('renders x-axis labels', () => {
    const { getByText } = renderWithProviders(
      <LineChart lines={defaultLines} xLabels={['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']} />
    );
    expect(getByText('Mon')).toBeTruthy();
  });

  it('renders y-axis labels', () => {
    const { getByText } = renderWithProviders(
      <LineChart lines={defaultLines} yLabels={['100%', '50%', '0%']} />
    );
    expect(getByText('100%')).toBeTruthy();
  });

  it('applies testID', () => {
    const { getByTestId } = renderWithProviders(
      <LineChart lines={defaultLines} testID="line-chart" />
    );
    expect(getByTestId('line-chart')).toBeTruthy();
  });

  it('renders without animations when animated is false', () => {
    const result = renderWithProviders(
      <LineChart lines={defaultLines} animated={false} />
    );
    expect(result).toBeTruthy();
  });
});
