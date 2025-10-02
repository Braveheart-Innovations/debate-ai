import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { ExpertModeSettings } from '@/components/organisms/api-config/ExpertModeSettings';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { DEFAULT_PARAMETERS } from '@/config/modelConfigs';

type Parameters = typeof DEFAULT_PARAMETERS & {
  stopSequences?: string[];
  seed?: number;
};

const baseParameters: Parameters = {
  temperature: 0.7,
  maxTokens: 2048,
  topP: 0.95,
  frequencyPenalty: 0,
  presencePenalty: 0,
  stopSequences: [],
  seed: 123,
};

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text, TouchableOpacity } = require('react-native');
  return {
    Typography: ({ children, ...props }: { children: React.ReactNode }) => React.createElement(Text, props, children),
    Button: ({ title, onPress, testID }: { title: string; onPress: () => void; testID?: string }) => (
      React.createElement(
        TouchableOpacity,
        { onPress, testID: testID ?? `button-${title}` },
        React.createElement(Text, null, title)
      )
    ),
  };
});

describe('ExpertModeSettings', () => {
  it('displays premium upsell messaging when the user is not premium', () => {
    const onToggle = jest.fn();
    const { getByText, getByRole } = renderWithProviders(
      <ExpertModeSettings
        providerId="openai"
        isEnabled={false}
        isPremium={false}
        onToggle={onToggle}
        onModelChange={jest.fn()}
        selectedModel={undefined}
        parameters={baseParameters}
        onParameterChange={jest.fn()}
      />
    );

    expect(getByText('Upgrade to unlock advanced controls')).toBeTruthy();
    expect(getByText('PREMIUM')).toBeTruthy();

    const toggle = getByRole('switch');
    fireEvent(toggle, 'valueChange', true);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('allows premium users to adjust models and parameters when enabled', () => {
    const onToggle = jest.fn();
    const onModelChange = jest.fn();
    const onParameterChange = jest.fn();

    const { getByRole, getByText, getByTestId } = renderWithProviders(
      <ExpertModeSettings
        providerId="openai"
        isEnabled={true}
        isPremium={true}
        onToggle={onToggle}
        selectedModel="gpt-5"
        onModelChange={onModelChange}
        parameters={baseParameters}
        onParameterChange={onParameterChange}
      />
    );

    expect(getByText('Fine-tune model behavior and parameters')).toBeTruthy();
    expect(getByText('Latest flagship model with advanced reasoning (August 2025)')).toBeTruthy();

    const toggle = getByRole('switch');
    fireEvent(toggle, 'valueChange', false);
    expect(onToggle).toHaveBeenCalledWith(false);

    fireEvent.press(getByText('GPT-5 Mini'));
    expect(onModelChange).toHaveBeenCalledWith('gpt-5-mini');

    fireEvent.press(getByText('Temperature'));
    fireEvent.press(getByText('+'));
    expect(onParameterChange).toHaveBeenCalledTimes(1);
    expect(onParameterChange.mock.calls[0][0]).toBe('temperature');
    expect(onParameterChange.mock.calls[0][1]).toBeCloseTo(0.8, 5);

    onParameterChange.mockClear();
    fireEvent.press(getByText('−'));
    expect(onParameterChange.mock.calls[0][0]).toBe('temperature');
    expect(onParameterChange.mock.calls[0][1]).toBeCloseTo(0.6, 5);

    onParameterChange.mockClear();
    fireEvent.press(getByTestId('button-Reset to Defaults'));
    expect(onParameterChange).toHaveBeenCalledWith('temperature', DEFAULT_PARAMETERS.temperature);
    expect(onParameterChange).toHaveBeenCalledWith('maxTokens', DEFAULT_PARAMETERS.maxTokens);
    expect(onParameterChange).toHaveBeenCalledWith('topP', DEFAULT_PARAMETERS.topP);
    expect(onParameterChange).toHaveBeenCalledWith('frequencyPenalty', DEFAULT_PARAMETERS.frequencyPenalty);
    expect(onParameterChange).toHaveBeenCalledWith('presencePenalty', DEFAULT_PARAMETERS.presencePenalty);
  });
});
