import React from 'react';
import { render } from '@testing-library/react-native';
import IconStopOctagon from '@/components/atoms/icons/IconStopOctagon';

// Mock react-native-svg
jest.mock('react-native-svg', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    __esModule: true,
    default: (props: any) => <View {...props} testID="svg" />,
    Svg: (props: any) => <View {...props} testID="svg" />,
    Path: (props: any) => <View {...props} testID="path" />,
  };
});

describe('IconStopOctagon', () => {
  it('renders successfully', () => {
    const { getByTestId } = render(<IconStopOctagon />);
    expect(getByTestId('svg')).toBeTruthy();
  });

  it('applies default size prop', () => {
    const { getByTestId } = render(<IconStopOctagon />);
    const svg = getByTestId('svg');

    expect(svg.props.width).toBe(18);
    expect(svg.props.height).toBe(18);
  });

  it('applies custom size prop', () => {
    const { getByTestId } = render(<IconStopOctagon size={32} />);
    const svg = getByTestId('svg');

    expect(svg.props.width).toBe(32);
    expect(svg.props.height).toBe(32);
  });

  it('applies default colors', () => {
    const { getByTestId } = render(<IconStopOctagon />);
    const path = getByTestId('path');

    expect(path.props.fill).toBe('#F44336'); // red
    expect(path.props.stroke).toBe('#FFFFFF'); // white
  });

  it('applies custom color prop', () => {
    const { getByTestId } = render(<IconStopOctagon color="#FF0000" />);
    const path = getByTestId('path');

    expect(path.props.fill).toBe('#FF0000');
  });

  it('applies custom border color', () => {
    const { getByTestId } = render(<IconStopOctagon border="#000000" />);
    const path = getByTestId('path');

    expect(path.props.stroke).toBe('#000000');
  });

  it('applies default border width', () => {
    const { getByTestId } = render(<IconStopOctagon />);
    const path = getByTestId('path');

    expect(path.props.strokeWidth).toBe(1.5);
  });

  it('applies custom border width', () => {
    const { getByTestId } = render(<IconStopOctagon borderWidth={3} />);
    const path = getByTestId('path');

    expect(path.props.strokeWidth).toBe(3);
  });

  it('renders correct viewBox', () => {
    const { getByTestId } = render(<IconStopOctagon />);
    const svg = getByTestId('svg');

    expect(svg.props.viewBox).toBe('0 0 24 24');
  });

  it('applies correct path data for octagon', () => {
    const { getByTestId } = render(<IconStopOctagon />);
    const path = getByTestId('path');

    expect(path.props.d).toBe('M7.05 2.5h9.9l4.55 4.55v9.9L16.95 21.5h-9.9L2.5 16.95v-9.9L7.05 2.5Z');
  });

  it('applies strokeLinejoin to path', () => {
    const { getByTestId } = render(<IconStopOctagon />);
    const path = getByTestId('path');

    expect(path.props.strokeLinejoin).toBe('round');
  });

  it('handles all props together', () => {
    const { getByTestId } = render(
      <IconStopOctagon
        size={24}
        color="#AA0000"
        border="#CCCCCC"
        borderWidth={2}
      />
    );

    const svg = getByTestId('svg');
    const path = getByTestId('path');

    expect(svg.props.width).toBe(24);
    expect(svg.props.height).toBe(24);
    expect(path.props.fill).toBe('#AA0000');
    expect(path.props.stroke).toBe('#CCCCCC');
    expect(path.props.strokeWidth).toBe(2);
  });
});