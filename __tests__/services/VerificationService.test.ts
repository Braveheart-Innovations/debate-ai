jest.mock('@/services/VerificationPersistenceService', () => ({
  __esModule: true,
  default: {
    addVerifiedProvider: jest.fn().mockResolvedValue(undefined),
    removeVerifiedProvider: jest.fn().mockResolvedValue(undefined),
    clearVerificationData: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('@/services/TimeFormatterService', () => ({
  __esModule: true,
  default: {
    formatVerificationTime: jest.fn().mockImplementation((ts: number) => `formatted-${ts}`),
    isVerificationFresh: jest.fn().mockImplementation((ts: number) => ts >= 1_700_000_000_000),
    isVerificationStale: jest.fn().mockImplementation((ts: number) => ts < 1_600_000_000_000),
    getVerificationStatus: jest.fn().mockImplementation((ts: number) => (ts >= 1_700_000_000_000 ? 'fresh' : 'stale')),
  },
}));

import { VerificationService } from '@/services/VerificationService';
import VerificationPersistenceService from '@/services/VerificationPersistenceService';
import TimeFormatterService from '@/services/TimeFormatterService';

describe('VerificationService', () => {
  let service: VerificationService;
  const persistence = VerificationPersistenceService as unknown as {
    addVerifiedProvider: jest.Mock;
    removeVerifiedProvider: jest.Mock;
    clearVerificationData: jest.Mock;
  };
  const formatter = TimeFormatterService as unknown as {
    formatVerificationTime: jest.Mock;
    isVerificationFresh: jest.Mock;
    isVerificationStale: jest.Mock;
    getVerificationStatus: jest.Mock;
  };

  beforeEach(() => {
    (VerificationService as unknown as { instance?: VerificationService }).instance = undefined;
    service = VerificationService.getInstance();
    jest.clearAllMocks();
  });

  it('adds provider on successful verification and persists it', async () => {
    const dispatch = jest.fn();

    await service.verifyProvider('openai', dispatch, {
      success: true,
      message: 'ok',
      model: 'gpt-5',
      timestamp: 1_700_000_000_000,
    });

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'settings/addVerifiedProvider',
        payload: { providerId: 'openai', model: 'gpt-5' },
      })
    );
    expect(persistence.addVerifiedProvider).toHaveBeenCalledWith('openai', 'gpt-5');
  });

  it('removes provider when verification fails', async () => {
    const dispatch = jest.fn();

    await service.verifyProvider('claude', dispatch, {
      success: false,
      message: 'error',
    });

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'settings/removeVerifiedProvider',
        payload: 'claude',
      })
    );
    expect(persistence.removeVerifiedProvider).toHaveBeenCalledWith('claude');
  });

  it('clears all verifications through Redux and persistence', async () => {
    const dispatch = jest.fn();

    await service.clearAllVerifications(dispatch);

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'settings/setVerifiedProviders', payload: [] })
    );
    expect(persistence.clearVerificationData).toHaveBeenCalled();
  });

  it('generates status metadata only when API key present', () => {
    const statusWhenMissingKey = service.getVerificationStatus('openai', ['openai'], { openai: 1_700_000_000_000 }, false);
    expect(statusWhenMissingKey.isVerified).toBe(false);

    const status = service.getVerificationStatus('openai', ['openai'], { openai: 1_700_000_000_000 }, true);
    expect(status.isVerified).toBe(true);
    expect(status.message).toBe('formatted-1700000000000');
    expect(formatter.formatVerificationTime).toHaveBeenCalledWith(1_700_000_000_000);
  });

  it('formats verification message shorthand', () => {
    service.getVerificationStatus('openai', ['openai'], { openai: 1_700_000_000_000 }, true);
    const message = service.formatVerificationMessage('openai', ['openai'], { openai: 1_700_000_000_000 }, true);
    expect(message).toBe('formatted-1700000000000');
  });

  it('derives freshness, staleness, and age buckets', () => {
    const timestamps = { openai: 1_700_000_000_000, claude: 1_500_000_000_000 };

    expect(service.isVerificationFresh('openai', timestamps)).toBe(true);
    expect(service.isVerificationStale('claude', timestamps)).toBe(true);
    expect(service.getVerificationAge('openai', timestamps)).toBe('fresh');
    expect(service.getVerificationAge('claude', timestamps)).toBe('stale');
  });

  it('filters stale and fresh providers', () => {
    const verified = ['openai', 'claude'];
    const timestamps = { openai: 1_700_000_000_000, claude: 1_500_000_000_000 };

    expect(service.getStaleProviders(verified, timestamps)).toEqual(['claude']);
    expect(service.getFreshlyVerifiedProviders(verified, timestamps)).toEqual(['openai']);
  });

  it('counts and checks provider verification coverage', () => {
    const verified = ['openai', 'claude'];
    expect(service.getVerifiedCount(verified)).toBe(2);
    expect(service.areAllProvidersVerified(['openai'], verified)).toBe(true);
    expect(service.areAllProvidersVerified(['openai', 'google'], verified)).toBe(false);
  });
});
