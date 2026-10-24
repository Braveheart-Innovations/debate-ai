import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  migrateLegacyMaxTokensDefault,
  stripLegacyMaxTokens,
} from '@/services/lifecycle/LegacyMaxTokensMigration';

const readJson = async (key: string): Promise<unknown> => {
  const raw = await AsyncStorage.getItem(key);
  return raw === null ? null : JSON.parse(raw);
};

describe('LegacyMaxTokensMigration', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('removes only the old 2048 default, wherever an AI config keeps its parameters', () => {
    const stored = {
      selectedAIs: [
        { id: 'a', parameters: { temperature: 0.5, maxTokens: 2048 } },
        { id: 'b', parameters: { temperature: 0.5, maxTokens: 3000 } },
      ],
      leftAI: { parameters: { maxTokens: 2048 } },
    };

    expect(stripLegacyMaxTokens(stored)).toBe(true);
    expect(stored).toEqual({
      selectedAIs: [
        { id: 'a', parameters: { temperature: 0.5 } },
        { id: 'b', parameters: { temperature: 0.5, maxTokens: 3000 } },
      ],
      leftAI: { parameters: {} },
    });
    expect(stripLegacyMaxTokens(stored)).toBe(false);
  });

  it('rewrites the composer selection, saved chats and snapshots once, then leaves later choices alone', async () => {
    await AsyncStorage.multiSet([
      ['@ai_selection_v1', JSON.stringify({ chat: [{ providerId: 'kimi', parameters: { maxTokens: 2048 } }], compare: [] })],
      ['chatSession_s1', JSON.stringify({ id: 's1', selectedAIs: [{ parameters: { temperature: 1, maxTokens: 2048 } }] })],
      ['activeSessionSnapshot_v1_comparison_s2', JSON.stringify({ rightAI: { parameters: { maxTokens: 2048 } } })],
      ['unrelatedKey', JSON.stringify({ parameters: { maxTokens: 2048 } })],
    ]);

    await expect(migrateLegacyMaxTokensDefault()).resolves.toBe(3);

    expect(await readJson('@ai_selection_v1')).toEqual({ chat: [{ providerId: 'kimi', parameters: {} }], compare: [] });
    expect(await readJson('chatSession_s1')).toEqual({ id: 's1', selectedAIs: [{ parameters: { temperature: 1 } }] });
    expect(await readJson('activeSessionSnapshot_v1_comparison_s2')).toEqual({ rightAI: { parameters: {} } });
    expect(await readJson('unrelatedKey')).toEqual({ parameters: { maxTokens: 2048 } });

    // A 2048 chosen after the migration is the user's, so it stays.
    await AsyncStorage.setItem('chatSession_s3', JSON.stringify({ selectedAIs: [{ parameters: { maxTokens: 2048 } }] }));
    await expect(migrateLegacyMaxTokensDefault()).resolves.toBe(0);
    expect(await readJson('chatSession_s3')).toEqual({ selectedAIs: [{ parameters: { maxTokens: 2048 } }] });
  });
});
