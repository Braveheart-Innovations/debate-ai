import * as SecureStore from 'expo-secure-store';
import { APIKeyService } from '@/services/APIKeyService';

describe('APIKeyService', () => {
  const service = APIKeyService.getInstance();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('adds or updates provider keys while preserving existing entries', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(
      JSON.stringify({ openai: 'openai-key' })
    );
    (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);

    await service.saveKey('claude', 'claude-key');

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'my_ai_friends_api_keys',
      JSON.stringify({ openai: 'openai-key', claude: 'claude-key' })
    );
  });

  it('removes provider key when saved value is empty', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(
      JSON.stringify({ openai: 'openai-key', claude: 'claude-key' })
    );
    (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);

    await service.saveKey('claude', '');

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'my_ai_friends_api_keys',
      JSON.stringify({ openai: 'openai-key' })
    );
  });

  it('validates key format', () => {
    expect(service.validateKeyFormat('openai', '')).toEqual({
      isValid: false,
      message: 'API key cannot be empty',
    });

    const valid = service.validateKeyFormat('openai', 'sk-live-123456789012345678901234567890ab');
    expect(valid.isValid).toBe(true);
  });
});
