import React from 'react';
import { Provider } from 'react-redux';
import { act, cleanup, render } from '@testing-library/react-native';
import GlobalSheets from '../GlobalSheets';
import { createAppStore, showSheet } from '../../store';
import type { SheetType } from '../../store/navigationSlice';
import { ProfileSheet, SettingsContent } from '../../components/organisms';
import { DemoExplainerSheet } from '@/components/organisms/demo/DemoExplainerSheet';

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
      borderRadius: {
        xl: 16,
      },
    },
  }),
}));

jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({
    isTablet: false,
    isPhone: true,
    isLandscape: false,
    isPortrait: true,
    deviceType: 'phone',
    orientation: 'portrait',
    width: 375,
    height: 812,
    responsive: <T,>(phone: T) => phone,
    rs: (key: string) => {
      const spacing: Record<string, number> = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };
      return spacing[key] || 16;
    },
    fontSize: (key: string) => {
      const sizes: Record<string, number> = { xs: 12, sm: 14, base: 16, lg: 18, xl: 20 };
      return sizes[key] || 16;
    },
    gridColumns: (phone: number) => phone,
  }),
}));

jest.mock('../../components/organisms', () => ({
  ProfileSheet: jest.fn(() => null),
  SettingsContent: jest.fn(() => null),
  SupportSheet: jest.fn(() => null),
}));

jest.mock('@/components/organisms/demo/DemoExplainerSheet', () => ({
  DemoExplainerSheet: jest.fn(() => null),
}));

jest.mock('@/components/organisms/debug', () => ({
  DebugMenu: jest.fn(() => null),
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

  it('redirects to Subscription screen when subscription sheet is triggered', () => {
    const { store } = renderGlobalSheets('subscription');

    // The subscription sheet should immediately redirect to the Subscription screen
    expect(mockNavigate).toHaveBeenCalledWith('Subscription');

    const state = store.getState();
    expect(state.navigation.activeSheet).toBeNull();
    expect(state.navigation.sheetVisible).toBe(false);
  });
});
