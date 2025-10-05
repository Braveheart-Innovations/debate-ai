import { renderHook } from '@testing-library/react-native';
import { useSessionStats } from '@/hooks/history/useSessionStats';
import { createMockSession, createMockAIConfig, createMockMessage } from '../../test-utils/hooks/historyFixtures';

describe('useSessionStats', () => {
  it('returns zeroed stats when no sessions provided', () => {
    const { result } = renderHook(() => useSessionStats([]));

    expect(result.current.stats.totalSessions).toBe(0);
    expect(result.current.activityInsights.hasActivity).toBe(false);
    expect(result.current.formattedStats.sessionsText).toBe('0 conversations');
  });

  it('calculates usage metrics, insights, and patterns', () => {
    const now = 1_700_000_000_000;
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(now);

    const recentSession = createMockSession({
      id: 'recent-1',
      createdAt: now - 2 * 24 * 60 * 60 * 1000,
      messages: [
        createMockMessage({ id: 'a', createdAt: now - 2 * 60 * 60 * 1000 }),
        createMockMessage({ id: 'b', createdAt: now - 90 * 60 * 1000 }),
      ],
      selectedAIs: [createMockAIConfig({ id: 'claude', name: 'Claude', provider: 'claude' })],
    });

    const multiAISession = createMockSession({
      id: 'recent-2',
      createdAt: now - 5 * 24 * 60 * 60 * 1000,
      messages: [
        createMockMessage({ id: 'c', createdAt: now - 5 * 60 * 60 * 1000 }),
        createMockMessage({ id: 'd', createdAt: now - 4 * 60 * 60 * 1000 }),
        createMockMessage({ id: 'e', createdAt: now - 3 * 60 * 60 * 1000 }),
      ],
      selectedAIs: [
        createMockAIConfig({ id: 'claude', name: 'Claude', provider: 'claude' }),
        createMockAIConfig({ id: 'gpt4', name: 'GPT-4', provider: 'openai' }),
      ],
    });

    const olderSession = createMockSession({
      id: 'older',
      createdAt: now - 10 * 24 * 60 * 60 * 1000,
      messages: [createMockMessage({ id: 'f', createdAt: now - 9 * 24 * 60 * 60 * 1000 })],
      selectedAIs: [createMockAIConfig({ id: 'gemini', name: 'Gemini', provider: 'google' })],
    });

    const { result } = renderHook(() => useSessionStats([recentSession, multiAISession, olderSession]));

    expect(result.current.stats.totalSessions).toBe(3);
    expect(result.current.stats.totalMessages).toBe(6);
    expect(result.current.stats.usageByProvider).toMatchObject({ claude: 2, openai: 1, google: 1 });
    expect(result.current.activityInsights.trend).toBe('up');
    expect(result.current.activityInsights.hasActivity).toBe(true);
    expect(result.current.usagePatterns.mostUsedAI).toBe('Claude');
    expect(result.current.usagePatterns.multiAIPreference).toBeGreaterThan(0);

    expect(result.current.formattedStats.sessionsText).toBe('3 conversations');
    expect(result.current.formattedStats.averageText).toContain('avg');

    result.current.refresh();
    nowSpy.mockRestore();
  });
});
