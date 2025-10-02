import React from 'react';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { APIProviderList } from '@/components/organisms/api-config/APIProviderList';
import type { AIProvider } from '@/config/aiProviders';
import { ProviderCard } from '@/components/organisms/api-config/ProviderCard';

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
  };
});

jest.mock('@/components/organisms/api-config/ProviderCard', () => ({
  ProviderCard: jest.fn(() => null),
}));

describe('APIProviderList', () => {
  const mockProviderCard = ProviderCard as unknown as jest.Mock;

  const provider: AIProvider = {
    id: 'claude',
    name: 'Claude',
    company: 'Anthropic',
    color: '#C15F3C',
    gradient: ['#C15F3C', '#D97757'],
    apiKeyPrefix: 'sk-ant-',
    apiKeyPlaceholder: 'sk-ant-api03-...',
    docsUrl: 'https://docs.anthropic.com',
    getKeyUrl: 'https://console.anthropic.com/account/keys',
    description: 'Advanced reasoning and analysis',
    features: ['feature-a'],
    enabled: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders an empty state when no providers are available', () => {
    const { getByText } = renderWithProviders(
      <APIProviderList
        providers={[]}
        apiKeys={{}}
        verificationStatus={{}}
        onKeyChange={jest.fn()}
        onTest={jest.fn()}
        onSave={jest.fn()}
        onToggleExpand={jest.fn()}
        expandedProvider={null}
        expertModeConfigs={{}}
      />
    );

    expect(getByText('No AI providers available')).toBeTruthy();
    expect(mockProviderCard).not.toHaveBeenCalled();
  });

  it('passes provider data through to ProviderCard and wires callbacks', async () => {
    const onKeyChange = jest.fn();
    const onTest = jest.fn().mockResolvedValue({ success: true });
    const onSave = jest.fn().mockResolvedValue(undefined);
    const onToggleExpand = jest.fn();

    renderWithProviders(
      <APIProviderList
        providers={[provider]}
        apiKeys={{ claude: 'existing-key' }}
        verificationStatus={{ claude: { status: 'success', message: 'All good' } }}
        onKeyChange={onKeyChange}
        onTest={onTest}
        onSave={onSave}
        onToggleExpand={onToggleExpand}
        expandedProvider="claude"
        expertModeConfigs={{ claude: { enabled: true, selectedModel: 'claude-3', parameters: { temperature: 0.5 } } }}
      />
    );

    expect(mockProviderCard).toHaveBeenCalledTimes(1);
    const props = mockProviderCard.mock.calls[0][0];

    expect(props.provider.id).toBe('claude');
    expect(props.apiKey).toBe('existing-key');
    expect(props.isExpanded).toBe(true);
    expect(props.testStatus).toBe('success');
    expect(props.testStatusMessage).toBe('All good');
    expect(props.selectedModel).toBe('claude-3');
    expect(props.expertModeEnabled).toBe(true);

    props.onKeyChange('new-key');
    expect(onKeyChange).toHaveBeenCalledWith('claude', 'new-key');

    await props.onTest();
    expect(onTest).toHaveBeenCalledWith('claude');

    await props.onSave();
    expect(onSave).toHaveBeenCalledWith('claude');

    props.onToggleExpand();
    expect(onToggleExpand).toHaveBeenCalledWith('claude');
  });
});
