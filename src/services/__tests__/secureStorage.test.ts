import secureStorage from '../secureStorage';
import * as SecureStore from 'expo-secure-store';

describe('secureStorage service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('saveApiKeys stores serialized payload', async () => {
    const keys = { openai: 'sk-test' };
    await secureStorage.saveApiKeys(keys);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'my_ai_friends_api_keys',
      JSON.stringify(keys)
    );
  });

  it('getApiKeys returns parsed keys or null', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(JSON.stringify({ claude: 'key' }));
    expect(await secureStorage.getApiKeys()).toEqual({ claude: 'key' });

    (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(null);
    expect(await secureStorage.getApiKeys()).toBeNull();
  });

  it('updateApiKey merges with existing keys', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(JSON.stringify({ openai: 'sk' }));
    const saveSpy = jest.spyOn(secureStorage, 'saveApiKeys').mockResolvedValue();

    await secureStorage.updateApiKey('claude', 'key');
    expect(saveSpy).toHaveBeenCalledWith({ openai: 'sk', claude: 'key' });

    saveSpy.mockRestore();
  });

  it('clearApiKeys removes stored value', async () => {
    await secureStorage.clearApiKeys();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('my_ai_friends_api_keys');
  });

  it('hasApiKeys returns boolean based on stored data', async () => {
    const getSpy = jest.spyOn(secureStorage, 'getApiKeys');
    getSpy.mockResolvedValueOnce({ openai: 'sk' });
    expect(await secureStorage.hasApiKeys()).toBe(true);
    getSpy.mockResolvedValueOnce({});
    expect(await secureStorage.hasApiKeys()).toBe(false);
    getSpy.mockResolvedValueOnce(null);
    expect(await secureStorage.hasApiKeys()).toBe(false);
    getSpy.mockRestore();
  });
});
