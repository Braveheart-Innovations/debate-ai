import { renderHook } from '@testing-library/react-native';
import { useSubscriptionLimits } from '@/hooks/history/useSubscriptionLimits';

const mockUseSelector = jest.fn();

jest.mock('react-redux', () => ({
  useSelector: (selector: (state: unknown) => unknown) => mockUseSelector(selector),
}));

describe('useSubscriptionLimits', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('computes limits and warnings for free users', () => {
    mockUseSelector.mockImplementation((selector: (state: unknown) => unknown) =>
      selector({ user: { currentUser: { subscription: 'free' } } })
    );

    const { result } = renderHook(() => useSubscriptionLimits(2));

    expect(result.current.maxSessions).toBe(3);
    expect(result.current.canCreateMore).toBe(true);
    expect(result.current.usagePercentage).toBe(67);
    expect(result.current.limitWarning).toBe('Only 1 conversation slot remaining. Consider upgrading soon.');
    expect(result.current.statusInfo.color).toBe('info');
    expect(result.current.nextTierBenefits?.tierName).toBe('Pro');
    expect(result.current.shouldShowUpgradeNudge).toBe(false);
  });

  it('flags limit reached and prompts upgrade when quota exhausted', () => {
    mockUseSelector.mockImplementation((selector: (state: unknown) => unknown) =>
      selector({ user: { currentUser: { subscription: 'free' } } })
    );

    const { result } = renderHook(() => useSubscriptionLimits(3));

    expect(result.current.canCreateMore).toBe(false);
    expect(result.current.limitWarning).toContain("You've reached your conversation limit");
    expect(result.current.upgradePrompt).toContain('Upgrade to Pro');
    expect(result.current.shouldShowUpgradeNudge).toBe(true);
    expect(result.current.statusInfo.color).toBe('error');
  });

  it('returns unlimited capabilities for business subscription', () => {
    mockUseSelector.mockImplementation((selector: (state: unknown) => unknown) =>
      selector({ user: { currentUser: { subscription: 'business' } } })
    );

    const { result } = renderHook(() => useSubscriptionLimits(42));

    expect(result.current.maxSessions).toBe(Infinity);
    expect(result.current.isLimited).toBe(false);
    expect(result.current.statusInfo.text).toBe('Unlimited conversations');
    expect(result.current.limitWarning).toBeUndefined();
    expect(result.current.nextTierBenefits).toBeNull();
  });
});
