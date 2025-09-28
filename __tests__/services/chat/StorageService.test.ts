import AsyncStorage from '@react-native-async-storage/async-storage';
import { StorageService } from '@/services/chat/StorageService';
import type { ChatSession, Message } from '@/types';

describe('StorageService', () => {
  const baseSession = (id: string, createdAt: number): ChatSession => ({
    id,
    selectedAIs: [],
    messages: [],
    isActive: false,
    createdAt,
    sessionType: 'chat',
    lastMessageAt: createdAt,
  });

  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('saves sessions and updates index metadata', async () => {
    const session: ChatSession = {
      ...baseSession('session-1', 1000),
      messages: [
        { id: 'msg-1', sender: 'You', senderType: 'user', content: 'Hello', timestamp: 1000 } as Message,
      ],
    };

    await StorageService.saveSession(session);
    const loaded = await StorageService.loadSession('session-1');

    expect(loaded?.id).toBe('session-1');
    const indexRaw = await AsyncStorage.getItem('sessionIndex');
    expect(indexRaw).not.toBeNull();
    const index = JSON.parse(indexRaw || '{}');
    expect(index.sessions[0].id).toBe('session-1');
    expect(index.sessions[0].messageCount).toBe(1);
  });

  it('enforces storage limits for free tier users by deleting oldest session', async () => {
    const sessions = [
      baseSession('s1', 1),
      baseSession('s2', 2),
      baseSession('s3', 3),
    ];

    for (const session of sessions) {
      await StorageService.saveSession(session);
    }

    const result = await StorageService.enforceStorageLimits('chat', false, true);
    expect(result.deleted).toBe(true);
    expect(result.deletedId).toBe('s1');

    const remaining = await StorageService.getSessionsByType('chat');
    const ids = remaining.map(s => s.id);
    expect(ids).toEqual(expect.arrayContaining(['s2', 's3']));
    expect(ids).toHaveLength(2);
  });
});
