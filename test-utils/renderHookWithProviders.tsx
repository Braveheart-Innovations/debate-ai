import type { PropsWithChildren } from 'react';
import { Provider } from 'react-redux';
import { renderHook, type RenderHookOptions, type RenderHookResult } from '@testing-library/react-native';
import { createAppStore } from '@/store';
import type { AppStore } from '@/store';
import { buildRootState, type RootStateOverrides } from './services/state';
import { ThemeProvider } from '@/theme';

interface ExtendedRenderHookOptions<Props> extends RenderHookOptions<Props> {
  /** Per-slice partial overrides merged into the real initial state. */
  preloadedState?: RootStateOverrides;
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
  { preloadedState, store = createAppStore(buildRootState(preloadedState)), ...options }: ExtendedRenderHookOptions<Props> = {}
): RenderHookResult<Result, Props> & { store: AppStore } {
  const wrapper = (props: PropsWithChildren) => <Providers {...props} store={store} />;

  const result = renderHook(callback, { wrapper, ...options });

  return {
    store,
    ...result,
  };
}
