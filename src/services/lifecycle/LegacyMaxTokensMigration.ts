import AsyncStorage from '@react-native-async-storage/async-storage';
import { ErrorService } from '@/services/errors/ErrorService';
import { AI_SELECTION_STORAGE_KEY } from '@/services/home/AISelectionPersistenceService';
import { CHAT_SESSION_KEY_PREFIX } from '@/services/chat/StorageService';
import { ACTIVE_SESSION_SNAPSHOT_PREFIX } from '@/services/lifecycle/ActiveSessionPersistenceService';

/**
 * One-time cleanup of the pre-2.5.0 default response limit. The Advanced parameters sheet saved
 * every default along with any edit, maxTokens 2048 included, so stored AI configs (the composer
 * selection, saved chats, interrupted-turn snapshots) carry a 2048 limit nobody chose. It runs
 * once, so a 2048 set after 2.5.0 is kept.
 */
const DONE_KEY = '@migration_legacy_max_tokens_v1';
const LEGACY_DEFAULT_MAX_TOKENS = 2048;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** Deletes `parameters.maxTokens` equal to the old default anywhere in a stored value. */
export function stripLegacyMaxTokens(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.map(stripLegacyMaxTokens).some(Boolean);
  }
  if (!isRecord(value)) return false;

  let changed = false;
  const parameters = value.parameters;
  if (isRecord(parameters) && parameters.maxTokens === LEGACY_DEFAULT_MAX_TOKENS) {
    delete parameters.maxTokens;
    changed = true;
  }
  for (const child of Object.values(value)) {
    if (stripLegacyMaxTokens(child)) changed = true;
  }
  return changed;
}

const holdsAIConfigs = (key: string): boolean =>
  key === AI_SELECTION_STORAGE_KEY ||
  key.startsWith(CHAT_SESSION_KEY_PREFIX) ||
  key.startsWith(ACTIVE_SESSION_SNAPSHOT_PREFIX);

/** Returns how many stored entries changed. */
export async function migrateLegacyMaxTokensDefault(): Promise<number> {
  try {
    if (await AsyncStorage.getItem(DONE_KEY)) return 0;

    const keys = (await AsyncStorage.getAllKeys()).filter(holdsAIConfigs);
    const entries = keys.length ? await AsyncStorage.multiGet(keys) : [];
    const updates: [string, string][] = [];
    for (const [key, raw] of entries) {
      if (!raw) continue;
      try {
        const parsed: unknown = JSON.parse(raw);
        if (stripLegacyMaxTokens(parsed)) {
          updates.push([key, JSON.stringify(parsed)]);
        }
      } catch {
        // An unreadable entry is left for its own service, which already handles it.
      }
    }

    if (updates.length) {
      await AsyncStorage.multiSet(updates);
    }
    await AsyncStorage.setItem(DONE_KEY, '1');
    return updates.length;
  } catch (error) {
    ErrorService.handleSilent(error, { action: 'migrateLegacyMaxTokensDefault' });
    return 0;
  }
}
