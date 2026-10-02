import type { ReactNode } from 'react';
import type { Circle, Line, Path, Stop } from 'react-native-svg';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { fireEvent } from '@testing-library/react-native';
import type { PropsOf } from '@test-utils/mockComponents';
import type { Typography } from '@/components/molecules';
import type { ChartLegend, LineChart } from '@/components/molecules/charts';
import { TrendLineSection } from '@/components/organisms/stats/TrendLineSection';

jest.mock('react-native-svg', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const container = (name: string) => ({ children }: { children?: ReactNode }) =>
    React.createElement(name, null, children);
  return {
    Svg: container('Svg'),
    Path: (props: PropsOf<typeof Path>) => React.createElement('Path', props),
    Circle: (props: PropsOf<typeof Circle>) => React.createElement('Circle', props),
    Line: (props: PropsOf<typeof Line>) => React.createElement('Line', props),
    G: container('G'),
    Defs: container('Defs'),
    LinearGradient: container('LinearGradient'),
    Stop: (props: PropsOf<typeof Stop>) => React.createElement('Stop', props),
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
  const { stubComponent } = jest.requireActual<
    typeof import('@test-utils/mockComponents')
  >('@test-utils/mockComponents');
  return {
    Typography: stubComponent<typeof Typography>('typography', { text: (p) => p.children }),
  };
});

jest.mock('@/components/molecules/charts', () => {
  const { stubComponent } = jest.requireActual<
    typeof import('@test-utils/mockComponents')
  >('@test-utils/mockComponents');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    LineChart: stubComponent<typeof LineChart>('line-chart', {
      render: ({ lines }) => lines.map((line, i) => React.createElement(Text, { key: i }, line.label)),
    }),
    ChartLegend: stubComponent<typeof ChartLegend>('chart-legend', {
      render: ({ items }) => items.map((item, i) => React.createElement(Text, { key: i }, item.label)),
    }),
  };
});

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

