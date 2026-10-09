/** Moved from symposium-ai-web src/services/salesforce/SalesforceDocsLookupService.ts (Phase 3 Step 5), unchanged. */
import type { SalesforceComponentType } from './SalesforceMetadataService';

export interface SalesforceDocumentationTopic {
  id: string;
  label: string;
  query: string;
  category:
    | 'apex'
    | 'flow'
    | 'permissions'
    | 'lightning'
    | 'metadata_api'
    | 'release'
    | 'testing'
    | 'security'
    | 'deployment'
    | 'imported_evidence'
    | 'object_reference'
    | 'sales_cloud'
    | 'service_cloud'
    | 'data_cloud'
    | 'revenue_cloud'
    | 'marketing_cloud'
    | 'feature'
    | 'integration'
    | 'email'
    | 'general';
  reasons: string[];
  componentTypes: SalesforceComponentType[];
  apiVersions: string[];
  riskSignalIds: string[];
}

export interface SalesforceDocEvidenceSource {
  id: string;
  topicId: string;
  title: string;
  url: string;
  domain: string;
  sourceType: 'release_page' | 'release_notes' | 'developer_doc' | 'help_doc' | 'architect_doc' | 'pdf_guide' | 'release_notes_pdf' | 'official_doc';
  status: 'ga' | 'preview' | 'unknown';
  availability?: 'official' | 'ga' | 'preview';
  retrievedAt: string;
  responseHash: string;
  contentQuality?: 'full_text' | 'metadata_only';
  contentLength: number;
  excerpt: string;
  matchedChunks?: Array<{
    id: string;
    ordinal: number;
    text: string;
    score: number;
    contentLength: number;
  }>;
  searchSnippet?: string;
  warnings: string[];
  apiVersion?: string;
  releaseLabel?: string;
  documentationVersion?: string;
  lastModified?: string;
  confidenceImpact: 'supports' | 'unclear' | 'preview-risk' | 'release-link-risk' | 'stale-risk';
}

export interface SalesforceDocEvidenceBundle {
  version: 1;
  generatedAt: string;
  releaseContext: {
    requested?: string;
    detected?: string;
    sourceUrl?: string;
    warnings: string[];
  };
  officialDomainPolicy: {
    allowedHostPattern: '*.salesforce.com';
    rejectedUrls: string[];
  };
  documentationIndex?: {
    status?: 'hit' | 'miss' | 'unavailable' | 'stale';
    generatedAt?: string;
    storagePath?: string;
    recordCount?: number;
    developerDocCount?: number;
    fullTextRecordCount?: number;
    metadataOnlyRecordCount?: number;
    indexSourceCounts?: Record<string, number>;
    failedDomains?: Record<string, number>;
    topicCoverage?: Array<{
      topicId: string;
      status: 'hit' | 'miss' | 'unavailable' | 'stale' | 'blocked' | 'empty_shell' | 'no_official_source' | 'not_indexed';
      sourceCount: number;
      reason?: string;
    }>;
    missedTopics?: Array<{
      topicId: string;
      label?: string;
      reason: 'blocked' | 'not_indexed' | 'empty_shell' | 'no_official_source' | 'stale' | 'unavailable';
    }>;
    stalenessWarnings?: string[];
  };
  topics: SalesforceDocumentationTopic[];
  sources: SalesforceDocEvidenceSource[];
  warnings: string[];
}

export function renderSalesforceDocEvidenceMarkdown(bundle: SalesforceDocEvidenceBundle): string {
  const lines: string[] = [
    '# Salesforce Documentation Evidence',
    '',
    `Generated: ${bundle.generatedAt}`,
    bundle.releaseContext.detected
      ? `Detected release context: ${bundle.releaseContext.detected}`
      : 'Detected release context: unavailable',
    bundle.releaseContext.requested
      ? `Requested release context: ${bundle.releaseContext.requested}`
      : '',
    bundle.documentationIndex
      ? `Documentation index: ${bundle.documentationIndex.status || 'unknown'}${bundle.documentationIndex.generatedAt ? ` (${bundle.documentationIndex.generatedAt})` : ''}`
      : '',
    '',
    '## Source Policy',
    '',
    `- Official domain allowlist: ${bundle.officialDomainPolicy.allowedHostPattern}`,
    `- Rejected non-official URLs: ${bundle.officialDomainPolicy.rejectedUrls.length}`,
    '',
    '## Topics',
    '',
    ...bundle.topics.map((topic) => `- **${topic.label}** (${topic.id}) - ${topic.query}`),
    bundle.documentationIndex?.missedTopics && bundle.documentationIndex.missedTopics.length > 0
      ? `\nMissed topics: ${bundle.documentationIndex.missedTopics.map((topic) => `${topic.topicId} (${topic.reason})`).join(', ')}`
      : '',
    '',
    '## Sources',
    '',
  ].filter(Boolean);

  if (bundle.sources.length === 0) {
    lines.push('No official Salesforce documentation sources were fetched.');
  } else {
    for (const source of bundle.sources) {
      lines.push(`- **${source.title}**`);
      lines.push(`  URL: ${source.url}`);
      lines.push(`  Topic: ${source.topicId}; availability: ${formatEvidenceSourceAvailability(source)}; content: ${source.contentQuality || 'unknown'}; confidence impact: ${source.confidenceImpact}`);
      if (source.releaseLabel || source.apiVersion || source.documentationVersion || source.lastModified) {
        lines.push([
          source.releaseLabel ? `release: ${source.releaseLabel}` : '',
          source.apiVersion ? `API version: ${source.apiVersion}` : '',
          source.documentationVersion ? `doc version: ${source.documentationVersion}` : '',
          source.lastModified ? `last modified: ${source.lastModified}` : '',
        ].filter(Boolean).join('; ').replace(/^/, '  Version metadata: '));
      }
      const matchedChunks = Array.isArray(source.matchedChunks) ? source.matchedChunks : [];
      if (matchedChunks.length > 0) {
        lines.push(`  Matched chunks: ${matchedChunks.length} chunk(s) from ${source.contentLength.toLocaleString()} source character(s). Use these chunks as the quoted source evidence, not just the URL.`);
        for (const chunk of matchedChunks) {
          lines.push(`  Chunk ${chunk.ordinal} (score: ${chunk.score}; ${chunk.contentLength.toLocaleString()} chars):`);
          appendIndentedMarkdownText(lines, chunk.text, '    ');
        }
      } else {
        lines.push(`  Excerpt: ${source.excerpt}`);
        if (source.contentQuality === 'full_text' && source.contentLength > (source.excerpt || '').length + 1000) {
          lines.push('  Limitation: this source was identified as full-text, but this evidence artifact only contains the excerpt above. Do not treat the URL alone as read documentation for field-level or behavior-level claims.');
        }
      }
      if (source.warnings.length > 0) {
        for (const warning of source.warnings) {
          lines.push(`  Source warning: ${warning}`);
        }
      }
    }
  }

  if (bundle.warnings.length > 0 || bundle.releaseContext.warnings.length > 0) {
    lines.push('', '## Warnings', '');
    for (const warning of [...bundle.releaseContext.warnings, ...bundle.warnings]) {
      lines.push(`- ${warning}`);
    }
  }

  return lines.join('\n');
}

function formatEvidenceSourceAvailability(source: SalesforceDocEvidenceSource): string {
  if (source.availability === 'preview') return 'preview/beta/pilot';
  if (source.availability === 'ga') return 'ga';
  if (source.availability === 'official') return 'official';
  if (source.status === 'preview') return 'preview/beta/pilot';
  if (source.status === 'ga') return 'ga';
  return 'official';
}

function appendIndentedMarkdownText(lines: string[], text: string, indent: string): void {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return;
  for (const line of normalized.split('\n')) {
    lines.push(`${indent}${line}`);
  }
}
