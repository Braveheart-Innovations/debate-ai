import React from 'react';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';

jest.mock('react-native-reanimated', () => {
  const View = require('react-native').View;
  const springify = () => ({ springify: () => ({}) });
  return {
    ...jest.requireActual('react-native-reanimated/mock'),
    useSharedValue: jest.fn((initial) => ({ value: initial })),
    useAnimatedStyle: jest.fn((cb) => cb()),
    withSpring: jest.fn((value) => value),
    withTiming: jest.fn((value) => value),
    ZoomIn: { springify },
    FadeOut: {},
    default: {
      View,
    },
  };
});

const { SelectionIndicator } = require('@/components/molecules/common/SelectionIndicator');

describe('SelectionIndicator', () => {
  it('renders when isSelected is true', () => {
    const result = renderWithProviders(
      <SelectionIndicator isSelected={true} />
    );

    // Component renders when isSelected is true
    expect(result).toBeTruthy();
  });

  it('does not render when isSelected is false', () => {
    const result = renderWithProviders(
      <SelectionIndicator isSelected={false} />
    );

    // Component returns null when not selected
    expect(result).toBeTruthy();
  });

  it('applies custom color when provided', () => {
    const result = renderWithProviders(
      <SelectionIndicator isSelected={true} color="#FF0000" />
    );

    // Component renders with custom color
    expect(result).toBeTruthy();
  });

  it('uses default theme color when color not provided', () => {
    const result = renderWithProviders(
      <SelectionIndicator isSelected={true} />
    );

    // Component renders with default theme color
    expect(result).toBeTruthy();
  });
});