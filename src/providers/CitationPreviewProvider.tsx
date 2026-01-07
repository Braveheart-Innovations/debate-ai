/**
 * CitationPreviewProvider
 * Context provider for managing citation preview tooltip and WebView modal state.
 * Wrap your app with this provider to enable citation preview anywhere in the app.
 */

import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { CitationPreviewTooltip } from '@/components/molecules/citations';
import { CitationWebViewModal } from '@/components/organisms/citations';
import type { Citation } from '@/types';

export interface CitationPreviewContextValue {
  /** Show the tooltip preview for a citation at the given position */
  showPreview: (citation: Citation, position: { x: number; y: number }, brandColor?: string) => void;
  /** Hide the tooltip preview */
  hidePreview: () => void;
  /** Open the WebView modal for a citation */
  openWebView: (citation: Citation, brandColor?: string) => void;
  /** Close the WebView modal */
  closeWebView: () => void;
  /** Whether the tooltip is currently visible */
  isPreviewVisible: boolean;
  /** Whether the WebView modal is currently visible */
  isWebViewVisible: boolean;
}

const CitationPreviewContext = createContext<CitationPreviewContextValue | undefined>(undefined);

export interface CitationPreviewProviderProps {
  children: React.ReactNode;
}

export const CitationPreviewProvider: React.FC<CitationPreviewProviderProps> = ({ children }) => {
  // Tooltip state
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [tooltipCitation, setTooltipCitation] = useState<Citation | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const [tooltipBrandColor, setTooltipBrandColor] = useState<string | undefined>(undefined);

  // WebView state
  const [webViewVisible, setWebViewVisible] = useState(false);
  const [webViewCitation, setWebViewCitation] = useState<Citation | null>(null);
  const [webViewBrandColor, setWebViewBrandColor] = useState<string | undefined>(undefined);

  const showPreview = useCallback((citation: Citation, position: { x: number; y: number }, brandColor?: string) => {
    setTooltipCitation(citation);
    setTooltipPosition(position);
    setTooltipBrandColor(brandColor);
    setTooltipVisible(true);
  }, []);

  const hidePreview = useCallback(() => {
    setTooltipVisible(false);
    // Delay clearing citation to allow exit animation
    setTimeout(() => {
      setTooltipCitation(null);
    }, 150);
  }, []);

  const openWebView = useCallback((citation: Citation, brandColor?: string) => {
    // Hide tooltip first
    setTooltipVisible(false);
    setTooltipCitation(null);

    // Then show WebView
    setWebViewCitation(citation);
    setWebViewBrandColor(brandColor);
    setWebViewVisible(true);
  }, []);

  const closeWebView = useCallback(() => {
    setWebViewVisible(false);
    // Delay clearing citation to allow exit animation
    setTimeout(() => {
      setWebViewCitation(null);
    }, 300);
  }, []);

  const handleTooltipOpenSource = useCallback(() => {
    if (tooltipCitation) {
      openWebView(tooltipCitation, tooltipBrandColor);
    }
  }, [tooltipCitation, tooltipBrandColor, openWebView]);

  const value = useMemo<CitationPreviewContextValue>(() => ({
    showPreview,
    hidePreview,
    openWebView,
    closeWebView,
    isPreviewVisible: tooltipVisible,
    isWebViewVisible: webViewVisible,
  }), [showPreview, hidePreview, openWebView, closeWebView, tooltipVisible, webViewVisible]);

  return (
    <CitationPreviewContext.Provider value={value}>
      {children}

      {/* Tooltip - rendered at top level to appear above everything */}
      <CitationPreviewTooltip
        citation={tooltipCitation}
        visible={tooltipVisible}
        position={tooltipPosition}
        onDismiss={hidePreview}
        onOpenSource={handleTooltipOpenSource}
        brandColor={tooltipBrandColor}
      />

      {/* WebView Modal */}
      <CitationWebViewModal
        visible={webViewVisible}
        citation={webViewCitation}
        onClose={closeWebView}
        brandColor={webViewBrandColor}
      />
    </CitationPreviewContext.Provider>
  );
};

/**
 * Hook to access the citation preview context
 * Must be used within a CitationPreviewProvider
 */
export const useCitationPreview = (): CitationPreviewContextValue => {
  const context = useContext(CitationPreviewContext);
  if (!context) {
    throw new Error('useCitationPreview must be used within a CitationPreviewProvider');
  }
  return context;
};

export default CitationPreviewProvider;
