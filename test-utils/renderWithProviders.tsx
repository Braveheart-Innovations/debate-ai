import type { PropsWithChildren, ReactElement } from 'react';
import { Provider } from 'react-redux';
import { render, type RenderOptions } from '@testing-library/react-native';
import { createAppStore } from '@/store';
import type { AppStore } from '@/store';
import { buildRootState, type RootStateOverrides } from './services/state';
import { ThemeProvider } from '@/theme';
import { CitationPreviewProvider } from '@/providers/CitationPreviewProvider';

interface ExtendedRenderOptions extends RenderOptions {
  /** Per-slice partial overrides merged into the real initial state. */
  preloadedState?: RootStateOverrides;
  store?: AppStore;
}

function Providers({ children, store }: PropsWithChildren<{ store: AppStore }>) {
  return (
    <Provider store={store}>
      <ThemeProvider>
        <CitationPreviewProvider>{children}</CitationPreviewProvider>
      </ThemeProvider>
    </Provider>
  );
}

export function renderWithProviders(
  ui: ReactElement,
  { preloadedState, store = createAppStore(buildRootState(preloadedState)), ...renderOptions }: ExtendedRenderOptions = {}
) {
  return {
    store,
    ...render(ui, {
      wrapper: (props) => <Providers {...props} store={store} />,
      ...renderOptions,
    }),
  };
}
