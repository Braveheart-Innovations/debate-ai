import { renderHook } from '@testing-library/react-native';
import { useStatsAnimations } from '@/hooks/stats/useStatsAnimations';

describe('useStatsAnimations', () => {
  it('provides consistent animation configurations and utilities', () => {
    const { result } = renderHook(() => useStatsAnimations());

    const {
      getLeaderboardAnimation,
      getHistoryAnimation,
      getTopicAnimation,
      getBatchAnimations,
      getBatchDuration,
      shouldUseAnimations,
      getSimpleAnimation,
      getStaggerDelay,
      baseConfig,
    } = result.current;

    const leaderboardAnim = getLeaderboardAnimation(2);
    expect(leaderboardAnim.delay).toBe(200);
    expect(leaderboardAnim.duration).toBe(baseConfig.baseDuration);
    expect(leaderboardAnim.entering).toBeDefined();

    const historyAnim = getHistoryAnimation(3);
    expect(historyAnim.delay).toBe(150);

    const topicAnim = getTopicAnimation(4);
    expect(topicAnim.delay).toBe(120);
    expect(topicAnim.duration).toBeCloseTo(baseConfig.baseDuration * 0.8);

    const batchHistory = getBatchAnimations(3, 'history');
    expect(batchHistory.map(animation => animation.delay)).toEqual([0, 50, 100]);

    const batchDuration = getBatchDuration(3, 'history');
    expect(batchDuration).toBe(batchHistory[2].delay + batchHistory[2].duration);

    expect(shouldUseAnimations(5)).toBe(true);
    expect(shouldUseAnimations(25)).toBe(false);

    const simple = getSimpleAnimation();
    expect(simple.delay).toBe(0);
    expect(simple.duration).toBeLessThan(baseConfig.baseDuration);

    expect(getStaggerDelay(4)).toBe(400);
    expect(getStaggerDelay(10, 30)).toBeLessThanOrEqual(baseConfig.maxDelay);
  });
});
