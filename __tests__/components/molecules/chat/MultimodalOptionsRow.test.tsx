import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import MultimodalOptionsRow from '@/components/molecules/chat/MultimodalOptionsRow';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

jest.mock('@/components/molecules', () => {
  const React = require('react') as typeof import('react');
  const { Text } = require('react-native') as typeof import('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) =>
      React.createElement(Text, null, children),
  };
});

describe('MultimodalOptionsRow', () => {
  const mockAvailability = {
    imageUpload: true,
    documentUpload: true,
    imageGeneration: false,
    videoGeneration: false,
  };

  it('renders all modality options', () => {
    const onSelect = jest.fn();
    const onClose = jest.fn();
    
    const { getByText } = renderWithProviders(
      <MultimodalOptionsRow
        availability={mockAvailability}
        onSelect={onSelect}
        onClose={onClose}
      />
    );

    expect(getByText('Image')).toBeTruthy();
    expect(getByText('Doc')).toBeTruthy();
  });

  it('calls onSelect when enabled option pressed', () => {
    const onSelect = jest.fn();
    const onClose = jest.fn();

    const { getByLabelText } = renderWithProviders(
      <MultimodalOptionsRow
        availability={mockAvailability}
        onSelect={onSelect}
        onClose={onClose}
      />
    );

    fireEvent.press(getByLabelText('Image'));
    expect(onClose).toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledWith('imageUpload');
  });
});
