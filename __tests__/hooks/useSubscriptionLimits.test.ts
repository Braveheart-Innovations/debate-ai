import { useSubscriptionLimits } from '@/hooks/history/useSubscriptionLimits';
import type { SubscriptionTier } from '@/types';
import { createMockUser } from '../../test-utils/fixtures';
import { requireDefined } from '../../test-utils/queries';
import { renderHookWithProviders } from '../../test-utils/renderHookWithProviders';

const renderLimits = (subscription: SubscriptionTier, sessionCount: number) =>
  renderHookWithProviders(() => useSubscriptionLimits(sessionCount), {
    preloadedState: { user: { currentUser: createMockUser({ subscription }) } },
  });

describe('useSubscriptionLimits', () => {

  it('computes limits and warnings for free users', () => {
    const { result } = renderLimits('free', 2);

    expect(result.current.maxSessions).toBe(3);
    expect(result.current.canCreateMore).toBe(true);
    expect(result.current.usagePercentage).toBe(67);
    expect(result.current.limitWarning).toBe('Only 1 conversation slot remaining. Consider upgrading soon.');
    expect(requireDefined(result.current.statusInfo, 'statusInfo').color).toBe('info');
    expect(result.current.nextTierBenefits?.tierName).toBe('Pro');
    expect(result.current.shouldShowUpgradeNudge).toBe(false);
  });

  it('flags limit reached and prompts upgrade when quota exhausted', () => {
    const { result } = renderLimits('free', 3);

    expect(result.current.canCreateMore).toBe(false);
    expect(result.current.limitWarning).toContain("You've reached your conversation limit");
    expect(result.current.upgradePrompt).toContain('Upgrade to Pro');
    expect(result.current.shouldShowUpgradeNudge).toBe(true);
    expect(requireDefined(result.current.statusInfo, 'statusInfo').color).toBe('error');
  });

  it('returns unlimited capabilities for business subscription', () => {
    const { result } = renderLimits('business', 42);

    expect(result.current.maxSessions).toBe(Infinity);
    expect(result.current.isLimited).toBe(false);
    expect(requireDefined(result.current.statusInfo, 'statusInfo').text).toBe('Unlimited conversations');
    expect(result.current.limitWarning).toBeUndefined();
    expect(result.current.nextTierBenefits).toBeNull();
  });
});
