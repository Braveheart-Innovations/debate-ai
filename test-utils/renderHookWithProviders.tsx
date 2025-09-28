import React from 'react';
import type { PropsWithChildren } from 'react';
import { Provider } from 'react-redux';
import { renderHook, type RenderHookOptions, type RenderHookResult } from '@testing-library/react-native';
import type { PreloadedState } from '@reduxjs/toolkit';
import { createAppStore } from '@/store';
import type { AppStore, RootState } from '@/store';
import { ThemeProvider } from '@/theme';

interface ExtendedRenderHookOptions<Props> extends RenderHookOptions<Props> {
  preloadedState?: PreloadedState<RootState>;
  store?: AppStore;
}

function Providers({ children, store }: PropsWithChildren<{ store: AppStore }>) {
  return (
    <Provider store={store}>
      <ThemeProvider>{children}</ThemeProvider>
    </Provider>
  );
}

export function renderHookWithProviders<Result, Props>(
  callback: (props: Props) => Result,
  { preloadedState, store = createAppStore(preloadedState), ...options }: ExtendedRenderHookOptions<Props> = {}
): RenderHookResult<Result, Props> & { store: AppStore } {
  const wrapper = (props: PropsWithChildren) => <Providers {...props} store={store} />;

  const result = renderHook(callback, { wrapper, ...options });

  return {
    store,
    ...result,
  };
}
