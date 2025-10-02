import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { ProviderExpertSettings } from '@/components/organisms/api-config/ProviderExpertSettings';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { ModelSelector } from '@/components/organisms/home/ModelSelector';
import { ParameterSlider } from '@/components/organisms/api-config/ParameterSlider';
import { DEFAULT_PARAMETERS } from '@/config/modelConfigs';

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text, TouchableOpacity } = require('react-native');
  return {
    Typography: ({ children, ...props }: { children: React.ReactNode }) => React.createElement(Text, props, children),
    Button: ({ title, onPress }: { title: string; onPress: () => void }) => (
      React.createElement(
        TouchableOpacity,
        { onPress },
        React.createElement(Text, null, title)
      )
    ),
  };
});

jest.mock('@/components/organisms/home/ModelSelector', () => ({
  ModelSelector: jest.fn(() => null),
}));

jest.mock('@/components/organisms/api-config/ParameterSlider', () => ({
  ParameterSlider: jest.fn(() => null),
}));

describe('ProviderExpertSettings', () => {
  const mockModelSelector = ModelSelector as unknown as jest.Mock;
  const mockParameterSlider = ParameterSlider as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const parameters = {
    temperature: 0.6,
    maxTokens: 1500,
    topP: 0.9,
    frequencyPenalty: 0,
    presencePenalty: 0,
  };

  it('renders the toggle card and invokes onToggle when switched', () => {
    const onToggle = jest.fn();

    const { getByText, getByRole } = renderWithProviders(
      <ProviderExpertSettings
        providerId="claude"
        isEnabled={false}
        onToggle={onToggle}
        onModelChange={jest.fn()}
        parameters={parameters}
        onParameterChange={jest.fn()}
      />
    );

    expect(getByText('Expert Mode')).toBeTruthy();
    const toggle = getByRole('switch');
    fireEvent(toggle, 'valueChange', true);
    expect(onToggle).toHaveBeenCalledWith(true);
    expect(mockModelSelector).not.toHaveBeenCalled();
    expect(mockParameterSlider).not.toHaveBeenCalled();
  });

  it('renders model selector and parameter sliders when enabled', () => {
    const onToggle = jest.fn();
    const onModelChange = jest.fn();
    const onParameterChange = jest.fn();

    const utils = renderWithProviders(
      <ProviderExpertSettings
        providerId="claude"
        isEnabled
        onToggle={onToggle}
        selectedModel="claude-3-7-sonnet-20250219"
        onModelChange={onModelChange}
        parameters={parameters}
        onParameterChange={onParameterChange}
      />
    );

    expect(mockModelSelector).toHaveBeenCalledTimes(1);
    const modelSelectorProps = mockModelSelector.mock.calls[0][0];
    expect(modelSelectorProps.selectedModel).toBe('claude-3-7-sonnet-20250219');
    modelSelectorProps.onSelectModel('claude-opus-4-1-20250805');
    expect(onModelChange).toHaveBeenCalledWith('claude-opus-4-1-20250805');

    expect(mockParameterSlider).toHaveBeenCalled();
    const paramsEncountered = mockParameterSlider.mock.calls.map((call) => call[0].name);
    expect(paramsEncountered).toEqual(expect.arrayContaining(['temperature', 'maxTokens', 'topP']));

    const temperatureSliderProps = mockParameterSlider.mock.calls.find((call) => call[0].name === 'temperature')[0];
    temperatureSliderProps.onChange(0.8);
    expect(onParameterChange).toHaveBeenCalledWith('temperature', 0.8);

    onParameterChange.mockClear();
    fireEvent.press(utils.getByText('Reset to Defaults'));

    expect(onParameterChange).toHaveBeenCalledWith('temperature', DEFAULT_PARAMETERS.temperature);
    expect(onParameterChange).toHaveBeenCalledWith('maxTokens', DEFAULT_PARAMETERS.maxTokens);
    expect(onParameterChange).toHaveBeenCalledWith('topP', DEFAULT_PARAMETERS.topP);
  });
});
