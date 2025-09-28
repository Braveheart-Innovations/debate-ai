import { act } from '@testing-library/react-native';
import { renderHookWithProviders } from '../../test-utils/renderHookWithProviders';
import { useProviderVerification } from '@/hooks/useProviderVerification';
import type { RootState } from '@/store';
import VerificationService from '@/services/VerificationService';

describe('useProviderVerification', () => {
  const baseState: Partial<RootState> = {
    settings: {
      theme: 'auto',
      fontSize: 'medium',
      apiKeys: {},
      realtimeRelayUrl: undefined,
      verifiedProviders: ['openai'],
      verificationTimestamps: { openai: 123456 },
      verificationModels: { openai: 'gpt-4.1-mini' },
      expertMode: {},
      hasCompletedOnboarding: false,
      recordModeEnabled: false,
    },
  };

  let verifyProviderSpy: jest.SpyInstance;
  let removeVerificationSpy: jest.SpyInstance;
  let clearAllSpy: jest.SpyInstance;
  let getStatusSpy: jest.SpyInstance;
  let formatMessageSpy: jest.SpyInstance;
  let isFreshSpy: jest.SpyInstance;
  let isStaleSpy: jest.SpyInstance;
  let getAgeSpy: jest.SpyInstance;
  let getCountSpy: jest.SpyInstance;
  let getUnverifiedSpy: jest.SpyInstance;
  let allVerifiedSpy: jest.SpyInstance;
  let getSummarySpy: jest.SpyInstance;

  beforeEach(() => {
    verifyProviderSpy = jest.spyOn(VerificationService, 'verifyProvider').mockResolvedValue();
    removeVerificationSpy = jest.spyOn(VerificationService, 'removeVerification').mockResolvedValue();
    clearAllSpy = jest.spyOn(VerificationService, 'clearAllVerifications').mockResolvedValue();
    getStatusSpy = jest.spyOn(VerificationService, 'getVerificationStatus').mockReturnValue({ isVerified: false });
    formatMessageSpy = jest.spyOn(VerificationService, 'formatVerificationMessage').mockReturnValue(undefined);
    isFreshSpy = jest.spyOn(VerificationService, 'isVerificationFresh').mockReturnValue(false);
    isStaleSpy = jest.spyOn(VerificationService, 'isVerificationStale').mockReturnValue(false);
    getAgeSpy = jest.spyOn(VerificationService, 'getVerificationAge').mockReturnValue('none');
    getCountSpy = jest.spyOn(VerificationService, 'getVerifiedCount').mockReturnValue(0);
    getUnverifiedSpy = jest.spyOn(VerificationService, 'getUnverifiedProviders').mockReturnValue([]);
    allVerifiedSpy = jest.spyOn(VerificationService, 'areAllProvidersVerified').mockReturnValue(false);
    getSummarySpy = jest.spyOn(VerificationService, 'getVerificationSummary').mockReturnValue({
      total: 0,
      verified: 0,
      fresh: 0,
      stale: 0,
      percentage: 0,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('exposes provider verification state from redux', () => {
    const { result } = renderHookWithProviders(() => useProviderVerification(), {
      preloadedState: baseState,
    });

    expect(result.current.verifiedProviders).toEqual(['openai']);
    expect(result.current.verificationTimestamps.openai).toBe(123456);
    expect(result.current.getVerificationModel('openai')).toBe('gpt-4.1-mini');
  });

  it('delegates verification actions to VerificationService with dispatch', async () => {
    const { result } = renderHookWithProviders(() => useProviderVerification(), {
      preloadedState: baseState,
    });

    const payload = { success: true, message: 'ok', model: 'gpt-4.1-mini' };

    await act(async () => {
      await result.current.verifyProvider('openai', payload);
      await result.current.removeVerification('openai');
      await result.current.clearAllVerifications();
    });

    expect(verifyProviderSpy).toHaveBeenCalledWith('openai', expect.any(Function), payload);
    expect(removeVerificationSpy).toHaveBeenCalledWith('openai', expect.any(Function));
    expect(clearAllSpy).toHaveBeenCalledWith(expect.any(Function));
  });

  it('uses VerificationService helpers for derived state', () => {
    getStatusSpy.mockReturnValueOnce({ isVerified: true });
    formatMessageSpy.mockReturnValueOnce('Verified recently');
    isFreshSpy.mockReturnValueOnce(true);
    isStaleSpy.mockReturnValueOnce(false);
    getAgeSpy.mockReturnValueOnce('fresh');
    getCountSpy.mockReturnValueOnce(1);
    getUnverifiedSpy.mockReturnValueOnce(['claude']);
    allVerifiedSpy.mockReturnValueOnce(false);
    getSummarySpy.mockReturnValueOnce({
      total: 2,
      verified: 1,
      fresh: 1,
      stale: 0,
      percentage: 50,
    });

    const { result } = renderHookWithProviders(() => useProviderVerification(), {
      preloadedState: baseState,
    });

    expect(result.current.getVerificationStatus('openai', true)).toEqual({ isVerified: true });
    expect(getStatusSpy).toHaveBeenCalledWith('openai', ['openai'], { openai: 123456 }, true);
    expect(result.current.getVerificationMessage('openai', true)).toBe('Verified recently');
    expect(result.current.isVerificationFresh('openai')).toBe(true);
    expect(result.current.isVerificationStale('openai')).toBe(false);
    expect(result.current.getVerificationAge('openai')).toBe('fresh');
    expect(result.current.getVerifiedCount()).toBe(1);
    expect(result.current.getUnverifiedProviders(['claude', 'openai'])).toEqual(['claude']);
    expect(result.current.areAllProvidersVerified(['claude', 'openai'])).toBe(false);
    expect(result.current.getVerificationSummary(['claude', 'openai'])).toEqual({
      total: 2,
      verified: 1,
      fresh: 1,
      stale: 0,
      percentage: 50,
    });
  });
});
