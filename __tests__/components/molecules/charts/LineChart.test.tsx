import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import type { ReactNode } from 'react';
import type { Circle, Line, Path, Stop } from 'react-native-svg';
import type { PropsOf } from '@test-utils/mockComponents';
import type { Typography } from '@/components/molecules/common/Typography';
import { LineChart } from '@/components/molecules/charts/LineChart';

jest.mock('react-native-svg', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  const container = ({ children }: { children?: ReactNode }) => React.createElement(View, null, children);
  return {
    __esModule: true,
    default: container,
    Svg: container,
    Path: (props: PropsOf<typeof Path>) => React.createElement('Path', props),
    Circle: (props: PropsOf<typeof Circle>) => React.createElement('Circle', props),
    Line: (props: PropsOf<typeof Line>) => React.createElement('Line', props),
    G: container,
    Defs: container,
    LinearGradient: container,
    Stop: (props: PropsOf<typeof Stop>) => React.createElement('Stop', props),
  };
});

jest.mock('@/components/molecules/common/Typography', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Typography: ({ children }: PropsOf<typeof Typography>) => React.createElement(Text, null, children),
  };
});

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
