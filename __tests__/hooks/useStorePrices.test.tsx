import { act, waitFor, renderHook } from '@testing-library/react-native';
import {
  initConnection,
  getSubscriptions,
  getProducts,
} from 'react-native-iap';
import { ErrorService } from '@/services/errors/ErrorService';
import { useStorePrices, __resetCacheForTesting } from '@/hooks/useStorePrices';

jest.mock('react-native-iap', () => ({
  initConnection: jest.fn(),
  getSubscriptions: jest.fn(),
  getProducts: jest.fn(),
}));

jest.mock('@/services/errors/ErrorService', () => ({
  ErrorService: {
    handleSilent: jest.fn(),
  },
}));

jest.mock('@/services/iap/products', () => ({
  SUBSCRIPTION_PRODUCTS: {
    monthly: 'com.test.monthly',
    annual: 'com.test.annual',
    lifetime: 'com.test.lifetime',
  },
}));

const initConnectionMock = initConnection as jest.MockedFunction<typeof initConnection>;
const getSubscriptionsMock = getSubscriptions as jest.MockedFunction<typeof getSubscriptions>;
const getProductsMock = getProducts as jest.MockedFunction<typeof getProducts>;

describe('useStorePrices', () => {
  const mockIOSSubscriptions = [
    {
      productId: 'com.test.monthly',
      localizedPrice: '$5.99',
      price: '5.99',
      currency: 'USD',
    },
    {
      productId: 'com.test.annual',
      localizedPrice: '$49.99',
      price: '49.99',
      currency: 'USD',
    },
  ];

  const mockLifetimeProduct = {
    productId: 'com.test.lifetime',
    localizedPrice: '$129.99',
    price: '129.99',
    currency: 'USD',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    __resetCacheForTesting();
  });

  it('returns fallback prices while loading', async () => {
    initConnectionMock.mockImplementation(() => new Promise(() => {})); // Never resolves

    const { result } = renderHook(() => useStorePrices());

    expect(result.current.loading).toBe(true);
    expect(result.current.monthly.localizedPrice).toBe('$5.99');
    expect(result.current.annual.localizedPrice).toBe('$49.99');
    expect(result.current.lifetime.localizedPrice).toBe('$129.99');
  });

  it('fetches and returns store prices on mount', async () => {
    initConnectionMock.mockResolvedValue();
    getSubscriptionsMock.mockResolvedValue(mockIOSSubscriptions as never);
    getProductsMock.mockResolvedValue([mockLifetimeProduct] as never);

    const { result } = renderHook(() => useStorePrices());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(initConnectionMock).toHaveBeenCalledTimes(1);
    expect(getSubscriptionsMock).toHaveBeenCalledTimes(1);
    expect(getProductsMock).toHaveBeenCalledTimes(1);
    expect(result.current.monthly.localizedPrice).toBe('$5.99');
    expect(result.current.annual.localizedPrice).toBe('$49.99');
    expect(result.current.lifetime.localizedPrice).toBe('$129.99');
    expect(result.current.error).toBeNull();
  });

  it('uses cached prices within 24-hour TTL', async () => {
    initConnectionMock.mockResolvedValue();
    getSubscriptionsMock.mockResolvedValue(mockIOSSubscriptions as never);
    getProductsMock.mockResolvedValue([mockLifetimeProduct] as never);

    // First render - should fetch
    const { result: result1, unmount } = renderHook(() => useStorePrices());
    await waitFor(() => expect(result1.current.loading).toBe(false));
    expect(initConnectionMock).toHaveBeenCalledTimes(1);
    unmount();

    // Second render - should use cache
    const { result: result2 } = renderHook(() => useStorePrices());

    // Should not trigger another fetch
    expect(initConnectionMock).toHaveBeenCalledTimes(1);
    expect(result2.current.loading).toBe(false);
    expect(result2.current.monthly.localizedPrice).toBe('$5.99');
  });

  it('handles fetch errors and returns fallback prices', async () => {
    const testError = new Error('IAP connection failed');
    initConnectionMock.mockRejectedValue(testError);

    const { result } = renderHook(() => useStorePrices());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toEqual(testError);
    expect(ErrorService.handleSilent).toHaveBeenCalledWith(
      testError,
      { action: 'fetch_store_prices' }
    );
    // Should still return fallback prices
    expect(result.current.monthly.localizedPrice).toBe('$5.99');
  });

  it('prevents concurrent fetch requests', async () => {
    let resolveConnection: () => void;
    initConnectionMock.mockImplementation(
      () => new Promise((resolve) => { resolveConnection = resolve; })
    );
    getSubscriptionsMock.mockResolvedValue(mockIOSSubscriptions as never);
    getProductsMock.mockResolvedValue([mockLifetimeProduct] as never);

    // Render multiple hooks simultaneously (simulating multiple components)
    const { result: result1 } = renderHook(() => useStorePrices());
    const { result: result2 } = renderHook(() => useStorePrices());

    // Both should be loading
    expect(result1.current.loading).toBe(true);
    expect(result2.current.loading).toBe(true);

    // Resolve the connection
    await act(async () => {
      resolveConnection!();
      await Promise.resolve();
    });

    await waitFor(() => expect(result1.current.loading).toBe(false));
    await waitFor(() => expect(result2.current.loading).toBe(false));

    // Should only have called initConnection once (not twice)
    expect(initConnectionMock).toHaveBeenCalledTimes(1);
  });

  it('refresh() triggers a new fetch', async () => {
    initConnectionMock.mockResolvedValue();
    getSubscriptionsMock.mockResolvedValue(mockIOSSubscriptions as never);
    getProductsMock.mockResolvedValue([mockLifetimeProduct] as never);

    const { result } = renderHook(() => useStorePrices());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(initConnectionMock).toHaveBeenCalledTimes(1);

    // Update mock to return different prices
    getSubscriptionsMock.mockResolvedValue([
      { ...mockIOSSubscriptions[0], localizedPrice: '$6.99' },
      mockIOSSubscriptions[1],
    ] as never);

    // Call refresh
    await act(async () => {
      await result.current.refresh();
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(initConnectionMock).toHaveBeenCalledTimes(2);
    expect(result.current.monthly.localizedPrice).toBe('$6.99');
  });
});
