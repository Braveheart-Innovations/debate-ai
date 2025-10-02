import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { HistorySearchBar } from '@/components/organisms/history/HistorySearchBar';

describe('HistorySearchBar', () => {
  it('calls onChange when text changes and shows search indicator', () => {
    const onChange = jest.fn();

    const { getByPlaceholderText, queryByText } = renderWithProviders(
      <HistorySearchBar value="" onChange={onChange} placeholder="Search..." />
    );

    fireEvent.changeText(getByPlaceholderText('Search...'), 'claude');
    expect(onChange).toHaveBeenCalledWith('claude');
    expect(queryByText('Searching...')).toBeNull();
  });

  it('renders clear button when value present and triggers clear handlers', () => {
    const onChange = jest.fn();
    const onClear = jest.fn();

    const { getByText, getByDisplayValue } = renderWithProviders(
      <HistorySearchBar value="query" onChange={onChange} onClear={onClear} />
    );

    expect(getByDisplayValue('query')).toBeTruthy();
    expect(getByText('Searching...')).toBeTruthy();

    fireEvent.press(getByText('✕'));
    expect(onChange).toHaveBeenCalledWith('');
    expect(onClear).toHaveBeenCalled();
  });
});
