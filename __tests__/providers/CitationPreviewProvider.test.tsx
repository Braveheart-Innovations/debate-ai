import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { Linking } from 'react-native';
import { ThemeProvider } from '@/theme';
import { createAppStore } from '@/store';
import type { Citation } from '@/types';

// Mock react-native-webview
jest.mock('react-native-webview', () => ({
  WebView: 'WebView',
}));

// Mock react-native-safe-area-context
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

// Mock Linking.openURL
jest.spyOn(Linking, 'openURL').mockImplementation(() => Promise.resolve());

const { CitationPreviewProvider, useCitationPreview } = require('@/providers/CitationPreviewProvider');

describe('CitationPreviewProvider', () => {
  const mockCitation: Citation = {
    index: 1,
    url: 'https://www.example.com/article',
    title: 'Test Article',
    snippet: 'Test snippet',
    domain: 'example.com',
  };

  const wrapper = ({ children }: { children: React.ReactNode }) => {
    const store = createAppStore();
    return (
      <Provider store={store}>
        <ThemeProvider>
          <CitationPreviewProvider>{children}</CitationPreviewProvider>
        </ThemeProvider>
      </Provider>
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('useCitationPreview hook', () => {
    it('provides context values', () => {
      const { result } = renderHook(() => useCitationPreview(), { wrapper });

      expect(result.current.showPreview).toBeDefined();
      expect(result.current.hidePreview).toBeDefined();
      expect(result.current.openWebView).toBeDefined();
      expect(result.current.closeWebView).toBeDefined();
      expect(result.current.isPreviewVisible).toBe(false);
      expect(result.current.isWebViewVisible).toBe(false);
    });

    it('initial state shows preview and webview as not visible', () => {
      const { result } = renderHook(() => useCitationPreview(), { wrapper });

      expect(result.current.isPreviewVisible).toBe(false);
      expect(result.current.isWebViewVisible).toBe(false);
    });
  });

  describe('showPreview', () => {
    it('shows the preview when called', async () => {
      const { result } = renderHook(() => useCitationPreview(), { wrapper });

      act(() => {
        result.current.showPreview(mockCitation, { x: 100, y: 200 });
      });

      await waitFor(() => {
        expect(result.current.isPreviewVisible).toBe(true);
      });
    });

    it('accepts optional brand color', async () => {
      const { result } = renderHook(() => useCitationPreview(), { wrapper });

      act(() => {
        result.current.showPreview(mockCitation, { x: 100, y: 200 }, '#FF5722');
      });

      await waitFor(() => {
        expect(result.current.isPreviewVisible).toBe(true);
      });
    });
  });

  describe('hidePreview', () => {
    it('hides the preview when called', async () => {
      const { result } = renderHook(() => useCitationPreview(), { wrapper });

      // First show the preview
      act(() => {
        result.current.showPreview(mockCitation, { x: 100, y: 200 });
      });

      await waitFor(() => {
        expect(result.current.isPreviewVisible).toBe(true);
      });

      // Then hide it
      act(() => {
        result.current.hidePreview();
      });

      await waitFor(() => {
        expect(result.current.isPreviewVisible).toBe(false);
      });
    });
  });

  describe('openWebView', () => {
    it('opens the WebView and hides preview when called', async () => {
      const { result } = renderHook(() => useCitationPreview(), { wrapper });

      // First show the preview
      act(() => {
        result.current.showPreview(mockCitation, { x: 100, y: 200 });
      });

      await waitFor(() => {
        expect(result.current.isPreviewVisible).toBe(true);
      });

      // Open WebView
      act(() => {
        result.current.openWebView(mockCitation);
      });

      await waitFor(() => {
        expect(result.current.isWebViewVisible).toBe(true);
        expect(result.current.isPreviewVisible).toBe(false);
      });
    });

    it('accepts optional brand color', async () => {
      const { result } = renderHook(() => useCitationPreview(), { wrapper });

      act(() => {
        result.current.openWebView(mockCitation, '#007AFF');
      });

      await waitFor(() => {
        expect(result.current.isWebViewVisible).toBe(true);
      });
    });
  });

  describe('closeWebView', () => {
    it('closes the WebView when called', async () => {
      const { result } = renderHook(() => useCitationPreview(), { wrapper });

      // First open the WebView
      act(() => {
        result.current.openWebView(mockCitation);
      });

      await waitFor(() => {
        expect(result.current.isWebViewVisible).toBe(true);
      });

      // Then close it
      act(() => {
        result.current.closeWebView();
      });

      await waitFor(() => {
        expect(result.current.isWebViewVisible).toBe(false);
      });
    });
  });

  describe('error handling', () => {
    it('throws error when useCitationPreview is used outside provider', () => {
      // Wrapper without the CitationPreviewProvider
      const wrapperWithoutProvider = ({ children }: { children: React.ReactNode }) => {
        const store = createAppStore();
        return (
          <Provider store={store}>
            <ThemeProvider>{children}</ThemeProvider>
          </Provider>
        );
      };

      // This should throw an error
      expect(() => {
        renderHook(() => useCitationPreview(), { wrapper: wrapperWithoutProvider });
      }).toThrow('useCitationPreview must be used within a CitationPreviewProvider');
    });
  });
});
