import React from 'react';
import { View } from 'react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { AppLogo } from '@/components/organisms/common/AppLogo';

const mockGradientCalls: any[] = [];
const mockIconCalls: any[] = [];

jest.mock('expo-linear-gradient', () => ({
  __esModule: true,
  LinearGradient: (props: any) => {
    const React = require('react');
    const { View } = require('react-native');
    mockGradientCalls.push(props);
    return React.createElement(View, props, props.children);
  },
}));

jest.mock('@expo/vector-icons', () => ({
  __esModule: true,
  MaterialCommunityIcons: (props: any) => {
    mockIconCalls.push(props);
    return null;
  },
}));

jest.mock('@/components/molecules', () => ({}));

describe('AppLogo', () => {
  beforeEach(() => {
    mockGradientCalls.length = 0;
    mockIconCalls.length = 0;
  });

  const extractStyle = (style: unknown) =>
    Array.isArray(style) ? Object.assign({}, ...style) : (style || {});

  it('renders orbit nodes for each provider color', () => {
    const { UNSAFE_queryAllByType } = renderWithProviders(<AppLogo size={120} />);

    const views = UNSAFE_queryAllByType(View);
    const orbitNodes = views.filter((node) => {
      const style = extractStyle(node.props.style);
      return (
        style.position === 'absolute' &&
        typeof style.backgroundColor === 'string' &&
        style.backgroundColor !== '#f8f9fa' &&
        style.borderRadius &&
        typeof style.left === 'number' &&
        typeof style.top === 'number'
      );
    });

    expect(orbitNodes).toHaveLength(9);
  });

  it('passes gradient colors and icon sizing based on the provided size', () => {
    renderWithProviders(<AppLogo size={200} />);

    expect(mockGradientCalls.length).toBeGreaterThan(0);
    const gradientProps = mockGradientCalls[0];
    expect(Array.isArray(gradientProps.colors)).toBe(true);
    expect(gradientProps.colors.length).toBeGreaterThan(0);

    expect(mockIconCalls.length).toBeGreaterThan(0);
    const iconProps = mockIconCalls[0];
    expect(iconProps).toMatchObject({ name: 'brain', color: 'white', size: 200 * 0.16 });
  });
});
