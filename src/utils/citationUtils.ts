/**
 * Citation Utilities
 * Shared utilities for processing and displaying citations across Chat, Compare, and Debate
 */

import type { Citation } from '@/types';

/**
 * Extract domain from a URL
 * @param url - The full URL to extract domain from
 * @returns The domain (hostname) without 'www.' prefix, or the original string if invalid
 */
export function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, '');
  } catch {
    // Return the original string if URL parsing fails
    return url;
  }
}

/**
 * Get favicon URL for a domain using Google's favicon service
 * @param domain - The domain to get favicon for
 * @param size - Icon size (default 32 for retina displays)
 * @returns URL to the favicon image
 */
export function getFaviconUrl(domain: string, size: number = 32): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`;
}

/**
 * Build a URL map from citations for quick index-to-URL lookup
 * @param citations - Array of citations
 * @returns Map of citation index to URL
 */
export function buildCitationUrlMap(citations: Citation[]): Map<number, string> {
  const urlMap = new Map<number, string>();
  citations.forEach((citation) => {
    urlMap.set(citation.index, citation.url);
  });
  return urlMap;
}

/**
 * Process message content to convert [n] citation references to clickable markdown links
 * @param content - The message content with [n] references
 * @param citations - Array of citations to link
 * @returns Content with [n] converted to markdown links [[n]](url)
 */
export function processMessageContentWithCitations(
  content: string,
  citations: Citation[]
): string {
  if (!citations || citations.length === 0) {
    return content;
  }

  let processed = content;
  const urlMap = buildCitationUrlMap(citations);

  // Replace [n] with markdown links, keeping the bracket format visible
  // Uses a regex to match [number] patterns and replace with [[number]](url)
  processed = processed.replace(/\[(\d+)\]/g, (match, num) => {
    const index = parseInt(num, 10);
    const url = urlMap.get(index);
    if (url) {
      return `[[${num}]](${url})`;
    }
    return match; // Keep original if no matching citation
  });

  return processed;
}

/**
 * Normalize and enrich citations with domain information
 * @param citations - Array of citations to normalize
 * @returns Citations with domain field populated
 */
export function normalizeCitations(citations: Citation[]): Citation[] {
  return citations.map((citation) => ({
    ...citation,
    domain: citation.domain || extractDomain(citation.url),
  }));
}

/**
 * Truncate text to a maximum length with ellipsis
 * @param text - Text to truncate
 * @param maxLength - Maximum length before truncation
 * @returns Truncated text with ellipsis if needed
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1)}…`;
}

/**
 * Find a citation by its URL
 * @param url - The URL to search for
 * @param citations - Array of citations to search in
 * @returns The matching citation or undefined
 */
export function findCitationByUrl(url: string, citations: Citation[]): Citation | undefined {
  return citations.find(c => c.url === url);
}
