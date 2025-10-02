import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { RichTopicInput } from '@/components/organisms/debate/RichTopicInput';

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  return {
    GlassCard: ({ children }: { children: React.ReactNode }) => React.createElement(View, null, children),
    Typography: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
  };
});

describe('RichTopicInput', () => {
  const mockOnChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders with value', () => {
    const { getByDisplayValue } = renderWithProviders(
      <RichTopicInput value="Test topic" onChange={mockOnChange} />
    );
    expect(getByDisplayValue('Test topic')).toBeTruthy();
  });

  it('calls onChange when text changes', () => {
    const { getByDisplayValue } = renderWithProviders(
      <RichTopicInput value="" onChange={mockOnChange} />
    );
    
    const input = getByDisplayValue('');
    fireEvent.changeText(input, 'New topic');
    
    expect(mockOnChange).toHaveBeenCalledWith('New topic');
  });

  it('displays character count', () => {
    const { getByText } = renderWithProviders(
      <RichTopicInput value="Hello" onChange={mockOnChange} maxLength={200} />
    );
    expect(getByText('5/200')).toBeTruthy();
  });

  it('respects maxLength prop', () => {
    const { getByText } = renderWithProviders(
      <RichTopicInput value="Test" onChange={mockOnChange} maxLength={100} />
    );
    expect(getByText('4/100')).toBeTruthy();
  });

  it('uses custom placeholder', () => {
    const { getByPlaceholderText } = renderWithProviders(
      <RichTopicInput value="" onChange={mockOnChange} placeholder="Custom placeholder" />
    );
    expect(getByPlaceholderText('Custom placeholder')).toBeTruthy();
  });

  it('updates character count as text changes', () => {
    const { getByText, rerender } = renderWithProviders(
      <RichTopicInput value="Hi" onChange={mockOnChange} maxLength={200} />
    );
    expect(getByText('2/200')).toBeTruthy();
    
    rerender(<RichTopicInput value="Hello World" onChange={mockOnChange} maxLength={200} />);
    expect(getByText('11/200')).toBeTruthy();
  });
});
