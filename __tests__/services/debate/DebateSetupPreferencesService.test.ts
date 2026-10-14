import AsyncStorage from '@react-native-async-storage/async-storage';
import DebateSetupPreferencesService from '@/services/debate/DebateSetupPreferencesService';

const STORAGE_KEY = '@debate_setup_preferences_v1';

describe('DebateSetupPreferencesService', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('remembers the last speech length across loads', async () => {
    await DebateSetupPreferencesService.save({ speechLength: 'verbose' });

    await expect(DebateSetupPreferencesService.load()).resolves.toEqual({ speechLength: 'verbose' });
  });

  it('has nothing to restore on first run', async () => {
    await expect(DebateSetupPreferencesService.load()).resolves.toBeNull();
  });

  it('ignores a stored level the app does not know', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ speechLength: 'epic' }));
    await expect(DebateSetupPreferencesService.load()).resolves.toEqual({});

    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(['verbose']));
    await expect(DebateSetupPreferencesService.load()).resolves.toEqual({});
  });

  it('treats unreadable storage as nothing to restore', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await AsyncStorage.setItem(STORAGE_KEY, '{not json');

    await expect(DebateSetupPreferencesService.load()).resolves.toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
