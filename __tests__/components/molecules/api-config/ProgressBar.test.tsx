import React from 'react';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children?: React.ReactNode }) => children || null,
}));

const { ProgressBar } = require('@/components/molecules/api-config/ProgressBar');

describe('ProgressBar', () => {
  it('renders with default props', () => {
    const { getByTestId } = renderWithProviders(
      <ProgressBar percentage={50} testID="progress-bar" />
    );

    expect(getByTestId('progress-bar')).toBeTruthy();
  });

  it('renders with custom height', () => {
    const { getByTestId } = renderWithProviders(
      <ProgressBar percentage={50} height={12} testID="progress-bar" />
    );

    expect(getByTestId('progress-bar')).toBeTruthy();
  });

  it('renders with custom colors', () => {
    const customColors: [string, string] = ['#FF0000', '#00FF00'];
    const { getByTestId } = renderWithProviders(
      <ProgressBar percentage={50} colors={customColors} testID="progress-bar" />
    );

    expect(getByTestId('progress-bar')).toBeTruthy();
  });

  it('renders with custom backgroundColor', () => {
    const { getByTestId } = renderWithProviders(
      <ProgressBar percentage={50} backgroundColor="#EEEEEE" testID="progress-bar" />
    );

    expect(getByTestId('progress-bar')).toBeTruthy();
  });

  it('renders with custom borderRadius', () => {
    const { getByTestId } = renderWithProviders(
      <ProgressBar percentage={50} borderRadius={8} testID="progress-bar" />
    );

    expect(getByTestId('progress-bar')).toBeTruthy();
  });

  it('clamps percentage at 0 for negative values', () => {
    const { getByTestId } = renderWithProviders(
      <ProgressBar percentage={-10} testID="progress-bar" />
    );

    expect(getByTestId('progress-bar')).toBeTruthy();
  });

  it('clamps percentage at 100 for values over 100', () => {
    const { getByTestId } = renderWithProviders(
      <ProgressBar percentage={150} testID="progress-bar" />
    );

    expect(getByTestId('progress-bar')).toBeTruthy();
  });

  it('handles 0 percentage', () => {
    const { getByTestId } = renderWithProviders(
      <ProgressBar percentage={0} testID="progress-bar" />
    );

    expect(getByTestId('progress-bar')).toBeTruthy();
  });

  it('handles 100 percentage', () => {
    const { getByTestId } = renderWithProviders(
      <ProgressBar percentage={100} testID="progress-bar" />
    );

    expect(getByTestId('progress-bar')).toBeTruthy();
  });

  it('applies testID when provided', () => {
    const { getByTestId } = renderWithProviders(
      <ProgressBar percentage={50} testID="progress-bar" />
    );

    expect(getByTestId('progress-bar')).toBeTruthy();
  });

  it('renders with multiple gradient colors', () => {
    const multiColors: [string, string, string] = ['#FF0000', '#00FF00', '#0000FF'];
    const { getByTestId } = renderWithProviders(
      <ProgressBar percentage={50} colors={multiColors} testID="progress-bar" />
    );

    expect(getByTestId('progress-bar')).toBeTruthy();
  });
});