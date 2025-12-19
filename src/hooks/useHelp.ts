/**
 * useHelp Hook
 *
 * Convenience hook for the help system.
 * Provides methods to show help topics and manage the help WebView.
 */

import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  showSheet,
  hideSheet,
  showHelpWebView,
  hideHelpWebView,
} from '@/store/navigationSlice';
import { RootState } from '@/store';
import { HelpTopicId } from '@/config/help/types';
import { HELP_TOPICS } from '@/config/help/topics';

export function useHelp() {
  const dispatch = useDispatch();

  const { sheetData, helpWebViewUrl, activeSheet } = useSelector(
    (state: RootState) => state.navigation
  );

  const currentTopicId = sheetData?.topicId as HelpTopicId | undefined;
  const isHelpSheetOpen = activeSheet === 'help';
  const isWebViewOpen = Boolean(helpWebViewUrl);

  /**
   * Show help sheet, optionally opening to a specific topic
   */
  const showTopic = useCallback(
    (topicId?: HelpTopicId) => {
      dispatch(
        showSheet({
          sheet: 'help',
          data: topicId ? { topicId } : undefined,
        })
      );
    },
    [dispatch]
  );

  /**
   * Show help sheet without a specific topic
   */
  const showHelp = useCallback(() => {
    dispatch(showSheet({ sheet: 'help' }));
  }, [dispatch]);

  /**
   * Close the help sheet
   */
  const closeHelp = useCallback(() => {
    dispatch(hideSheet());
  }, [dispatch]);

  /**
   * Open WebView for detailed help content
   */
  const showWebView = useCallback(
    (url: string) => {
      dispatch(showHelpWebView(url));
    },
    [dispatch]
  );

  /**
   * Close the WebView
   */
  const closeWebView = useCallback(() => {
    dispatch(hideHelpWebView());
  }, [dispatch]);

  /**
   * Get a topic by its ID
   */
  const getTopic = useCallback((topicId: HelpTopicId) => {
    return HELP_TOPICS[topicId];
  }, []);

  return {
    // State
    currentTopicId,
    helpWebViewUrl,
    isHelpSheetOpen,
    isWebViewOpen,

    // Actions
    showTopic,
    showHelp,
    closeHelp,
    showWebView,
    closeWebView,

    // Utilities
    getTopic,
  };
}
