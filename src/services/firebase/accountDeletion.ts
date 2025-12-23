import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAuth, signOut } from '@react-native-firebase/auth';
import { StorageService } from '@/services/chat/StorageService';
import secureStorage from '@/services/secureStorage';
import verificationPersistence from '@/services/VerificationPersistenceService';
import settingsService from '@/services/settings/SettingsService';

type DeleteAccountCallableResponse = {
  success: boolean;
};

export interface DeleteAccountResult {
  success: boolean;
  requiresRecentLogin?: boolean;
  message?: string;
}

const ASYNC_STORAGE_KEYS_TO_CLEAR: string[] = [
  '@settings',
  '@subscription_status',
  '@theme_preferences',
  'theme_mode',
  'analytics_user_id',
  'analytics_events',
  'share_metrics',
  'first_share_timestamp',
  'user_attribution',
  'share_count',
  'unlocked_rewards',
  'gpt5_latency_warning_dismissed',
  '@api_verification_data',
];

const safelyRun = async (label: string, task: () => Promise<unknown>) => {
  try {
    await task();
  } catch (error) {
    console.error(`Account deletion cleanup failed while attempting to ${label}`, error);
  }
};

let functionsModulePromise: Promise<typeof import('@react-native-firebase/functions')> | null = null;

const loadFunctionsModule = async (): Promise<typeof import('@react-native-firebase/functions')> => {
  if (!functionsModulePromise) {
    functionsModulePromise = import('@react-native-firebase/functions').catch(() => {
      // Fallback for Node-based environments (e.g., Jest) without dynamic import support
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('@react-native-firebase/functions');
    });
  }
  return functionsModulePromise;
};

const clearLocalCaches = async () => {
  await Promise.all([
    safelyRun('clear saved conversations', () => StorageService.clearAllSessions()),
    safelyRun('remove saved API keys', () => secureStorage.clearApiKeys()),
    safelyRun('purge verification metadata', () => verificationPersistence.clearVerificationData()),
    safelyRun('reset app settings', () => settingsService.clearSettings()),
    safelyRun('remove cached preferences', () => AsyncStorage.multiRemove(ASYNC_STORAGE_KEYS_TO_CLEAR)),
  ]);
};

export const deleteAccount = async (): Promise<DeleteAccountResult> => {
  const auth = getAuth();
  const user = auth.currentUser;

  if (!user) {
    return {
      success: false,
      message: 'You need to be signed in to delete your account.',
    };
  }

  try {
    const functionsModule = await loadFunctionsModule();
    const functions = functionsModule.getFunctions();
    const callable = functionsModule.httpsCallable<unknown, DeleteAccountCallableResponse>(functions, 'deleteAccount');

    const response = await callable();
    const data = response?.data;

    if (!data?.success) {
      return {
        success: false,
        message: 'Account deletion was not confirmed by the server.',
      };
    }

    await clearLocalCaches();

    try {
      await signOut(auth);
    } catch (signOutError) {
      console.warn('Auth signOut failed after account deletion, continuing', signOutError);
    }

    return { success: true };
  } catch (error) {
    const err = error as { code?: string; message?: string; details?: unknown };

    if (err?.code === 'failed-precondition' && err?.details === 'reauth-required') {
      return {
        success: false,
        requiresRecentLogin: true,
        message: 'Please sign in again before deleting your account.',
      };
    }

    if (err?.code === 'permission-denied') {
      return {
        success: false,
        message: 'You need to be signed in to delete your account.',
      };
    }

    console.error('deleteAccount callable failed', error);
    return {
      success: false,
      message: err?.message || 'Something went wrong while deleting your account.',
    };
  }
};

export default deleteAccount;
