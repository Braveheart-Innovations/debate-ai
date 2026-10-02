import { act } from '@testing-library/react-native';
import { useHelp } from '@/hooks/useHelp';
import type { RootState } from '@/store';
import { HELP_TOPICS } from '@/config/help/topics';
import { renderHookWithProviders } from '../../test-utils/renderHookWithProviders';
import { requireDefined } from '../../test-utils/queries';

describe('useHelp', () => {
  const renderUseHelp = (navigation: Partial<RootState['navigation']> = {}) =>
    renderHookWithProviders(() => useHelp(), { preloadedState: { navigation } });

  describe('initial state', () => {
    it('returns correct initial values when sheet is closed', () => {
      const { result } = renderUseHelp();

      expect(result.current.isHelpSheetOpen).toBe(false);
      expect(result.current.isWebViewOpen).toBe(false);
      expect(result.current.currentTopicId).toBeUndefined();
      expect(result.current.helpWebViewUrl).toBeUndefined();
    });

    it('returns correct values when help sheet is open', () => {
      const { result } = renderUseHelp({
        activeSheet: 'help',
        sheetVisible: true,
        sheetData: { topicId: 'debate-arena' },
      });

      expect(result.current.isHelpSheetOpen).toBe(true);
      expect(result.current.currentTopicId).toBe('debate-arena');
    });

    it('returns correct values when WebView is open', () => {
      const { result } = renderUseHelp({
        helpWebViewUrl: 'https://example.com/help',
      });

      expect(result.current.isWebViewOpen).toBe(true);
      expect(result.current.helpWebViewUrl).toBe('https://example.com/help');
    });
  });

  describe('showTopic', () => {
    it('opens help sheet with specific topic', () => {
      const { result, store } = renderUseHelp();

      act(() => {
        result.current.showTopic('debate-arena');
      });

      const state = store.getState().navigation;
      expect(state.activeSheet).toBe('help');
      expect(state.sheetData).toEqual({ topicId: 'debate-arena' });
    });

    it('opens help sheet without topic when called with undefined', () => {
      const { result, store } = renderUseHelp();

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
      const { result, store } = renderUseHelp();

      act(() => {
        result.current.showHelp();
      });

      const state = store.getState().navigation;
      expect(state.activeSheet).toBe('help');
    });
  });

  describe('closeHelp', () => {
    it('closes the help sheet', () => {
      const { result, store } = renderUseHelp({
        activeSheet: 'help',
        sheetVisible: true,
      });

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
      const { result, store } = renderUseHelp();

      act(() => {
        result.current.showWebView('https://example.com/guide');
      });

      const state = store.getState().navigation;
      expect(state.helpWebViewUrl).toBe('https://example.com/guide');
    });
  });

  describe('closeWebView', () => {
    it('closes the WebView', () => {
      const { result, store } = renderUseHelp({
        helpWebViewUrl: 'https://example.com/help',
      });

      act(() => {
        result.current.closeWebView();
      });

      const state = store.getState().navigation;
      expect(state.helpWebViewUrl).toBeFalsy();
    });
  });

  describe('getTopic', () => {
    it('returns topic for valid ID', () => {
      const { result } = renderUseHelp();

      const topic = result.current.getTopic('debate-arena');
      expect(topic).toEqual(HELP_TOPICS['debate-arena']);
    });

    it('returns undefined for invalid ID', () => {
      // An unknown id reaches getTopic via stale sheet data (sheetData is untyped).
      const { result } = renderUseHelp({ sheetData: { topicId: 'non-existent' } });

      const topicId = requireDefined(result.current.currentTopicId, 'currentTopicId');
      const topic = result.current.getTopic(topicId);
      expect(topic).toBeUndefined();
    });
  });
});
