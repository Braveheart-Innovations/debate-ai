import { renderHook } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import pricesReducer, { setPrices } from '@/store/pricesSlice';
import { useStorePrices } from '@/hooks/useStorePrices';
import React from 'react';

const createTestStore = (preloadedState = {}) =>
  configureStore({
    reducer: { prices: pricesReducer },
    preloadedState,
  });

const wrapper = (store: ReturnType<typeof createTestStore>) =>
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <Provider store={store}>{children}</Provider>;
  };

describe('useStorePrices', () => {
  it('returns fallback prices when not loaded', () => {
    const store = createTestStore();
    const { result } = renderHook(() => useStorePrices(), {
      wrapper: wrapper(store),
    });

    expect(result.current.loading).toBe(true);
    expect(result.current.monthly.localizedPrice).toBe('$5.99');
    expect(result.current.annual.localizedPrice).toBe('$49.99');
    expect(result.current.lifetime.localizedPrice).toBe('$129.99');
  });

  it('returns store prices after dispatch', () => {
    const store = createTestStore();
    store.dispatch(setPrices({
      monthly: { localizedPrice: '€4.99', price: '4.99', currency: 'EUR' },
      annual: { localizedPrice: '€39.99', price: '39.99', currency: 'EUR' },
      lifetime: { localizedPrice: '€99.99', price: '99.99', currency: 'EUR' },
    }));

    const { result } = renderHook(() => useStorePrices(), {
      wrapper: wrapper(store),
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.monthly.localizedPrice).toBe('€4.99');
    expect(result.current.annual.localizedPrice).toBe('€39.99');
    expect(result.current.lifetime.localizedPrice).toBe('€99.99');
  });
});
