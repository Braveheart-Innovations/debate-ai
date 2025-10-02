import React from 'react';
import { Alert } from 'react-native';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) =>
      React.createElement(Text, null, children),
  };
});

const MultimodalOptionsRow = require('@/components/molecules/chat/MultimodalOptionsRow').default;

describe('MultimodalOptionsRow', () => {
  const mockAvailability = {
    imageUpload: true,
    documentUpload: true,
    imageGeneration: false,
    videoGeneration: false,
    voice: true,
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
