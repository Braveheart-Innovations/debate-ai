import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { FAQItem } from '@/components/molecules/help/FAQItem';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));

describe('FAQItem', () => {
  const defaultProps = {
    question: 'How do I start a debate?',
    answer: 'Select two AIs and enter a topic to begin.',
    isExpanded: false,
    onToggle: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders collapsed state correctly', () => {
    const { getByText, queryByText } = renderWithProviders(<FAQItem {...defaultProps} />);

    expect(getByText('How do I start a debate?')).toBeTruthy();
    // Answer should not be visible when collapsed
    expect(queryByText('Select two AIs and enter a topic to begin.')).toBeNull();
  });

  it('renders expanded state with answer visible', () => {
    const { getByText } = renderWithProviders(<FAQItem {...defaultProps} isExpanded={true} />);

    expect(getByText('How do I start a debate?')).toBeTruthy();
    expect(getByText('Select two AIs and enter a topic to begin.')).toBeTruthy();
  });

  it('calls onToggle when pressed', () => {
    const onToggle = jest.fn();
    const { getByText } = renderWithProviders(<FAQItem {...defaultProps} onToggle={onToggle} />);

    fireEvent.press(getByText('How do I start a debate?'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('renders with custom testID', () => {
    const { getByTestId } = renderWithProviders(<FAQItem {...defaultProps} testID="faq-item" />);

    expect(getByTestId('faq-item')).toBeTruthy();
  });
});
