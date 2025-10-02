import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { DemoSamplesBar } from '@/components/organisms/demo/DemoSamplesBar';

const samples = [
  { id: 'sample-1', title: 'First Sample' },
  { id: 'sample-2', title: 'Second Sample' },
];

describe('DemoSamplesBar', () => {
  it('returns null when no samples provided', () => {
    const { toJSON } = renderWithProviders(
      <DemoSamplesBar samples={[]} onSelect={jest.fn()} />
    );

    expect(toJSON()).toBeNull();
  });

  it('renders samples and handles selection', () => {
    const onSelect = jest.fn();
    const { getByText } = renderWithProviders(
      <DemoSamplesBar samples={samples} onSelect={onSelect} label="Compare" />
    );

    fireEvent.press(getByText('First Sample'));
    expect(onSelect).toHaveBeenCalledWith('sample-1');
    expect(getByText('Compare')).toBeTruthy();
  });
});
