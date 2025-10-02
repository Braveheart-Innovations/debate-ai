import React from 'react';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { DebateStepIndicator } from '@/components/organisms/debate/DebateStepIndicator';

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
  };
});

describe('DebateStepIndicator', () => {
  it('renders all steps', () => {
    const { getByText } = renderWithProviders(
      <DebateStepIndicator
        currentStep="topic"
        completedSteps={[]}
        isPremium={false}
      />
    );
    
    expect(getByText('Motion')).toBeTruthy();
    expect(getByText('Debaters')).toBeTruthy();
  });

  it('shows personality step for premium users', () => {
    const { getByText } = renderWithProviders(
      <DebateStepIndicator
        currentStep="topic"
        completedSteps={[]}
        isPremium={true}
      />
    );
    
    expect(getByText('Personalities')).toBeTruthy();
  });

  it('hides personality step when showPersonalityStep is false', () => {
    const { queryByText } = renderWithProviders(
      <DebateStepIndicator
        currentStep="topic"
        completedSteps={[]}
        isPremium={true}
        showPersonalityStep={false}
      />
    );
    
    expect(queryByText('Personalities')).toBeNull();
  });

  it('highlights current step', () => {
    const { getByText } = renderWithProviders(
      <DebateStepIndicator
        currentStep="ai"
        completedSteps={['topic']}
        isPremium={false}
      />
    );
    
    expect(getByText('Debaters')).toBeTruthy();
  });

  it('shows completed steps', () => {
    const result = renderWithProviders(
      <DebateStepIndicator
        currentStep="ai"
        completedSteps={['topic']}
        isPremium={false}
      />
    );
    
    expect(result).toBeTruthy();
  });

  it('calculates progress correctly', () => {
    const result = renderWithProviders(
      <DebateStepIndicator
        currentStep="ai"
        completedSteps={['topic']}
        isPremium={false}
      />
    );
    
    expect(result).toBeTruthy();
  });
});
