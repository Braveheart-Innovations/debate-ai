import React from 'react';
import { act, waitFor, renderHook } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { ThemeProvider } from '@/theme';
import { createAppStore } from '@/store';
import type { RootState } from '@/store';

const mockFeatureAccess = jest.fn();
const mockSetDemoModeEnabled = jest.fn();
const mockAdapterCreate = jest.fn();

const mockAiServiceInstance = {
  getAllAdapters: jest.fn(() => new Map()),
};

const mockAIServiceConstructor = jest.fn(() => mockAiServiceInstance);

jest.mock('@/hooks/useFeatureAccess', () => {
  const mock = mockFeatureAccess;
  return {
    __esModule: true,
    default: mock,
    useFeatureAccess: mock,
  };
});

jest.mock('@/services/demo/demoMode', () => ({
  setDemoModeEnabled: (...args: unknown[]) => mockSetDemoModeEnabled(...args),
}));

jest.mock('@/services/aiAdapter', () => ({
  AIService: (...args: unknown[]) => mockAIServiceConstructor(...args),
}));

jest.mock('@/services/ai', () => ({
  AdapterFactory: {
    create: (...args: unknown[]) => mockAdapterCreate(...args),
  },
}));

jest.mock('@/config/aiProviders', () => ({
  AI_PROVIDERS: [
    { id: 'claude', enabled: true },
    { id: 'openai', enabled: false },
  ],
}));

const { AIServiceProvider, useAIService } = require('@/providers/AIServiceProvider');

describe('AIServiceProvider', () => {
  const baseSettings: RootState['settings'] = {
    theme: 'auto',
    fontSize: 'medium',
    apiKeys: { claude: 'key-123' },
    realtimeRelayUrl: undefined,
    verifiedProviders: [],
    verificationTimestamps: {},
    verificationModels: {},
    expertMode: {},
    hasCompletedOnboarding: true,
    recordModeEnabled: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockAiServiceInstance.getAllAdapters.mockReturnValue(new Map());
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('initializes AI service with API keys', async () => {
    mockFeatureAccess.mockReturnValue({ isDemo: false });
    jest.useFakeTimers();

    const store = createAppStore({ settings: baseSettings });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <Provider store={store}>
        <ThemeProvider>
          <AIServiceProvider>{children}</AIServiceProvider>
        </ThemeProvider>
      </Provider>
    );

    const { result } = renderHook(() => useAIService(), { wrapper });

    await act(async () => {
      jest.runAllTimers();
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.isInitialized).toBe(true));
    expect(mockAIServiceConstructor).toHaveBeenCalledWith(baseSettings.apiKeys);
    expect(mockSetDemoModeEnabled).toHaveBeenCalledWith(false);

  });

  it('seeds demo adapters when demo mode active', async () => {
    mockFeatureAccess.mockReturnValue({ isDemo: true });
    jest.useFakeTimers();

    const store = createAppStore({ settings: baseSettings });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <Provider store={store}>
        <ThemeProvider>
          <AIServiceProvider>{children}</AIServiceProvider>
        </ThemeProvider>
      </Provider>
    );

    const { result } = renderHook(() => useAIService(), { wrapper });

    await act(async () => {
      jest.runAllTimers();
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.isInitialized).toBe(true));
    expect(mockAdapterCreate).toHaveBeenCalledWith({
      provider: 'claude',
      apiKey: 'demo',
      model: 'demo-model',
    });

  });
});
