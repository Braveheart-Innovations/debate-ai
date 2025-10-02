import React from 'react';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';

const { SheetHandle } = require('@/components/molecules/sheets/SheetHandle');

describe('SheetHandle', () => {
  it('renders with default props', () => {
    const result = renderWithProviders(<SheetHandle />);
    expect(result).toBeTruthy();
  });

  it('renders with custom width', () => {
    const result = renderWithProviders(<SheetHandle width={50} />);
    expect(result).toBeTruthy();
  });

  it('renders with custom height', () => {
    const result = renderWithProviders(<SheetHandle height={6} />);
    expect(result).toBeTruthy();
  });
});
