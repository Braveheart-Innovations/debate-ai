import React from 'react';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { ActualPricing } from '@/components/organisms/subscription/ActualPricing';

describe('ActualPricing', () => {
  it('renders full pricing details with free info', () => {
    const { getByText } = renderWithProviders(
      <ActualPricing inputPricePerM={1} outputPricePerM={2} freeInfo="Includes 100 free messages" />
    );

    expect(getByText('$1')).toBeTruthy();
    expect(getByText('$2')).toBeTruthy();
    expect(getByText(/Includes 100 free messages/)).toBeTruthy();
  });

  it('renders subscription text when zero prices provided', () => {
    const { getByText } = renderWithProviders(
      <ActualPricing inputPricePerM={0} outputPricePerM={0} freeInfo="Included with subscription" />
    );

    expect(getByText('Included with subscription')).toBeTruthy();
  });

  it('shows compact pricing inline', () => {
    const { getByText } = renderWithProviders(
      <ActualPricing compact inputPricePerM={0.5} outputPricePerM={1.5} />
    );

    expect(getByText('$0.5/1M in')).toBeTruthy();
    expect(getByText('$1.5/1M out')).toBeTruthy();
  });
});
