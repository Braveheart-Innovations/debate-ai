import * as SecureStore from 'expo-secure-store';
import secureStorage from '@/services/secureStorage';

describe('SecureStorageService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('saves API keys via Expo SecureStore', async () => {
    (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);

    await secureStorage.saveApiKeys({ openai: 'test-key' });

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'my_ai_friends_api_keys',
      JSON.stringify({ openai: 'test-key' })
    );
  });

  it('reads stored API keys', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(
      JSON.stringify({ claude: 'abc123' })
    );

    const result = await secureStorage.getApiKeys();

    expect(result).toEqual({ claude: 'abc123' });
  });

  it('reports whether any keys are stored', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);

    await expect(secureStorage.hasApiKeys()).resolves.toBe(false);

    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(
      JSON.stringify({ openai: 'key' })
    );

    await expect(secureStorage.hasApiKeys()).resolves.toBe(true);
  });
});
