jest.mock('../secureStorage', () => ({
  saveApiKeys: jest.fn(),
  getApiKeys: jest.fn().mockResolvedValue({}),
  clearApiKeys: jest.fn(),
  hasApiKeys: jest.fn().mockResolvedValue(false),
}));

import secureStorage from '../secureStorage';
import { APIKeyService } from '../APIKeyService';

const mockedStorage = secureStorage as jest.Mocked<typeof secureStorage>;

describe('APIKeyService', () => {
  let service: APIKeyService;

  beforeEach(() => {
    service = new APIKeyService();
    jest.clearAllMocks();
  });

  it('saves key by merging with existing keys', async () => {
    mockedStorage.getApiKeys.mockResolvedValueOnce({ openai: 'old-key' });

    await service.saveKey('anthropic', 'new-key');

    expect(mockedStorage.saveApiKeys).toHaveBeenCalledWith({
      openai: 'old-key',
      anthropic: 'new-key',
    });
  });

  it('deletes key when empty string provided', async () => {
    const deleteSpy = jest.spyOn(service, 'deleteKey').mockResolvedValue();
    await service.saveKey('openai', '');
    expect(deleteSpy).toHaveBeenCalledWith('openai');
    deleteSpy.mockRestore();
  });

  it('loadKeys returns stored keys or empty object on error', async () => {
    mockedStorage.getApiKeys.mockResolvedValueOnce({ openai: 'key' });
    expect(await service.loadKeys()).toEqual({ openai: 'key' });

    mockedStorage.getApiKeys.mockRejectedValueOnce(new Error('fail'));
    await expect(service.loadKeys()).resolves.toEqual({});
  });

  it('deleteKey removes provider entry', async () => {
    mockedStorage.getApiKeys.mockResolvedValueOnce({ openai: 'key', claude: 'abc' });
    await service.deleteKey('openai');
    expect(mockedStorage.saveApiKeys).toHaveBeenCalledWith({ claude: 'abc' });
  });

  it('clearAllKeys delegates to secure storage', async () => {
    await service.clearAllKeys();
    expect(mockedStorage.clearApiKeys).toHaveBeenCalled();
  });

  it('hasKey returns boolean value', async () => {
    mockedStorage.getApiKeys.mockResolvedValueOnce({ openai: 'key' });
    expect(await service.hasKey('openai')).toBe(true);

    mockedStorage.getApiKeys.mockResolvedValueOnce({});
    expect(await service.hasKey('anthropic')).toBe(false);
  });

  it('getKey returns stored key or null', async () => {
    mockedStorage.getApiKeys.mockResolvedValueOnce({ openai: 'key' });
    expect(await service.getKey('openai')).toBe('key');

    mockedStorage.getApiKeys.mockResolvedValueOnce({});
    expect(await service.getKey('claude')).toBeNull();
  });

  it('hasAnyKeys delegates to storage', async () => {
    mockedStorage.hasApiKeys.mockResolvedValueOnce(true);
    expect(await service.hasAnyKeys()).toBe(true);
  });

  it('getKeyCount returns number of stored keys', async () => {
    mockedStorage.getApiKeys.mockResolvedValueOnce({ openai: 'key', claude: 'abc' });
    expect(await service.getKeyCount()).toBe(2);
  });

  describe('validateKeyFormat', () => {
    it('validates non-empty length', () => {
      expect(service.validateKeyFormat('openai', '')).toEqual({
        isValid: false,
        message: 'API key cannot be empty',
      });
      expect(service.validateKeyFormat('openai', 'short')).toEqual({
        isValid: false,
        message: 'API key seems too short',
      });
    });

    it('enforces provider-specific prefixes and lengths', () => {
      expect(service.validateKeyFormat('openai', 'sk-valid-123456')).toEqual({
        isValid: true,
        message: 'Key format appears valid',
      });

      expect(service.validateKeyFormat('openai', 'ak-invalid').isValid).toBe(false);
      expect(service.validateKeyFormat('claude', '12345678901234567890').isValid).toBe(false);
      expect(service.validateKeyFormat('google', 'short').isValid).toBe(false);
      expect(service.validateKeyFormat('google', 'abcdefghijklmnopqrst').isValid).toBe(true);
    });
  });
});
