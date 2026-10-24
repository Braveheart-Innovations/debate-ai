import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AIConfig, ChatSession, Message } from '@/types';
import { ErrorService } from '@/services/errors/ErrorService';

export type ActiveSessionMode = 'chat' | 'comparison' | 'create';
export type ActiveSessionStatus = 'active' | 'backgrounded' | 'interrupted' | 'cancelled' | 'failed' | 'completed';

export interface ActivePendingTurn {
  kind: 'chat_response' | 'compare_response' | 'create_task';
  prompt?: string;
  messageId?: string;
  messageIds?: string[];
  side?: 'left' | 'right' | 'both';
  aiId?: string;
  aiName?: string;
  providerId?: string;
  reason?: string;
  startedAt?: number;
  interruptedAt?: number;
}

interface ActiveSessionBaseSnapshot {
  version: 1;
  mode: ActiveSessionMode;
  sessionId: string;
  status: ActiveSessionStatus;
  createdAt?: number;
  updatedAt: number;
  selectedAIs?: AIConfig[];
  messages?: Message[];
  selectedModels?: Record<string, string>;
  aiPersonalities?: Record<string, string>;
  pendingTurn?: ActivePendingTurn;
  interruptedMessageIds?: string[];
}

export interface ActiveChatSessionSnapshot extends ActiveSessionBaseSnapshot {
  mode: 'chat';
  session: ChatSession;
}

export interface ActiveCompareSessionSnapshot extends ActiveSessionBaseSnapshot {
  mode: 'comparison';
  leftAI: AIConfig;
  rightAI: AIConfig;
  userMessages: Message[];
  leftMessages: Message[];
  rightMessages: Message[];
  leftStreamingContent?: string;
  rightStreamingContent?: string;
  leftTyping?: boolean;
  rightTyping?: boolean;
  viewMode: 'split' | 'left-full' | 'right-full' | 'left-only' | 'right-only';
  continuedSide?: 'left' | 'right' | null;
}

export interface ActiveCreateSessionSnapshot extends ActiveSessionBaseSnapshot {
  mode: 'create';
}

export type ActiveSessionSnapshot =
  | ActiveChatSessionSnapshot
  | ActiveCompareSessionSnapshot
  | ActiveCreateSessionSnapshot;

export type ActiveSessionSnapshotInput =
  | (Omit<ActiveChatSessionSnapshot, 'version' | 'updatedAt'> & { version?: 1; updatedAt?: number })
  | (Omit<ActiveCompareSessionSnapshot, 'version' | 'updatedAt'> & { version?: 1; updatedAt?: number })
  | (Omit<ActiveCreateSessionSnapshot, 'version' | 'updatedAt'> & { version?: 1; updatedAt?: number });

interface ActiveSessionIndexEntry {
  mode: ActiveSessionMode;
  sessionId: string;
  key: string;
  status: ActiveSessionStatus;
  updatedAt: number;
}

const STORAGE_VERSION = 1;
const INDEX_KEY = 'activeSessionSnapshots_index_v1';
export const ACTIVE_SESSION_SNAPSHOT_PREFIX = 'activeSessionSnapshot_v1_';
const SNAPSHOT_PREFIX = ACTIVE_SESSION_SNAPSHOT_PREFIX;
const SENSITIVE_FIELD_PATTERN = /(api[_-]?key|authorization|bearer|secret|token|password)/i;

const getSnapshotKey = (mode: ActiveSessionMode, sessionId: string): string =>
  `${SNAPSHOT_PREFIX}${mode}_${sessionId}`;

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const ACTIVE_SESSION_MODES: ReadonlySet<unknown> = new Set<ActiveSessionMode>(['chat', 'comparison', 'create']);
// Debates cannot be resumed, so their snapshots are no longer written; older builds left some behind.
const RETIRED_SESSION_MODES: ReadonlySet<unknown> = new Set(['debate']);
const ACTIVE_SESSION_STATUSES: ReadonlySet<unknown> = new Set<ActiveSessionStatus>([
  'active',
  'backgrounded',
  'interrupted',
  'cancelled',
  'failed',
  'completed',
]);

/** A persisted index entry, validated field by field (storage is untyped and may be stale). */
const isIndexEntry = (value: unknown): value is ActiveSessionIndexEntry =>
  isObject(value)
  && ACTIVE_SESSION_MODES.has(value.mode)
  && typeof value.sessionId === 'string'
  && typeof value.key === 'string'
  && ACTIVE_SESSION_STATUSES.has(value.status)
  && typeof value.updatedAt === 'number';

const hasDebateOnlyMessages = (messages: unknown): boolean => {
  if (!Array.isArray(messages)) return false;
  return messages.some((message) => (
    isObject(message)
    && (
      message.sender === 'Debate Host'
      || message.content === 'Cast your opening audience stance before the first speech.'
    )
  ));
};

const isValidChatSnapshot = (value: Record<string, unknown>): boolean => {
  const session = value.session;
  if (!isObject(session)) return false;

  const sessionId = String(value.sessionId);
  const sessionType = session.sessionType;
  if (session.id !== sessionId) return false;
  if (typeof session.id === 'string' && session.id.startsWith('debate_')) return false;
  if (sessionType !== undefined && sessionType !== 'chat') return false;
  if ('debateSession' in value || 'debateConfig' in session || 'topic' in session) return false;
  if (hasDebateOnlyMessages(session.messages) || hasDebateOnlyMessages(value.messages)) return false;

  return Array.isArray(session.selectedAIs) && Array.isArray(session.messages);
};

const isModeCompatibleSnapshot = (value: Record<string, unknown>): boolean => {
  if (value.mode === 'chat') {
    return isValidChatSnapshot(value);
  }

  return true;
};

const scrubSensitiveFields = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map(item => scrubSensitiveFields(item)) as T;
  }

  if (!isObject(value)) {
    return value;
  }

  const scrubbed: Record<string, unknown> = {};
  Object.entries(value).forEach(([key, entry]) => {
    if (SENSITIVE_FIELD_PATTERN.test(key)) {
      return;
    }
    scrubbed[key] = scrubSensitiveFields(entry);
  });
  return scrubbed as T;
};

const isSnapshot = (value: unknown): value is ActiveSessionSnapshot => {
  if (!isObject(value)) return false;
  return value.version === STORAGE_VERSION
    && typeof value.sessionId === 'string'
    && typeof value.updatedAt === 'number'
    && ACTIVE_SESSION_MODES.has(value.mode)
    && isModeCompatibleSnapshot(value);
};

export class ActiveSessionPersistenceService {
  private static async getIndex(): Promise<ActiveSessionIndexEntry[]> {
    try {
      const raw = await AsyncStorage.getItem(INDEX_KEY);
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      const entries = parsed.filter(isIndexEntry);
      const retiredKeys = parsed
        .filter((entry): entry is Record<string, unknown> => isObject(entry) && RETIRED_SESSION_MODES.has(entry.mode))
        .map((entry) => entry.key)
        .filter((key): key is string => typeof key === 'string');
      if (retiredKeys.length > 0) {
        await Promise.all(retiredKeys.map((key) => AsyncStorage.removeItem(key)));
        await this.saveIndex(entries);
      }
      return entries;
    } catch (error) {
      ErrorService.handleSilent(error, { action: 'ActiveSessionPersistenceService.getIndex' });
      return [];
    }
  }

  private static async saveIndex(entries: ActiveSessionIndexEntry[]): Promise<void> {
    await AsyncStorage.setItem(
      INDEX_KEY,
      JSON.stringify(entries.sort((a, b) => b.updatedAt - a.updatedAt))
    );
  }

  static async saveSnapshot(snapshot: ActiveSessionSnapshotInput): Promise<ActiveSessionSnapshot> {
    const now = snapshot.updatedAt || Date.now();
    const normalized = scrubSensitiveFields({
      ...snapshot,
      version: STORAGE_VERSION,
      updatedAt: now,
    } as ActiveSessionSnapshot);
    const key = getSnapshotKey(normalized.mode, normalized.sessionId);

    try {
      await AsyncStorage.setItem(key, JSON.stringify(normalized));
      const index = await this.getIndex();
      const withoutCurrent = index.filter(entry => !(entry.mode === normalized.mode && entry.sessionId === normalized.sessionId));
      await this.saveIndex([
        {
          mode: normalized.mode,
          sessionId: normalized.sessionId,
          key,
          status: normalized.status,
          updatedAt: normalized.updatedAt,
        },
        ...withoutCurrent,
      ]);
    } catch (error) {
      ErrorService.handleSilent(error, {
        action: 'ActiveSessionPersistenceService.saveSnapshot',
        mode: normalized.mode,
        sessionId: normalized.sessionId,
      });
      throw error;
    }

    return normalized;
  }

  static async loadSnapshot<T extends ActiveSessionSnapshot = ActiveSessionSnapshot>(
    mode: ActiveSessionMode,
    sessionId: string
  ): Promise<T | null> {
    try {
      const raw = await AsyncStorage.getItem(getSnapshotKey(mode, sessionId));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return isSnapshot(parsed) ? parsed as T : null;
    } catch (error) {
      ErrorService.handleSilent(error, {
        action: 'ActiveSessionPersistenceService.loadSnapshot',
        mode,
        sessionId,
      });
      return null;
    }
  }

  static async loadLatestSnapshot<T extends ActiveSessionSnapshot = ActiveSessionSnapshot>(
    mode?: ActiveSessionMode
  ): Promise<T | null> {
    const index = await this.getIndex();
    const candidates = index.filter(item => (!mode || item.mode === mode) && item.status !== 'completed');
    for (const entry of candidates) {
      const snapshot = await this.loadSnapshot<T>(entry.mode, entry.sessionId);
      if (snapshot) return snapshot;
    }
    return null;
  }

  static async getAllSnapshots(mode?: ActiveSessionMode): Promise<ActiveSessionSnapshot[]> {
    const index = await this.getIndex();
    const snapshots = await Promise.all(
      index
        .filter(entry => !mode || entry.mode === mode)
        .map(entry => this.loadSnapshot(entry.mode, entry.sessionId))
    );
    return snapshots.filter((snapshot): snapshot is ActiveSessionSnapshot => Boolean(snapshot));
  }

  static async clearSnapshot(mode: ActiveSessionMode, sessionId: string): Promise<void> {
    const key = getSnapshotKey(mode, sessionId);
    await AsyncStorage.removeItem(key);
    const index = await this.getIndex();
    await this.saveIndex(index.filter(entry => !(entry.mode === mode && entry.sessionId === sessionId)));
  }

  static async clearCompletedSnapshots(): Promise<void> {
    const index = await this.getIndex();
    const completed = index.filter(entry => entry.status === 'completed');
    await Promise.all(completed.map(entry => AsyncStorage.removeItem(entry.key)));
    await this.saveIndex(index.filter(entry => entry.status !== 'completed'));
  }

  static async markInterrupted(
    mode: ActiveSessionMode,
    sessionId: string,
    pendingTurn?: ActivePendingTurn
  ): Promise<ActiveSessionSnapshot | null> {
    const snapshot = await this.loadSnapshot(mode, sessionId);
    if (!snapshot) return null;
    return this.saveSnapshot({
      ...snapshot,
      status: 'interrupted',
      pendingTurn: pendingTurn || snapshot.pendingTurn,
      interruptedMessageIds: snapshot.interruptedMessageIds || pendingTurn?.messageIds,
    });
  }
}
