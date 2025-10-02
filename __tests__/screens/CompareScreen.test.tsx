import React from 'react';
import { renderWithProviders } from '../../test-utils/renderWithProviders';
import type { AI } from '@/types';
import { waitFor } from '@testing-library/react-native';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
  MaterialIcons: () => null,
  MaterialCommunityIcons: () => null,
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => children,
}));

const mockFeatureAccess = jest.fn();
const mockUseAIService = jest.fn();
const mockUseMergedAvailability = jest.fn();
const mockListSamples = jest.fn();

jest.mock('@/hooks/useFeatureAccess', () => {
  const mock = mockFeatureAccess;
  return {
    __esModule: true,
    default: mock,
    useFeatureAccess: mock,
  };
});

jest.mock('@/providers/AIServiceProvider', () => ({
  useAIService: (...args: unknown[]) => mockUseAIService(...args),
}));

jest.mock('@/hooks/multimodal/useModalityAvailability', () => ({
  useMergedModalityAvailability: (...args: unknown[]) => mockUseMergedAvailability(...args),
}));

jest.mock('@/services/demo/DemoContentService', () => ({
  DemoContentService: {
    listCompareSamples: (...args: unknown[]) => mockListSamples(...args),
    findCompareById: jest.fn().mockResolvedValue(null),
    getCompareSampleForProviders: jest.fn().mockResolvedValue(null),
  },
}));

jest.mock('@/services/demo/DemoPlaybackRouter', () => ({
  loadCompareScript: jest.fn(),
  primeNextCompareTurn: jest.fn().mockReturnValue({ user: 'Prompt' }),
  hasNextCompareTurn: jest.fn().mockReturnValue(false),
}));

jest.mock('@/services/demo/RecordController', () => ({
  RecordController: {
    isActive: jest.fn().mockReturnValue(false),
    recordUserMessage: jest.fn(),
    recordAssistantMessage: jest.fn(),
    recordAssistantChunk: jest.fn(),
    startCompare: jest.fn(),
    stop: jest.fn(),
  },
}));

jest.mock('@/services/chat/StorageService', () => ({
  StorageService: {
    loadSession: jest.fn().mockResolvedValue(null),
    saveSession: jest.fn().mockResolvedValue(undefined),
    enforceStorageLimits: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('@/services/chat', () => ({
  PromptBuilder: {
    appendPersonaGuidance: jest.fn((text: string) => text),
  },
}));

jest.mock('@/services/streaming/StreamingService', () => ({
  getStreamingService: () => ({
    streamResponse: jest.fn(),
    cancelAllStreams: jest.fn(),
  }),
}));

jest.mock('@/components/molecules/subscription/DemoBanner', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    DemoBanner: () => React.createElement(Text, null, 'Sample comparisons only.'),
  };
});

jest.mock('@/components/organisms', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Header: ({ title }: { title: string }) => React.createElement(Text, null, title),
    HeaderActions: () => React.createElement(Text, null, 'HeaderActions'),
    CompareSplitView: () => React.createElement(Text, null, 'CompareSplitView'),
    CompareUserMessage: () => React.createElement(Text, null, 'UserMessage'),
  };
});

jest.mock('@/components/organisms/chat', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    ChatInputBar: () => React.createElement(Text, null, 'ChatInputBar'),
  };
});

jest.mock('@/components/organisms/demo/DemoSamplesBar', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    DemoSamplesBar: ({ label = 'Demo Samples' }: { label?: string }) =>
      React.createElement(Text, null, label),
  };
});

jest.mock('@/components/organisms/demo/CompareRecordPickerModal', () => ({
  CompareRecordPickerModal: () => null,
}));

const CompareScreen = require('@/screens/CompareScreen').default;

describe('CompareScreen', () => {
  const navigation = { navigate: jest.fn(), goBack: jest.fn() };
  const leftAI: AI = { id: 'left', provider: 'claude', name: 'Claude', model: 'claude-3-haiku' };
  const rightAI: AI = { id: 'right', provider: 'openai', name: 'GPT-4', model: 'gpt-4-turbo' };

  beforeEach(() => {
    jest.clearAllMocks();
    mockFeatureAccess.mockReturnValue({ isDemo: true });
    mockUseAIService.mockReturnValue({
      aiService: null,
      isInitialized: false,
      isLoading: false,
      error: null,
      reinitialize: jest.fn(),
    });
    mockUseMergedAvailability.mockReturnValue({
      imageUpload: { supported: true },
      documentUpload: { supported: true },
      voiceInput: { supported: true },
      voiceOutput: { supported: true },
      realtime: { supported: false },
      imageGeneration: { supported: true },
      videoGeneration: { supported: false },
    });
    mockListSamples.mockResolvedValue([{ id: 'demo-sample', title: 'Sample Debate' }]);
  });

  it('shows demo guidance when running in demo mode', async () => {
    const route = { params: { leftAI, rightAI } } as const;

    const { getByText } = renderWithProviders(
      <CompareScreen navigation={navigation} route={route} />
    );

    await waitFor(() => {
      expect(getByText('Demo Samples')).toBeTruthy();
    });

    expect(getByText(/Sample comparisons only/i)).toBeTruthy();
  });
});
