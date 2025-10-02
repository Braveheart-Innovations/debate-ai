import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { ModelSelector } from '@/components/organisms/home/ModelSelector';
import type { ModelConfig } from '@/config/modelConfigs';

const mockActualPricing = jest.fn((props: any) => null);

jest.mock('@/components/organisms/subscription/ActualPricing', () => ({
  ActualPricing: (props: any) => {
    mockActualPricing(props);
    return null;
  },
}));

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
  },
];

describe('ModelSelector', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('toggles model selection on press', () => {
    const onSelectModel = jest.fn();

    const { getByText } = renderWithProviders(
      <ModelSelector
        models={models}
        selectedModel="modelB"
        onSelectModel={onSelectModel}
        providerId="provider"
      />
    );

    fireEvent.press(getByText('Model B'));
    expect(onSelectModel).toHaveBeenCalledWith('');

    fireEvent.press(getByText('Model A'));
    expect(onSelectModel).toHaveBeenCalledWith('modelA');
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

    expect(mockActualPricing).toHaveBeenCalledWith(expect.objectContaining({
      inputPricePerM: 1,
      outputPricePerM: 2,
      freeInfo: 'Free usage',
    }));
  });
});
