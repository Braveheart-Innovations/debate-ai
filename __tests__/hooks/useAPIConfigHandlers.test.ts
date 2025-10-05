import { act, renderHook } from '@testing-library/react-native';
import { useAPIConfigHandlers } from '@/hooks/useAPIConfigHandlers';

const mockUseAPIKeys = jest.fn();
const mockUseProviderVerification = jest.fn();
const mockUseConnectionTest = jest.fn();
const mockUseExpertMode = jest.fn();

jest.mock('@/hooks/useAPIKeys', () => ({
  useAPIKeys: () => mockUseAPIKeys(),
}));

jest.mock('@/hooks/useProviderVerification', () => ({
  useProviderVerification: () => mockUseProviderVerification(),
}));

jest.mock('@/hooks/useConnectionTest', () => ({
  useConnectionTest: () => mockUseConnectionTest(),
}));

jest.mock('@/hooks/useExpertMode', () => ({
  useExpertMode: () => mockUseExpertMode(),
}));

jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'Light' },
  impactAsync: jest.fn().mockResolvedValue(undefined),
}));

const { impactAsync } = require('expo-haptics');

describe('useAPIConfigHandlers', () => {
  const apiKeys = { claude: 'anthropic-key' };
  const updateKey = jest.fn().mockResolvedValue(undefined);
  const removeVerification = jest.fn().mockResolvedValue(undefined);
  const verifyProvider = jest.fn().mockResolvedValue(undefined);
  const testConnection = jest.fn().mockResolvedValue({ success: true, message: 'ok', model: 'gpt' });
  const toggleExpertMode = jest.fn();
  const updateModel = jest.fn();
  const updateParameter = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    mockUseAPIKeys.mockReturnValue({ apiKeys, updateKey });
    mockUseProviderVerification.mockReturnValue({ verifyProvider, removeVerification });
    mockUseConnectionTest.mockReturnValue({ testConnection });
    mockUseExpertMode.mockReturnValue({ toggleExpertMode, updateModel, updateParameter });
  });

  const renderHandlers = () => renderHook(() => useAPIConfigHandlers());

  it('handles key change and clears verification when key removed', async () => {
    const { result } = renderHandlers();

    await act(async () => {
      await result.current.handleKeyChange('claude', 'new-key');
    });

    expect(updateKey).toHaveBeenCalledWith('claude', 'new-key');
    expect(removeVerification).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.handleKeyChange('claude', '');
    });

    expect(removeVerification).toHaveBeenCalledWith('claude');
  });

  it('tests connection and verifies provider on success', async () => {
    const { result } = renderHandlers();
    const outcome = await result.current.handleTestConnection('claude');

    expect(testConnection).toHaveBeenCalledWith('claude', 'anthropic-key', { mockMode: true });
    expect(updateKey).toHaveBeenCalledWith('claude', 'anthropic-key');
    expect(verifyProvider).toHaveBeenCalledWith('claude', expect.objectContaining({ success: true, model: 'gpt' }));
    expect(outcome).toEqual({ success: true, message: 'ok', model: 'gpt' });
  });

  it('returns friendly error when no key is present', async () => {
    mockUseAPIKeys.mockReturnValueOnce({ apiKeys: {}, updateKey });
    const { result } = renderHandlers();

    const outcome = await result.current.handleTestConnection('openai');
    expect(outcome).toEqual({ success: false, message: 'No API key provided' });
    expect(testConnection).not.toHaveBeenCalled();
  });

  it('returns failure result when connection test throws', async () => {
    testConnection.mockRejectedValueOnce(new Error('network'));
    const { result } = renderHandlers();

    const outcome = await result.current.handleTestConnection('claude');
    expect(outcome).toEqual({ success: false, message: 'network' });
  });

  it('saves key explicitly when requested', async () => {
    const { result } = renderHandlers();
    await result.current.handleSaveKey('claude');
    expect(updateKey).toHaveBeenCalledWith('claude', 'anthropic-key');
  });

  it('toggles provider accordion with haptics', () => {
    const { result } = renderHandlers();
    const setter = jest.fn();

    act(() => {
      result.current.handleToggleExpand('claude', null, setter);
    });
    expect(impactAsync).toHaveBeenCalled();
    expect(setter).toHaveBeenCalledWith('claude');

    act(() => {
      result.current.handleToggleExpand('claude', 'claude', setter);
    });
    expect(setter).toHaveBeenCalledWith(null);
  });

  it('guards expert mode interactions with validation', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { result } = renderHandlers();

    result.current.handleExpertModeToggle('claude');
    expect(toggleExpertMode).toHaveBeenCalledWith('claude');

    result.current.handleExpertModeToggle('invalid');
    expect(warnSpy).toHaveBeenCalledWith('Invalid provider for expert mode:', 'invalid');
    warnSpy.mockRestore();
  });

  it('updates models and parameters with validation', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { result } = renderHandlers();

    result.current.handleModelChange('openai', 'gpt-4');
    expect(updateModel).toHaveBeenCalledWith('openai', 'gpt-4');

    result.current.handleParameterChange('openai', 'temperature', 0.8);
    expect(updateParameter).toHaveBeenCalledWith('openai', 'temperature', 0.8);

    result.current.handleModelChange('unknown', 'model');
    result.current.handleParameterChange('unknown', 'temperature', 0.5);
    expect(warnSpy).toHaveBeenCalledTimes(2);
    warnSpy.mockRestore();
  });
});
