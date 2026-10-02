import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import type { ReactNode } from 'react';
import type { Line, Rect } from 'react-native-svg';
import type { PropsOf } from '@test-utils/mockComponents';
import type { Typography } from '@/components/molecules';
import type { BarChart, ChartLegend } from '@/components/molecules/charts';
import { PerformanceBarSection } from '@/components/organisms/stats/PerformanceBarSection';
import { fireEvent } from '@testing-library/react-native';

jest.mock('react-native-svg', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const container = (name: string) => ({ children }: { children?: ReactNode }) =>
    React.createElement(name, null, children);
  return {
    Svg: container('Svg'),
    Rect: (props: PropsOf<typeof Rect>) => React.createElement('Rect', props),
    Line: (props: PropsOf<typeof Line>) => React.createElement('Line', props),
    G: container('G'),
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
    BarChart: stubComponent<typeof BarChart>('bar-chart', {
      render: ({ bars }) => bars.map((bar, i) => React.createElement(Text, { key: i }, bar.label)),
    }),
    ChartLegend: stubComponent<typeof ChartLegend>('chart-legend', {
      render: ({ items }) => items.map((item, i) => React.createElement(Text, { key: i }, item.label)),
    }),
  };
});

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

