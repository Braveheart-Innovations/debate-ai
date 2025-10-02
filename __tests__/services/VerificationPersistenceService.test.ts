import AsyncStorage from '@react-native-async-storage/async-storage';
import VerificationPersistenceService from '@/services/VerificationPersistenceService';

const service = VerificationPersistenceService;

describe('VerificationPersistenceService', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('persists and loads verification data', async () => {
    const data = {
      verifiedProviders: ['openai'],
      verificationTimestamps: { openai: 123 },
      verificationModels: { openai: 'gpt-5' },
    };

    await service.saveVerificationData(data);
    const loaded = await service.loadVerificationData();

    expect(loaded).toEqual(data);
  });

  it('returns null when no data stored', async () => {
    const loaded = await service.loadVerificationData();
    expect(loaded).toBeNull();
  });

  it('clears stored verification data', async () => {
    await service.saveVerificationData({
      verifiedProviders: ['openai'],
      verificationTimestamps: { openai: 1 },
      verificationModels: { openai: 'gpt-5' },
    });

    await service.clearVerificationData();
    const loaded = await service.loadVerificationData();

    expect(loaded).toBeNull();
  });

  it('adds and removes verified providers while tracking timestamps and models', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);

    await service.addVerifiedProvider('claude', 'claude-3');
    let data = await service.loadVerificationData();

    expect(data?.verifiedProviders).toEqual(['claude']);
    expect(data?.verificationTimestamps.claude).toBe(1_700_000_000_000);
    expect(data?.verificationModels.claude).toBe('claude-3');

    await service.removeVerifiedProvider('claude');
    data = await service.loadVerificationData();

    expect(data?.verifiedProviders).toEqual([]);
    expect(data?.verificationTimestamps.claude).toBeUndefined();
    expect(data?.verificationModels.claude).toBeUndefined();
  });

  it('exposes convenience getters for verification lookups', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    await service.addVerifiedProvider('google', 'gemini');

    expect(await service.isProviderVerified('google')).toBe(true);
    expect(await service.isProviderVerified('openai')).toBe(false);
    expect(await service.getVerificationTimestamp('google')).toBe(1_700_000_000_000);
    expect(await service.getVerificationModel('google')).toBe('gemini');
  });
});
