import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActiveSessionPersistenceService } from '@/services/lifecycle/ActiveSessionPersistenceService';
import type { AIConfig, Message } from '@/types';

const ai: AIConfig = {
  id: 'claude-main',
  provider: 'claude',
  name: 'Claude',
  model: 'claude-3-5-sonnet',
};

const userMessage: Message = {
  id: 'msg-user',
  sender: 'You',
  senderType: 'user',
  content: 'Hello',
  timestamp: 1000,
};

describe('ActiveSessionPersistenceService', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('saves and loads a versioned chat snapshot', async () => {
    await ActiveSessionPersistenceService.saveSnapshot({
      mode: 'chat',
      sessionId: 'session-1',
      status: 'active',
      createdAt: 1000,
      selectedAIs: [ai],
      messages: [userMessage],
      session: {
        id: 'session-1',
        selectedAIs: [ai],
        messages: [userMessage],
        isActive: true,
        createdAt: 1000,
        sessionType: 'chat',
      },
    });

    const loaded = await ActiveSessionPersistenceService.loadSnapshot('chat', 'session-1');

    expect(loaded).toEqual(expect.objectContaining({
      version: 1,
      mode: 'chat',
      sessionId: 'session-1',
      status: 'active',
    }));
  });

  it('scrubs sensitive fields before persisting snapshots', async () => {
    await ActiveSessionPersistenceService.saveSnapshot({
      mode: 'chat',
      sessionId: 'session-sensitive',
      status: 'active',
      selectedAIs: [ai],
      messages: [{
        ...userMessage,
        metadata: {
          providerMetadata: {
            apiKey: 'sk-should-not-persist',
            nested: {
              authorization: 'Bearer secret',
              safe: 'kept',
            },
          },
        },
      }],
      session: {
        id: 'session-sensitive',
        selectedAIs: [ai],
        messages: [userMessage],
        isActive: true,
        createdAt: 1000,
        sessionType: 'chat',
      },
    });

    const allKeys = await AsyncStorage.getAllKeys();
    const storedValues = await AsyncStorage.multiGet(allKeys);
    const serialized = JSON.stringify(storedValues);

    expect(serialized).not.toContain('sk-should-not-persist');
    expect(serialized).not.toContain('Bearer secret');
    expect(serialized).toContain('kept');
  });

  it('marks an existing snapshot as interrupted without creating a new session', async () => {
    await ActiveSessionPersistenceService.saveSnapshot({
      mode: 'chat',
      sessionId: 'session-interrupt',
      status: 'active',
      selectedAIs: [ai],
      messages: [userMessage],
      session: {
        id: 'session-interrupt',
        selectedAIs: [ai],
        messages: [userMessage],
        isActive: true,
        createdAt: 1000,
        sessionType: 'chat',
      },
    });

    const interrupted = await ActiveSessionPersistenceService.markInterrupted('chat', 'session-interrupt', {
      kind: 'chat_response',
      messageIds: ['msg-ai'],
      reason: 'app_backgrounded',
    });

    expect(interrupted?.status).toBe('interrupted');
    expect(interrupted?.pendingTurn?.reason).toBe('app_backgrounded');
    expect(await ActiveSessionPersistenceService.loadLatestSnapshot('chat')).toEqual(
      expect.objectContaining({ sessionId: 'session-interrupt', status: 'interrupted' })
    );
  });

  it('rejects debate-shaped payloads stored under chat snapshot keys', async () => {
    const key = 'activeSessionSnapshot_v1_chat_session-corrupt';
    await AsyncStorage.setItem(key, JSON.stringify({
      version: 1,
      mode: 'chat',
      sessionId: 'session-corrupt',
      status: 'active',
      updatedAt: 2000,
      session: {
        id: 'session-corrupt',
        selectedAIs: [ai],
        messages: [{
          id: 'host-1',
          sender: 'Debate Host',
          senderType: 'user',
          content: 'Cast your opening audience stance before the first speech.',
          timestamp: 2000,
        }],
        isActive: true,
        createdAt: 1000,
        sessionType: 'debate',
      },
      messages: [],
    }));

    expect(await ActiveSessionPersistenceService.loadSnapshot('chat', 'session-corrupt')).toBeNull();
  });

  it('skips invalid latest snapshots and returns the newest valid chat snapshot', async () => {
    await ActiveSessionPersistenceService.saveSnapshot({
      mode: 'chat',
      sessionId: 'session-valid',
      status: 'active',
      updatedAt: 1000,
      selectedAIs: [ai],
      messages: [userMessage],
      session: {
        id: 'session-valid',
        selectedAIs: [ai],
        messages: [userMessage],
        isActive: true,
        createdAt: 1000,
        sessionType: 'chat',
      },
    });

    const corruptKey = 'activeSessionSnapshot_v1_chat_session-corrupt';
    await AsyncStorage.setItem(corruptKey, JSON.stringify({
      version: 1,
      mode: 'chat',
      sessionId: 'session-corrupt',
      status: 'active',
      updatedAt: 2000,
      session: {
        id: 'session-corrupt',
        selectedAIs: [ai],
        messages: [{
          id: 'host-1',
          sender: 'Debate Host',
          senderType: 'user',
          content: 'Cast your opening audience stance before the first speech.',
          timestamp: 2000,
        }],
        isActive: true,
        createdAt: 1000,
        sessionType: 'debate',
      },
      messages: [],
    }));
    await AsyncStorage.setItem('activeSessionSnapshots_index_v1', JSON.stringify([
      {
        mode: 'chat',
        sessionId: 'session-corrupt',
        key: corruptKey,
        status: 'active',
        updatedAt: 2000,
      },
      {
        mode: 'chat',
        sessionId: 'session-valid',
        key: 'activeSessionSnapshot_v1_chat_session-valid',
        status: 'active',
        updatedAt: 1000,
      },
    ]));

    expect(await ActiveSessionPersistenceService.loadLatestSnapshot('chat')).toEqual(
      expect.objectContaining({ sessionId: 'session-valid' })
    );
  });

  it('deletes debate snapshots left behind by older builds', async () => {
    const debateKey = 'activeSessionSnapshot_v1_debate_debate_1';
    await AsyncStorage.setItem(debateKey, JSON.stringify({ version: 1, mode: 'debate', sessionId: 'debate_1' }));
    await AsyncStorage.setItem('activeSessionSnapshots_index_v1', JSON.stringify([
      { mode: 'debate', sessionId: 'debate_1', key: debateKey, status: 'interrupted', updatedAt: 2000 },
    ]));

    expect(await ActiveSessionPersistenceService.getAllSnapshots()).toEqual([]);
    expect(await AsyncStorage.getItem(debateKey)).toBeNull();
    expect(JSON.parse(await AsyncStorage.getItem('activeSessionSnapshots_index_v1') ?? 'null')).toEqual([]);
  });
});
