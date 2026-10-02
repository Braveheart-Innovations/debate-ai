import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import type { ReactNode } from 'react';
import type { Line, Rect } from 'react-native-svg';
import type { PropsOf } from '@test-utils/mockComponents';
import type { Typography } from '@/components/molecules/common/Typography';
import { BarChart } from '@/components/molecules/charts/BarChart';

jest.mock('react-native-svg', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  const container = ({ children }: { children?: ReactNode }) => React.createElement(View, null, children);
  return {
    __esModule: true,
    default: container,
    Svg: container,
    Rect: (props: PropsOf<typeof Rect>) => React.createElement('Rect', props),
    Line: (props: PropsOf<typeof Line>) => React.createElement('Line', props),
    G: container,
  };
});

jest.mock('@/components/molecules/common/Typography', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Typography: ({ children }: PropsOf<typeof Typography>) => React.createElement(Text, null, children),
  };
});

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
