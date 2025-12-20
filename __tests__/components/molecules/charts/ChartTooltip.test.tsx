import React from 'react';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';

jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Reanimated = require('react-native-reanimated/mock');
  return {
    ...Reanimated,
    default: {
      ...Reanimated.default,
      View: ({ children, ...props }: any) => React.createElement(View, props, children),
    },
    FadeIn: { duration: () => ({ duration: () => {} }) },
    FadeOut: { duration: () => ({}) },
  };
});

jest.mock('@/components/molecules/common/Typography', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Typography: ({ children }: any) => React.createElement(Text, null, children),
  };
});

const { ChartTooltip, TooltipContent } = require('@/components/molecules/charts/ChartTooltip');

describe('ChartTooltip', () => {
  it('renders nothing when not visible', () => {
    const { toJSON } = renderWithProviders(
      <ChartTooltip visible={false} x={100} y={100} content="Test" />
    );
    expect(toJSON()).toBeNull();
  });

  it('renders content when visible', () => {
    const { getByText } = renderWithProviders(
      <ChartTooltip visible={true} x={100} y={100} content="60%" />
    );
    expect(getByText('60%')).toBeTruthy();
  });

  it('renders with custom content component', () => {
    const { getByText } = renderWithProviders(
      <ChartTooltip
        visible={true}
        x={100}
        y={100}
        content={<TooltipContent value="60%" title="Win Rate" />}
      />
    );
    expect(getByText('60%')).toBeTruthy();
    expect(getByText('Win Rate')).toBeTruthy();
  });

  it('applies testID', () => {
    const { getByTestId } = renderWithProviders(
      <ChartTooltip visible={true} x={100} y={100} content="Test" testID="tooltip" />
    );
    expect(getByTestId('tooltip')).toBeTruthy();
  });

  it('renders with different pointer directions', () => {
    const directions: Array<'up' | 'down' | 'left' | 'right'> = ['up', 'down', 'left', 'right'];

    directions.forEach((direction) => {
      const result = renderWithProviders(
        <ChartTooltip
          visible={true}
          x={100}
          y={100}
          content="Test"
          pointerDirection={direction}
        />
      );
      expect(result).toBeTruthy();
    });
  });
});

describe('TooltipContent', () => {
  it('renders value', () => {
    const { getByText } = renderWithProviders(
      <TooltipContent value={60} />
    );
    expect(getByText('60')).toBeTruthy();
  });

  it('renders title when provided', () => {
    const { getByText } = renderWithProviders(
      <TooltipContent value={60} title="Win Rate" />
    );
    expect(getByText('Win Rate')).toBeTruthy();
  });

  it('renders subtitle when provided', () => {
    const { getByText } = renderWithProviders(
      <TooltipContent value={60} subtitle="Claude" />
    );
    expect(getByText('Claude')).toBeTruthy();
  });

  it('formats number values correctly', () => {
    const { getByText } = renderWithProviders(
      <TooltipContent value={60.5} />
    );
    expect(getByText('60.5')).toBeTruthy();
  });

  it('renders string values as-is', () => {
    const { getByText } = renderWithProviders(
      <TooltipContent value="60%" />
    );
    expect(getByText('60%')).toBeTruthy();
  });
});
