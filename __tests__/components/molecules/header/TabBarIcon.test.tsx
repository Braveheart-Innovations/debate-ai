import React from 'react';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
  MaterialIcons: () => null,
  MaterialCommunityIcons: () => null,
}));

const { TabBarIcon } = require('@/components/molecules/header/TabBarIcon');

describe('TabBarIcon', () => {
  it('renders with default props', () => {
    const result = renderWithProviders(
      <TabBarIcon name="home" focused={false} color="#000" />
    );
    expect(result).toBeTruthy();
  });

  it('renders badge when provided', () => {
    const { getByText } = renderWithProviders(
      <TabBarIcon name="notifications" focused={false} color="#000" badge={3} />
    );
    expect(getByText('3')).toBeTruthy();
  });

  it('shows 99+ for badges over 99', () => {
    const { getByText } = renderWithProviders(
      <TabBarIcon name="notifications" focused={false} color="#000" badge={100} />
    );
    expect(getByText('99+')).toBeTruthy();
  });
});
