import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { ParameterSlider } from '@/components/organisms/api-config/ParameterSlider';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';

jest.mock('@/components/molecules', () => {
  const React = require('react') as typeof import('react');
  const { Text, TouchableOpacity } = require('react-native') as typeof import('react-native');
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

  it('shows an empty value as its label, starts the steppers from emptyStart, and clears back', () => {
    const onChange = jest.fn<void, [number]>();
    const onClear = jest.fn<void, []>();
    const tokenProps = { name: 'maxTokens', min: 1, max: 128000, step: 1, emptyLabel: 'Model default', emptyStart: 128000 };
    const empty = renderWithProviders(
      <ParameterSlider {...tokenProps} value={undefined} onChange={onChange} onClear={onClear} />
    );

    expect(empty.getByPlaceholderText('Model default')).toBeTruthy();
    expect(empty.getByTestId('parameter-label').props.children).toBe('maxTokens:Model default:');
    // Nothing to clear while empty.
    expect(empty.queryByText('Use model default')).toBeNull();
    fireEvent.press(empty.getByTestId('icon-decrement'));
    expect(onChange).toHaveBeenLastCalledWith(128000);
    empty.unmount();

    const set = renderWithProviders(
      <ParameterSlider {...tokenProps} value={4096} onChange={onChange} onClear={onClear} />
    );
    fireEvent.press(set.getByText('Use model default'));
    expect(onClear).toHaveBeenCalledTimes(1);
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
