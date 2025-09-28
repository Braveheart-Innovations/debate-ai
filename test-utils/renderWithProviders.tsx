import React from 'react';
import type { PropsWithChildren, ReactElement } from 'react';
import { Provider } from 'react-redux';
import { render, type RenderOptions } from '@testing-library/react-native';
import type { PreloadedState } from '@reduxjs/toolkit';
import { createAppStore } from '@/store';
import type { AppStore, RootState } from '@/store';
import { ThemeProvider } from '@/theme';

interface ExtendedRenderOptions extends RenderOptions {
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

export function renderWithProviders(
  ui: ReactElement,
  { preloadedState, store = createAppStore(preloadedState), ...renderOptions }: ExtendedRenderOptions = {}
) {
  return {
    store,
    ...render(ui, {
      wrapper: (props) => <Providers {...props} store={store} />,
      ...renderOptions,
    }),
  };
}
