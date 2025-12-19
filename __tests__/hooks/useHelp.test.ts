import { renderHook, act } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import React from 'react';
import { useHelp } from '@/hooks/useHelp';
import { createAppStore } from '@/store';
import { HELP_TOPICS } from '@/config/help/topics';

describe('useHelp', () => {
  const createWrapper = (storeOverrides?: Record<string, unknown>) => {
    const store = createAppStore({
      navigation: {
        activeSheet: null,
        sheetVisible: false,
        sheetData: undefined,
        helpWebViewUrl: null,
        ...storeOverrides,
      },
    });

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(Provider, { store }, children);

    return { wrapper, store };
  };

  describe('initial state', () => {
    it('returns correct initial values when sheet is closed', () => {
      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useHelp(), { wrapper });

      expect(result.current.isHelpSheetOpen).toBe(false);
      expect(result.current.isWebViewOpen).toBe(false);
      expect(result.current.currentTopicId).toBeUndefined();
      expect(result.current.helpWebViewUrl).toBeNull();
    });

    it('returns correct values when help sheet is open', () => {
      const { wrapper } = createWrapper({
        activeSheet: 'help',
        sheetVisible: true,
        sheetData: { topicId: 'debate-arena' },
      });
      const { result } = renderHook(() => useHelp(), { wrapper });

      expect(result.current.isHelpSheetOpen).toBe(true);
      expect(result.current.currentTopicId).toBe('debate-arena');
    });

    it('returns correct values when WebView is open', () => {
      const { wrapper } = createWrapper({
        helpWebViewUrl: 'https://example.com/help',
      });
      const { result } = renderHook(() => useHelp(), { wrapper });

      expect(result.current.isWebViewOpen).toBe(true);
      expect(result.current.helpWebViewUrl).toBe('https://example.com/help');
    });
  });

  describe('showTopic', () => {
    it('opens help sheet with specific topic', () => {
      const { wrapper, store } = createWrapper();
      const { result } = renderHook(() => useHelp(), { wrapper });

      act(() => {
        result.current.showTopic('debate-arena');
      });

      const state = store.getState().navigation;
      expect(state.activeSheet).toBe('help');
      expect(state.sheetData).toEqual({ topicId: 'debate-arena' });
    });

    it('opens help sheet without topic when called with undefined', () => {
      const { wrapper, store } = createWrapper();
      const { result } = renderHook(() => useHelp(), { wrapper });

      act(() => {
        result.current.showTopic(undefined);
      });

      const state = store.getState().navigation;
      expect(state.activeSheet).toBe('help');
      expect(state.sheetData).toBeUndefined();
    });
  });

  describe('showHelp', () => {
    it('opens help sheet without specific topic', () => {
      const { wrapper, store } = createWrapper();
      const { result } = renderHook(() => useHelp(), { wrapper });

      act(() => {
        result.current.showHelp();
      });

      const state = store.getState().navigation;
      expect(state.activeSheet).toBe('help');
    });
  });

  describe('closeHelp', () => {
    it('closes the help sheet', () => {
      const { wrapper, store } = createWrapper({
        activeSheet: 'help',
        sheetVisible: true,
      });
      const { result } = renderHook(() => useHelp(), { wrapper });

      act(() => {
        result.current.closeHelp();
      });

      const state = store.getState().navigation;
      // hideSheet only sets sheetVisible to false, keeps activeSheet for animation
      expect(state.sheetVisible).toBe(false);
    });
  });

  describe('showWebView', () => {
    it('opens WebView with specified URL', () => {
      const { wrapper, store } = createWrapper();
      const { result } = renderHook(() => useHelp(), { wrapper });

      act(() => {
        result.current.showWebView('https://example.com/guide');
      });

      const state = store.getState().navigation;
      expect(state.helpWebViewUrl).toBe('https://example.com/guide');
    });
  });

  describe('closeWebView', () => {
    it('closes the WebView', () => {
      const { wrapper, store } = createWrapper({
        helpWebViewUrl: 'https://example.com/help',
      });
      const { result } = renderHook(() => useHelp(), { wrapper });

      act(() => {
        result.current.closeWebView();
      });

      const state = store.getState().navigation;
      expect(state.helpWebViewUrl).toBeFalsy();
    });
  });

  describe('getTopic', () => {
    it('returns topic for valid ID', () => {
      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useHelp(), { wrapper });

      const topic = result.current.getTopic('debate-arena');
      expect(topic).toEqual(HELP_TOPICS['debate-arena']);
    });

    it('returns undefined for invalid ID', () => {
      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useHelp(), { wrapper });

      const topic = result.current.getTopic('non-existent' as any);
      expect(topic).toBeUndefined();
    });
  });
});
