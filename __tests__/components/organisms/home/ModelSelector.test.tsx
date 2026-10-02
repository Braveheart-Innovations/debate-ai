import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { ModelSelector } from '@/components/organisms/home/ModelSelector';
import { capturePropsOf } from '@test-utils/mockComponents';
import type { ModelConfig } from '@/config/modelConfigs';
import type { ActualPricing } from '@/components/organisms/subscription/ActualPricing';

const mockActualPricing = capturePropsOf<typeof ActualPricing>();

jest.mock('@/components/organisms/subscription/ActualPricing', () => ({
  get ActualPricing() {
    return mockActualPricing.Stub;
  },
}));

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Typography: ({ children, ...props }: { children: React.ReactNode }) => React.createElement(Text, props, children),
    InfoButton: ({ topicId }: { topicId: string }) => React.createElement(Text, { testID: `info-${topicId}` }, 'info'),
  };
});

jest.mock('@/config/modelPricing', () => ({
  MODEL_PRICING: {
    provider: {
      modelA: { inputPer1M: 1, outputPer1M: 2 },
    },
  },
  getFreeMessageInfo: jest.fn(() => 'Free usage'),
}));

const models: ModelConfig[] = [
  {
    id: 'modelA',
    name: 'Model A',
    description: 'Fast and light',
    contextLength: 8000,
    isDefault: true,
  },
  {
    id: 'modelB',
    name: 'Model B',
    description: 'Detailed',
    contextLength: 16000,
    isDefault: false,
    isDeprecated: true,
  },
];

describe('ModelSelector', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockActualPricing.reset();
  });

  it('toggles model selection on press', () => {
    const onSelectModel = jest.fn();

    const { getByText, queryByText } = renderWithProviders(
      <ModelSelector
        models={models}
        selectedModel={undefined}
        onSelectModel={onSelectModel}
        providerId="provider"
      />
    );

    expect(queryByText('Model B')).toBeNull();

    fireEvent.press(getByText('Model A'));
    expect(onSelectModel).toHaveBeenCalledWith('');
  });

  it('shows pricing details when model selected', () => {
    renderWithProviders(
      <ModelSelector
        models={models}
        selectedModel="modelA"
        onSelectModel={jest.fn()}
        providerId="provider"
      />
    );

    expect(mockActualPricing.latest()).toEqual(expect.objectContaining({
      inputPricePerM: 1,
      outputPricePerM: 2,
      freeInfo: 'Free usage',
    }));
  });

  it('hides deprecated models from the picker', () => {
    const { queryByText } = renderWithProviders(
      <ModelSelector
        models={models}
        selectedModel="modelB"
        onSelectModel={jest.fn()}
        providerId="provider"
      />
    );

    expect(queryByText('Model B')).toBeNull();
  });
});
