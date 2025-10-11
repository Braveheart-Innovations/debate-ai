import React from 'react';
import { Provider } from 'react-redux';
import { act, cleanup, render } from '@testing-library/react-native';
import GlobalSheets from '../GlobalSheets';
import { createAppStore, showSheet } from '../../store';
import type { SheetType } from '../../store/navigationSlice';
import { ProfileSheet, SettingsContent } from '../../components/organisms';
import { DemoExplainerSheet } from '@/components/organisms/demo/DemoExplainerSheet';
import { SubscriptionSheet } from '@/components/organisms/subscription/SubscriptionSheet';

let mockNavigate: jest.Mock = jest.fn();

jest.mock('@react-navigation/native', () => {
  mockNavigate = jest.fn();

  return {
    useNavigation: () => ({
      navigate: mockNavigate,
    }),
  };
});

jest.mock('../../theme', () => ({
  useTheme: () => ({
    theme: {
      colors: {
        background: '#ffffff',
      },
    },
  }),
}));

jest.mock('../../components/organisms', () => ({
  ProfileSheet: jest.fn(() => null),
  SettingsContent: jest.fn(() => null),
  SupportSheet: jest.fn(() => null),
}));

jest.mock('@/components/organisms/subscription/SubscriptionSheet', () => ({
  SubscriptionSheet: jest.fn(() => null),
}));

jest.mock('@/components/organisms/demo/DemoExplainerSheet', () => ({
  DemoExplainerSheet: jest.fn(() => null),
}));

type ActiveSheet = Exclude<SheetType, null>;

type RenderResultWithStore = ReturnType<typeof render> & { store: ReturnType<typeof createAppStore> };

const renderGlobalSheets = (sheet?: ActiveSheet): RenderResultWithStore => {
  const store = createAppStore();

  if (sheet) {
    store.dispatch(showSheet({ sheet }));
  }

  const renderResult = render(
    <Provider store={store}>
      <GlobalSheets />
    </Provider>
  );

  return { ...renderResult, store };
};

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
  mockNavigate.mockClear();
});

describe('GlobalSheets', () => {
  it('returns null when no sheet is visible', () => {
    const { toJSON } = renderGlobalSheets();

    expect(toJSON()).toBeNull();
  });

  it('renders the profile sheet when the profile sheet is active', () => {
    renderGlobalSheets('profile');
    const profileSheetMock = ProfileSheet as jest.Mock;

    expect(profileSheetMock).toHaveBeenCalled();
  });

  it('clears the sheet when the profile sheet onClose handler is called', () => {
    const { store } = renderGlobalSheets('profile');
    const profileProps = (ProfileSheet as jest.Mock).mock.calls[0][0] as { onClose: () => void };

    act(() => {
      profileProps.onClose();
    });

    const state = store.getState();
    expect(state.navigation.activeSheet).toBeNull();
    expect(state.navigation.sheetVisible).toBe(false);
  });

  it('navigates to APIConfig when the settings sheet requests it', () => {
    const { store } = renderGlobalSheets('settings');
    const settingsProps = (SettingsContent as jest.Mock).mock.calls[0][0] as { onNavigateToAPIConfig: () => void };

    act(() => {
      settingsProps.onNavigateToAPIConfig();
    });

    expect(mockNavigate).toHaveBeenCalledWith('APIConfig');

    const state = store.getState();
    expect(state.navigation.activeSheet).toBeNull();
    expect(state.navigation.sheetVisible).toBe(false);
  });

  it('navigates to Subscription when the demo sheet starts a trial', () => {
    const { store } = renderGlobalSheets('demo');
    const demoProps = (DemoExplainerSheet as jest.Mock).mock.calls[0][0] as { onStartTrial: () => void };

    act(() => {
      demoProps.onStartTrial();
    });

    expect(mockNavigate).toHaveBeenCalledWith('Subscription');

    const state = store.getState();
    expect(state.navigation.activeSheet).toBeNull();
    expect(state.navigation.sheetVisible).toBe(false);
  });

  it('clears the subscription sheet when its onClose handler is called', () => {
    const { store } = renderGlobalSheets('subscription');
    const subscriptionProps = (SubscriptionSheet as jest.Mock).mock.calls[0][0] as { onClose: () => void };

    act(() => {
      subscriptionProps.onClose();
    });

    const state = store.getState();
    expect(state.navigation.activeSheet).toBeNull();
    expect(state.navigation.sheetVisible).toBe(false);
  });
});
