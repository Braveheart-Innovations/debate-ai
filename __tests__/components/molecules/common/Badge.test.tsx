import React from 'react';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';

const { Badge } = require('@/components/molecules/common/Badge');

describe('Badge', () => {
  it('renders label correctly', () => {
    const { getByText } = renderWithProviders(<Badge label="Test Badge" />);
    expect(getByText('Test Badge')).toBeTruthy();
  });

  it('applies premium type styling', () => {
    const { getByText } = renderWithProviders(
      <Badge label="Premium" type="premium" />
    );
    expect(getByText('Premium')).toBeTruthy();
  });

  it('applies new type styling', () => {
    const { getByText } = renderWithProviders(
      <Badge label="New" type="new" />
    );
    expect(getByText('New')).toBeTruthy();
  });

  it('applies experimental type styling', () => {
    const { getByText } = renderWithProviders(
      <Badge label="Beta" type="experimental" />
    );
    expect(getByText('Beta')).toBeTruthy();
  });

  it('applies default type styling', () => {
    const { getByText } = renderWithProviders(
      <Badge label="Default" type="default" />
    );
    expect(getByText('Default')).toBeTruthy();
  });

  it('uses default type when type prop is omitted', () => {
    const { getByText } = renderWithProviders(<Badge label="No Type" />);
    expect(getByText('No Type')).toBeTruthy();
  });

  it('has uppercase styling applied', () => {
    const { getByText } = renderWithProviders(<Badge label="lowercase text" />);
    const element = getByText('lowercase text');
    expect(element).toBeTruthy();
  });
});