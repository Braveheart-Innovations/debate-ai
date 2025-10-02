import React from 'react';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';

jest.mock('@/components/molecules/common/Badge', () => ({
  Badge: ({ label }: { label: string }) => {
    const React = require('react');
    const { Text } = require('react-native');
    return React.createElement(Text, null, label);
  },
}));

const { ProviderFeatures } = require('@/components/molecules/api-config/ProviderFeatures');

describe('ProviderFeatures', () => {
  const mockFeatures = ['Chat', 'Image Generation', 'Voice', 'Code', 'Analysis'];

  it('renders all features when less than maxVisible', () => {
    const { getByText } = renderWithProviders(
      <ProviderFeatures features={['Chat', 'Voice']} />
    );

    expect(getByText('Chat')).toBeTruthy();
    expect(getByText('Voice')).toBeTruthy();
  });

  it('shows only maxVisible features plus "more" badge', () => {
    const { getByText, queryByText } = renderWithProviders(
      <ProviderFeatures features={mockFeatures} maxVisible={3} />
    );

    expect(getByText('Chat')).toBeTruthy();
    expect(getByText('Image Generation')).toBeTruthy();
    expect(getByText('Voice')).toBeTruthy();
    expect(getByText('+2 more')).toBeTruthy();
    expect(queryByText('Code')).toBeNull();
  });

  it('renders nothing when features array is empty', () => {
    const { queryByTestId } = renderWithProviders(
      <ProviderFeatures features={[]} testID="provider-features" />
    );

    expect(queryByTestId('provider-features')).toBeNull();
  });

  it('renders nothing when features is null or undefined', () => {
    const { queryByTestId: query1 } = renderWithProviders(
      <ProviderFeatures features={null as any} testID="provider-features-1" />
    );
    const { queryByTestId: query2 } = renderWithProviders(
      <ProviderFeatures features={undefined as any} testID="provider-features-2" />
    );

    expect(query1('provider-features-1')).toBeNull();
    expect(query2('provider-features-2')).toBeNull();
  });

  it('shows all features when maxVisible equals features length', () => {
    const features = ['Chat', 'Voice', 'Image'];
    const { getByText, queryByText } = renderWithProviders(
      <ProviderFeatures features={features} maxVisible={3} />
    );

    expect(getByText('Chat')).toBeTruthy();
    expect(getByText('Voice')).toBeTruthy();
    expect(getByText('Image')).toBeTruthy();
    expect(queryByText(/more/)).toBeNull();
  });

  it('shows all features when maxVisible exceeds features length', () => {
    const features = ['Chat', 'Voice'];
    const { getByText, queryByText } = renderWithProviders(
      <ProviderFeatures features={features} maxVisible={5} />
    );

    expect(getByText('Chat')).toBeTruthy();
    expect(getByText('Voice')).toBeTruthy();
    expect(queryByText(/more/)).toBeNull();
  });

  it('applies custom badgeVariant', () => {
    const { getByText } = renderWithProviders(
      <ProviderFeatures
        features={['Premium Feature']}
        badgeVariant="premium"
      />
    );

    expect(getByText('Premium Feature')).toBeTruthy();
  });

  it('applies testID when provided', () => {
    const { getByTestId } = renderWithProviders(
      <ProviderFeatures
        features={['Chat']}
        testID="provider-features"
      />
    );

    expect(getByTestId('provider-features')).toBeTruthy();
  });

  it('calculates correct hidden count', () => {
    const { getByText } = renderWithProviders(
      <ProviderFeatures features={mockFeatures} maxVisible={2} />
    );

    // 5 total features - 2 visible = 3 hidden
    expect(getByText('+3 more')).toBeTruthy();
  });
});