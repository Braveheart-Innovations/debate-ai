/**
 * The Salesforce docs pages a session read, from its stored docs-lookup
 * results (the Reviewer, the verifier and capture see messages, not the
 * sandbox's provenance files). Keyed like the publish check keys sources.
 */
import type { Message } from '../../contract/types';
import { parseDocsLookupResult, type SalesforceDocQuotedPage } from './executeSalesforceDocsLookupTool';
import { salesforcePageKey } from './salesforceGroundingCheck';

/** Docs pages read by the lookups in these messages, by page key; a page's passages accumulate across lookups. */
export function docsPagesRead(messages: Message[]): Map<string, SalesforceDocQuotedPage> {
  const pages = new Map<string, SalesforceDocQuotedPage>();
  for (const message of messages) {
    if (message.senderType !== 'tool' || message.metadata?.toolName !== 'salesforce_docs_lookup' || message.metadata?.success === false) continue;
    for (const page of parseDocsLookupResult(message.content || '')) {
      const key = salesforcePageKey(page.url);
      if (!key) continue;
      const existing = pages.get(key);
      if (!existing) {
        pages.set(key, { ...page, passages: [...page.passages] });
        continue;
      }
      existing.releaseLabel = existing.releaseLabel || page.releaseLabel;
      for (const passage of page.passages) {
        if (!existing.passages.includes(passage)) existing.passages.push(passage);
      }
    }
  }
  return pages;
}
