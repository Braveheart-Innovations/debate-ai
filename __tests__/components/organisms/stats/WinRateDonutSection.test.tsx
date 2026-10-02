import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import type { ReactNode } from 'react';
import type { Circle, Path } from 'react-native-svg';
import type { PropsOf } from '@test-utils/mockComponents';
import type { Typography } from '@/components/molecules';
import type { ChartLegend, DonutChart } from '@/components/molecules/charts';
import { WinRateDonutSection } from '@/components/organisms/stats/WinRateDonutSection';

jest.mock('react-native-svg', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const container = (name: string) => ({ children }: { children?: ReactNode }) =>
    React.createElement(name, null, children);
  return {
    Svg: container('Svg'),
    Path: (props: PropsOf<typeof Path>) => React.createElement('Path', props),
    Circle: (props: PropsOf<typeof Circle>) => React.createElement('Circle', props),
    G: container('G'),
  };
});

jest.mock('@/hooks/stats/useChartData', () => ({
  useChartData: () => ({
    getDonutSegments: (_aiId: string) => [
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
    DonutChart: stubComponent<typeof DonutChart>('donut-chart', {
      render: ({ centerContent }) => centerContent,
    }),
    ChartLegend: stubComponent<typeof ChartLegend>('chart-legend', {
      render: ({ items }) => items.map((item, i) => React.createElement(Text, { key: i }, item.label)),
    }),
  };
});

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

