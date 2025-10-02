import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { ParameterSlider } from '@/components/organisms/api-config/ParameterSlider';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text, TouchableOpacity } = require('react-native');
  return {
    Typography: ({ children, ...props }: { children: React.ReactNode }) => React.createElement(Text, props, children),
    ParameterLabel: ({ name, value, description }: { name: string; value: number; description?: string }) => (
      React.createElement(Text, { testID: 'parameter-label' }, `${name}:${value}:${description ?? ''}`)
    ),
    IconButton: ({ type, onPress, disabled }: { type: 'increment' | 'decrement'; onPress: () => void; disabled?: boolean }) => (
      React.createElement(
        TouchableOpacity,
        { onPress, disabled, testID: `icon-${type}` },
        React.createElement(Text, null, type)
      )
    ),
  };
});

describe('ParameterSlider', () => {
  const sliderProps = {
    name: 'Temperature',
    value: 0.5,
    min: 0,
    max: 1,
    step: 0.1,
    description: 'Controls randomness',
  };

  it('increments and decrements within the allowed range', () => {
    const onChange = jest.fn();
    const { getByTestId, getByDisplayValue } = renderWithProviders(
      <ParameterSlider {...sliderProps} onChange={onChange} />
    );

    const incrementButton = getByTestId('icon-increment');
    fireEvent.press(incrementButton);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toBeCloseTo(0.6, 2);

    onChange.mockClear();
    const decrementButton = getByTestId('icon-decrement');
    fireEvent.press(decrementButton);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toBeCloseTo(0.4, 2);

    const input = getByDisplayValue('0.5');
    fireEvent.changeText(input, '0.8');
    expect(onChange).toHaveBeenLastCalledWith(0.8);
  });

  it('does not exceed bounds and ignores invalid text input', () => {
    const onChange = jest.fn();
    const { getByTestId, getByDisplayValue } = renderWithProviders(
      <ParameterSlider {...sliderProps} value={1} onChange={onChange} />
    );

    const incrementButton = getByTestId('icon-increment');
    fireEvent.press(incrementButton);
    expect(onChange).not.toHaveBeenCalled();

    const input = getByDisplayValue('1');
    fireEvent.changeText(input, '1.5');
    expect(onChange).not.toHaveBeenCalled();

    const decrementButton = getByTestId('icon-decrement');
    fireEvent.press(decrementButton);
    expect(onChange).toHaveBeenCalledWith(0.9);
  });
});
