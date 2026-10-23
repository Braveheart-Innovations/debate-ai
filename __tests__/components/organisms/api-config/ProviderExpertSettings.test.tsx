import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { ProviderExpertSettings } from '@/components/organisms/api-config/ProviderExpertSettings';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { ModelSelector } from '@/components/organisms/home/ModelSelector';
import { ParameterSlider } from '@/components/organisms/api-config/ParameterSlider';
import { DEFAULT_PARAMETERS } from '@/config/modelConfigs';

jest.mock('@/components/molecules', () => {
  const React = require('react') as typeof import('react');
  const { Text, TouchableOpacity } = require('react-native') as typeof import('react-native');
  return {
    Typography: ({ children, ...props }: { children: React.ReactNode }) => React.createElement(Text, props, children),
    Button: ({ title, onPress }: { title: string; onPress: () => void }) => (
      React.createElement(
        TouchableOpacity,
        { onPress },
        React.createElement(Text, null, title)
      )
    ),
    InfoButton: ({ topicId }: { topicId: string }) =>
      React.createElement(Text, { testID: `info-button-${topicId}` }, 'info'),
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
    // Default model selection is always available; only the parameter
    // overrides are gated behind the Expert Mode toggle.
    expect(mockModelSelector).toHaveBeenCalledTimes(1);
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
        selectedModel="claude-sonnet-4-6"
        onModelChange={onModelChange}
        parameters={parameters}
        onParameterChange={onParameterChange}
      />
    );

    expect(mockModelSelector).toHaveBeenCalledTimes(1);
    const modelSelectorProps = mockModelSelector.mock.calls[0][0];
    expect(modelSelectorProps.selectedModel).toBe('claude-sonnet-4-6');
    modelSelectorProps.onSelectModel('claude-opus-4-1-20250805');
    expect(onModelChange).toHaveBeenCalledWith('claude-opus-4-1-20250805');

    expect(mockParameterSlider).toHaveBeenCalled();
    const paramsEncountered = mockParameterSlider.mock.calls.map((call) => call[0].name);
    expect(paramsEncountered).toEqual(expect.arrayContaining(['temperature', 'maxTokens', 'topP']));

    const temperatureSliderProps = mockParameterSlider.mock.calls.find((call) => call[0].name === 'temperature')[0];
    // Claude caps temperature at 1.
    expect(temperatureSliderProps.max).toBe(1);
    temperatureSliderProps.onChange(0.8);
    expect(onParameterChange).toHaveBeenCalledWith('temperature', 0.8);

    onParameterChange.mockClear();
    fireEvent.press(utils.getByText('Reset to Defaults'));

    expect(onParameterChange).toHaveBeenCalledWith('temperature', DEFAULT_PARAMETERS.temperature);
    // There is no default response limit: reset clears it back to the model's own.
    expect(onParameterChange).toHaveBeenCalledWith('maxTokens', undefined);
    expect(onParameterChange).toHaveBeenCalledWith('topP', DEFAULT_PARAMETERS.topP);
  });

  it('leaves an unset response limit empty and lets it reach the model maximum', () => {
    const onParameterChange = jest.fn<void, [string, number | string | string[] | undefined]>();
    renderWithProviders(
      <ProviderExpertSettings
        providerId="claude"
        isEnabled
        onToggle={jest.fn<void, [boolean]>()}
        selectedModel="claude-sonnet-4-6"
        onModelChange={jest.fn<void, [string]>()}
        parameters={{ temperature: 0.6 }}
        onParameterChange={onParameterChange}
      />
    );

    const maxTokensProps = mockParameterSlider.mock.calls.find((call) => call[0].name === 'maxTokens')[0];
    expect(maxTokensProps.value).toBeUndefined();
    expect(maxTokensProps.emptyLabel).toBe('Model default');
    // Claude Sonnet 4.6 writes up to 128K tokens.
    expect(maxTokensProps.max).toBe(128000);
    maxTokensProps.onClear();
    expect(onParameterChange).toHaveBeenCalledWith('maxTokens', undefined);
  });

  it('hides sliders for parameters the selected model does not support', () => {
    // Claude Sonnet 5 lists temperature and topP in unsupportedParams.
    renderWithProviders(
      <ProviderExpertSettings
        providerId="claude"
        isEnabled
        onToggle={jest.fn()}
        selectedModel="claude-sonnet-5"
        onModelChange={jest.fn()}
        parameters={parameters}
        onParameterChange={jest.fn()}
      />
    );

    const paramsEncountered = mockParameterSlider.mock.calls.map((call) => call[0].name);
    expect(paramsEncountered).toContain('maxTokens');
    expect(paramsEncountered).not.toContain('temperature');
    expect(paramsEncountered).not.toContain('topP');
  });
});
