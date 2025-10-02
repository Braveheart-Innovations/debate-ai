import React from 'react';
import { render } from '@testing-library/react-native';
import { AIServiceLoading } from '@/components/organisms/common/AIServiceLoading';

describe('AIServiceLoading', () => {
  it('renders loading UI when no error is present', () => {
    const { getByText } = render(<AIServiceLoading />);

    expect(getByText('Initializing AI Service')).toBeTruthy();
    expect(getByText('Preparing your AI assistants...')).toBeTruthy();
  });

  it('renders the error state when an error message is provided', () => {
    const { getByText, queryByText } = render(<AIServiceLoading error="Connection failed" />);

    expect(getByText('Service Error')).toBeTruthy();
    expect(getByText('Connection failed')).toBeTruthy();
    expect(queryByText('Initializing AI Service')).toBeNull();
  });
});
