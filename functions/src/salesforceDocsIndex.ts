import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import { existsSync } from 'fs';
import { execFile as execFileCallback } from 'child_process';
import { promisify } from 'util';
import { GoogleAuth } from 'google-auth-library';

try {
  admin.app();
} catch {
  admin.initializeApp();
}

export const SALESFORCE_DOC_INDEX_PATH = 'salesforce-docs/index-v1.json';
export const SALESFORCE_DOC_INDEX_BUCKET = 'symposium-ai.firebasestorage.app';
const SALESFORCE_DOC_INDEX_VERSION = 1;
// ~85% of observed yield from the 2026-08-17 expansion canary (218 records:
// 133 developer docs, 216 full-text, 18 PDFs) so a partially blocked or
// regressed build keeps the previous index instead of publishing a gutted one.
const MIN_REFRESH_DEVELOPER_DOC_RECORDS = 110;
const MIN_REFRESH_FULL_TEXT_RECORDS = 185;
const MIN_REFRESH_PDF_RECORDS = 15;
const MAX_REFRESH_METADATA_ONLY_RATIO = 0.05;
const MAX_INDEX_SOURCE_AGE_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_INDEX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const PDF_REFRESH_CADENCE_DAYS = 30;
const PDF_REFRESH_OVERDUE_MULTIPLIER = 2;
const PDF_EXTRACT_MAX_PAGES = Number(process.env.SALESFORCE_DOCS_PDF_EXTRACT_MAX_PAGES || 0);
const PDF_EXTRACT_MAX_CHARS = Number(process.env.SALESFORCE_DOCS_PDF_EXTRACT_MAX_CHARS || 0);
const PDF_TEXT_CHUNK_TARGET_CHARS = Number(process.env.SALESFORCE_DOCS_PDF_CHUNK_TARGET_CHARS || 3500);
const PDF_TEXT_CHUNK_OVERLAP_CHARS = Number(process.env.SALESFORCE_DOCS_PDF_CHUNK_OVERLAP_CHARS || 350);
const MAX_MATCHED_CHUNKS_PER_SOURCE = 5;
const MAX_SITEMAP_RECORDS_PER_TOPIC = 3;
const MAX_METADATA_ONLY_SITEMAP_RECORDS_PER_TOPIC = 0;
const FULL_TEXT_CONTENT_LENGTH_FLOOR = 300;
const SALESFORCE_HELP_RENDER_TIMEOUT_MS = Number(process.env.SALESFORCE_DOCS_HELP_RENDER_TIMEOUT_MS || 60000);
const SALESFORCE_HELP_RENDER_MAX_CHARS = Number(process.env.SALESFORCE_DOCS_HELP_RENDER_MAX_CHARS || 0);
const SALESFORCE_HELP_RENDER_SPACING_MS = Number(process.env.SALESFORCE_DOCS_HELP_RENDER_SPACING_MS || 2000);
const MIN_SITEMAP_TOPIC_SCORE = 8;
const OFFICIAL_HOST_PATTERN = /(^|\.)salesforce\.com$/i;
const ALLOW_CURL_TEXT_FETCH = process.env.SALESFORCE_DOCS_ALLOW_CURL_FETCH === '1';
const ALLOW_CURL_PDF_FETCH = process.env.SALESFORCE_DOCS_ALLOW_CURL_PDF_FETCH === '1';
const execFile = promisify(execFileCallback);
const LOCAL_CHROME_EXECUTABLE_PATHS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];

export type SalesforceDocsContentQuality = 'full_text' | 'metadata_only';
export type SalesforceDocsSourceFormat = 'html' | 'json' | 'pdf';
export type SalesforceDocsPdfRefreshStatus = 'fresh' | 'due' | 'overdue';
export type SalesforceDocsFreshnessSignal = 'etag' | 'last_modified' | 'content_hash_only';
export type SalesforceDocsConfidenceImpact = 'supports' | 'unclear' | 'preview-risk' | 'release-link-risk' | 'stale-risk';

interface SalesforceDocsSitemapSource {
  label: string;
  url: string;
  maxChildSitemaps: number;
  maxEntries: number;
}

interface SalesforceDocsSitemapEntry {
  url: string;
  lastModified?: string;
  sitemapUrl: string;
  sourceLabel: string;
}

export interface OfficialDocContent {
  text: string;
  contentQuality: SalesforceDocsContentQuality;
  title?: string;
  apiVersion?: string;
  releaseLabel?: string;
  documentationVersion?: string;
  warnings?: string[];
  /** Help article links (table of contents, "See also") found on a rendered Help page. */
  discoveredLinks?: SalesforceDocsHelpCatalogEntry[];
}

export interface SalesforceDocsHelpCatalogEntry {
  url: string;
  title: string;
}

interface SalesforceDocsPdfSource {
  id: string;
  title: string;
  url: string;
  topicIds: string[];
  keywords: string[];
  refreshCadenceDays?: number;
}

interface FetchedPdfDocument {
  bytes: Uint8Array;
  contentType?: string;
  etag?: string;
  lastModified?: string;
  contentByteLength?: number;
}

export interface SalesforceDocsIndexTextChunk {
  id: string;
  ordinal: number;
  text: string;
  contentLength: number;
  responseHash: string;
}

interface ExtractedPdfText {
  text: string;
  chunks: SalesforceDocsIndexTextChunk[];
  pageCount: number;
  extractedPageCount: number;
  warnings: string[];
}

export interface SalesforceDocsIndexTopic {
  id: string;
  label: string;
  query: string;
  category: string;
  keywords: string[];
  seedUrls: string[];
}

export interface SalesforceDocsIndexRecord {
  id: string;
  topicIds: string[];
  title: string;
  url: string;
  domain: string;
  sourceType: 'release_page' | 'release_notes' | 'developer_doc' | 'help_doc' | 'architect_doc' | 'pdf_guide' | 'release_notes_pdf' | 'official_doc';
  sourceFormat?: SalesforceDocsSourceFormat;
  pdfSourceId?: string;
  status: 'ga' | 'preview' | 'unknown';
  retrievedAt: string;
  responseHash: string;
  contentQuality: SalesforceDocsContentQuality;
  contentLength: number;
  contentType?: string;
  contentByteLength?: number;
  textChunks?: SalesforceDocsIndexTextChunk[];
  chunkCount?: number;
  excerpt: string;
  keywords: string[];
  warnings: string[];
  apiVersion?: string;
  releaseLabel?: string;
  documentationVersion?: string;
  etag?: string;
  lastModified?: string;
  pageCount?: number;
  extractedPageCount?: number;
  refreshCadenceDays?: number;
  nextRefreshDueAt?: string;
  freshnessSignal?: SalesforceDocsFreshnessSignal;
  discoverySource: 'seed' | 'sitemap' | 'miss';
  sitemapUrl?: string;
  sitemapScore?: number;
  confidenceImpact: SalesforceDocsConfidenceImpact;
}

export interface SalesforceDocsPdfCorpusSourceHealth {
  sourceId: string;
  title: string;
  url: string;
  retrievedAt: string;
  lastModified?: string;
  etag?: string;
  contentByteLength?: number;
  pageCount?: number;
  extractedPageCount?: number;
  chunkCount?: number;
  refreshCadenceDays: number;
  nextRefreshDueAt: string;
  refreshStatus: SalesforceDocsPdfRefreshStatus;
  freshnessSignal: SalesforceDocsFreshnessSignal;
}

export interface SalesforceDocsPdfCorpusSummary {
  sourceCount: number;
  indexedCount: number;
  refreshCadenceDays: number;
  dueForRefreshCount: number;
  overdueCount: number;
  sourcesDueForRefresh: SalesforceDocsPdfCorpusSourceHealth[];
  sources: SalesforceDocsPdfCorpusSourceHealth[];
  warnings: string[];
}

export interface SalesforceDocsIndex {
  version: 1;
  generatedAt: string;
  sourcePolicy: {
    allowedHostPattern: '*.salesforce.com';
    storagePath: string;
  };
  topics: SalesforceDocsIndexTopic[];
  records: SalesforceDocsIndexRecord[];
  failures: Array<{
    topicId: string;
    url: string;
    error: string;
  }>;
  discovery?: {
    sitemapSources: string[];
    sitemapUrlCount: number;
    sitemapRecordLimitPerTopic: number;
  };
  pdfCorpus?: SalesforceDocsPdfCorpusSummary;
  /**
   * Help articles linked from the pages this build rendered, by title. Help
   * publishes no article sitemap, so this is how a lookup miss finds the
   * article that answers it.
   */
  helpCatalog?: SalesforceDocsHelpCatalogEntry[];
  /** Pages read because a lookup missed; each build re-reads them as seeds. */
  learnedSources?: SalesforceDocsLearnedSource[];
  /** Lookup misses no official page has answered yet; the next build tries again. */
  unresolvedMisses?: SalesforceDocsUnresolvedMiss[];
  warnings: string[];
}

/** A lookup topic the index could not answer with read text. Logged by lookups, read by the next build. */
export interface SalesforceDocsMiss {
  topicId: string;
  label: string;
  query: string;
  category?: string;
  reason: string;
  at: string;
  /** Official pages the lookup found for this topic but could not read. */
  candidateUrls?: string[];
}

export interface SalesforceDocsLearnedSource {
  url: string;
  title: string;
  query: string;
  learnedAt: string;
}

export interface SalesforceDocsUnresolvedMiss {
  label: string;
  query: string;
  reason: string;
  firstSeenAt: string;
  lastSeenAt: string;
  count: number;
  candidateUrls?: string[];
}

export interface SalesforceDocsIndexBuildOptions {
  includePdfDocs?: boolean;
  includeWebDocs?: boolean;
  includeSitemapDocs?: boolean;
  topicIds?: string[];
  /** The index this build replaces: its learned pages are re-read and its unresolved misses retried. */
  previousIndex?: SalesforceDocsIndex | null;
  /** Lookup misses logged since the previous build. */
  misses?: SalesforceDocsMiss[];
}

export interface SalesforceDocsLookupTopicLike {
  id: string;
  label: string;
  query: string;
  category?: string;
  componentTypes?: string[];
  apiVersions?: string[];
  riskSignalIds?: string[];
}

export interface SalesforceDocsIndexEvidenceSource {
  id: string;
  topicId: string;
  title: string;
  url: string;
  domain: string;
  sourceType: SalesforceDocsIndexRecord['sourceType'];
  status: SalesforceDocsIndexRecord['status'];
  retrievedAt: string;
  responseHash: string;
  contentQuality: SalesforceDocsContentQuality;
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
  confidenceImpact: SalesforceDocsIndexRecord['confidenceImpact'];
}

export interface SalesforceDocsIndexLookupResult {
  sources: SalesforceDocsIndexEvidenceSource[];
  topicHits: string[];
  /**
   * Topics whose selected records belong to an indexed topic this lookup topic
   * aliases to — i.e. the index genuinely curates them. Topics that only
   * scavenged token-overlap matches are NOT listed here, and callers must not
   * let those weak hits suppress live lookup.
   */
  aliasRoutedTopicIds: string[];
  warnings: string[];
  indexSummary?: {
    status: 'hit' | 'miss' | 'unavailable' | 'stale';
    generatedAt?: string;
    storagePath: string;
    recordCount: number;
    developerDocCount?: number;
    fullTextRecordCount?: number;
    metadataOnlyRecordCount?: number;
    pdfRecordCount?: number;
    indexSourceCounts?: Record<string, number>;
    pdfCorpus?: SalesforceDocsPdfCorpusSummary;
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
      reason: 'blocked' | 'not_indexed' | 'empty_shell' | 'no_official_source' | 'no_matching_passage' | 'stale' | 'unavailable';
    }>;
    stalenessWarnings?: string[];
  };
}

export const SALESFORCE_DOC_TOPICS: SalesforceDocsIndexTopic[] = [
  {
    id: 'salesforce-release-updates',
    label: 'Salesforce release updates and current release notes',
    query: 'Salesforce release updates current release notes Spring Summer Winter',
    category: 'release',
    keywords: ['release', 'release notes', 'current release', 'spring', 'summer', 'winter'],
    seedUrls: [
      'https://www.salesforce.com/releases',
      'https://help.salesforce.com/s/articleView?id=release-notes.salesforce_release_notes.htm&language=en_US&type=5',
      'https://help.salesforce.com/s/articleView?id=release-notes.rn_change_log.htm&language=en_US&type=5',
      'https://help.salesforce.com/s/articleView?id=release-notes.rn_feature_impact.htm&language=en_US&type=5',
      'https://help.salesforce.com/s/articleView?id=release-notes.rn_ru.htm&language=en_US&type=5',
      'https://help.salesforce.com/s/articleView?id=release-notes.rn_customization_general.htm&language=en_US&type=5',
      'https://help.salesforce.com/s/articleView?id=release-notes.rn_sales.htm&language=en_US&type=5',
      'https://help.salesforce.com/s/articleView?id=release-notes.rn_service.htm&language=en_US&type=5',
      'https://help.salesforce.com/s/articleView?id=release-notes.rn_automate.htm&language=en_US&type=5',
      'https://help.salesforce.com/s/articleView?id=release-notes.rn_apex.htm&language=en_US&type=5',
      'https://help.salesforce.com/s/articleView?id=release-notes.rn_api_objects.htm&language=en_US&type=5',
      'https://help.salesforce.com/s/articleView?id=release-notes.rn_api_meta.htm&language=en_US&type=5',
      'https://help.salesforce.com/s/articleView?id=release-notes.rn_c360_truth.htm&language=en_US&type=5',
      'https://help.salesforce.com/s/articleView?id=data.c360_a_dc_releases.htm&language=en_US&type=5',
      'https://help.salesforce.com/s/articleView?id=release-notes.rn_marketing.htm&language=en_US&type=5',
      'https://help.salesforce.com/s/articleView?id=release-notes.rn_revenue.htm&language=en_US&type=5',
    ],
  },
  {
    id: 'apex-governor-limits',
    label: 'Apex governor limits and bulkification',
    query: 'Apex governor limits SOQL DML loops bulkification best practices',
    category: 'apex',
    keywords: ['apex', 'governor limits', 'soql', 'dml', 'bulkification', 'bulkify'],
    seedUrls: [
      'https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_gov_limits.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_limits_tips.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_triggers_bestpract.htm',
    ],
  },
  {
    id: 'apex-sharing-security',
    label: 'Apex sharing and record access enforcement',
    query: 'Apex with sharing without sharing inherited sharing record access security',
    category: 'security',
    keywords: ['apex', 'sharing', 'with sharing', 'without sharing', 'inherited sharing', 'record access'],
    seedUrls: [
      'https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_classes_keywords_sharing.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_security_sharing_rules.htm',
    ],
  },
  {
    id: 'apex-crud-fls-user-mode',
    label: 'Apex CRUD/FLS enforcement and user-mode data operations',
    query: 'Apex CRUD FLS user mode data operations stripInaccessible WITH SECURITY_ENFORCED Salesforce',
    category: 'security',
    keywords: ['apex', 'crud', 'fls', 'user mode', 'stripinaccessible', 'with security enforced', 'object permissions', 'field permissions'],
    seedUrls: [
      'https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_classes_enforce_usermode.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_classes_with_security_stripInaccessible.htm',
      'https://developer.salesforce.com/docs/platform/lwc/guide/apex-security.html',
    ],
  },
  {
    id: 'apex-async-processing',
    label: 'Asynchronous Apex, Queueable Apex, and Batch Apex',
    query: 'Asynchronous Apex Queueable Apex Batch Apex future scheduled limits Salesforce',
    category: 'apex',
    keywords: ['apex', 'async', 'asynchronous apex', 'queueable', 'batch apex', 'future', 'scheduled apex'],
    seedUrls: [
      'https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_async_overview.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_queueing_jobs.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_batch_interface.htm',
    ],
  },
  {
    id: 'soql-query-selectivity',
    label: 'SOQL selectivity, query plans, and large data volumes',
    query: 'SOQL selectivity query plan large data volumes Query Plan tool Salesforce',
    category: 'apex',
    keywords: ['soql', 'query plan', 'selectivity', 'large data volumes', 'where clause', 'query optimizer'],
    seedUrls: [
      'https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/langCon_apex_SOQL.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/langCon_apex_SOQL_VLSQ.htm',
      'https://developer.salesforce.com/docs/platform/code-builder/guide/retrieve-query-plans.html',
    ],
  },
  {
    id: 'apex-testing',
    label: 'Apex testing data isolation and assertions',
    query: 'Apex testing seeAllData false assertions best practices Salesforce',
    category: 'testing',
    keywords: ['apex', 'test', 'testing', 'seealldata', 'assertions', 'test data'],
    seedUrls: [
      'https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_testing_seealldata_using.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_testing_best_practices.htm',
    ],
  },
  {
    id: 'flow-fault-paths',
    label: 'Flow fault paths and error handling',
    query: 'Salesforce Flow fault paths error handling record triggered flow',
    category: 'flow',
    keywords: ['flow', 'fault path', 'fault connector', 'error handling', 'record triggered flow'],
    seedUrls: [
      'https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_visual_workflow.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_flowdefinition.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_flowsettings.htm',
    ],
  },
  {
    id: 'flow-order-recursion',
    label: 'Flow automation order and recursion control',
    query: 'Salesforce Flow order of execution recursion record updates autolaunched flow',
    category: 'flow',
    keywords: ['flow', 'order of execution', 'recursion', 'record updates', 'autolaunched flow'],
    seedUrls: [
      'https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_visual_workflow.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_flowsettings.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_triggers_order_of_execution.htm',
      'https://help.salesforce.com/s/articleView?id=platform.flow_task_trigger_run_order.htm&language=en_US&type=5',
      'https://help.salesforce.com/s/articleView?id=platform.flow_concepts_trigger_record.htm&language=en_US&type=5',
      'https://help.salesforce.com/s/articleView?id=platform.flow_considerations_trigger_record.htm&language=en_US&type=5',
      'https://help.salesforce.com/s/articleView?id=platform.flow_concepts_trigger.htm&language=en_US&type=5',
      'https://architect.salesforce.com/docs/architect/decision-guides/guide/record-triggered.html',
    ],
  },
  {
    id: 'flow-tests-debugging',
    label: 'Flow tests, debugging, and runtime error handling',
    query: 'Salesforce Flow tests debug flow error emails fault path troubleshooting',
    category: 'flow',
    keywords: ['flow', 'flow tests', 'debug flow', 'error handling', 'fault path', 'troubleshooting'],
    seedUrls: [
      'https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_flowtest.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_visual_workflow.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_flowdefinition.htm',
    ],
  },
  {
    id: 'permissions-least-privilege',
    label: 'Permission set and profile least privilege',
    query: 'Salesforce permission sets profiles ModifyAllData ViewAllData least privilege',
    category: 'permissions',
    keywords: ['permission set', 'profile', 'modify all data', 'view all data', 'least privilege', 'object permissions'],
    seedUrls: [
      'https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_profile.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_permissionset.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_custompermission.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_permissionsetgroup.htm',
      // Knowledge article: the Spring '26 retirement of permissions on profiles was cancelled (2026-06-06).
      'https://help.salesforce.com/s/articleView?id=003834041&language=en_US&type=1',
      'https://help.salesforce.com/s/articleView?id=platform.perm_set_groups_muting.htm&language=en_US&type=5',
      'https://help.salesforce.com/s/articleView?id=platform.perm_set_groups_muting_dependencies.htm&language=en_US&type=5',
      'https://help.salesforce.com/s/articleView?id=platform.perm_sets_best_practices.htm&language=en_US&type=5',
    ],
  },
  {
    id: 'field-level-security-object-permissions',
    label: 'Field-level security and object permission metadata',
    query: 'Salesforce field level security object permissions profile permission set Metadata API',
    category: 'permissions',
    keywords: ['field-level security', 'field permissions', 'object permissions', 'profile', 'permission set', 'crud', 'fls'],
    seedUrls: [
      'https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_profile.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_permissionset.htm',
      'https://developer.salesforce.com/docs/platform/lwc/guide/apex-security.html',
    ],
  },
  {
    id: 'sharing-model-rules',
    label: 'Org sharing model, sharing rules, and record visibility',
    query: 'Salesforce sharing model organization-wide defaults sharing rules role hierarchy Metadata API',
    category: 'security',
    keywords: ['sharing rules', 'sharing model', 'organization-wide defaults', 'owd', 'role hierarchy', 'record visibility'],
    seedUrls: [
      'https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_sharingrules.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_security_sharing_rules.htm',
    ],
  },
  {
    id: 'lightning-security',
    label: 'Lightning component DOM and security guidance',
    query: 'Lightning Web Components manual DOM innerHTML security Salesforce',
    category: 'lightning',
    keywords: ['lwc', 'lightning', 'manual dom', 'innerhtml', 'lightning web security', 'sanitize'],
    seedUrls: [
      'https://developer.salesforce.com/docs/platform/lwc/guide/create-components-dom-work.html',
      'https://developer.salesforce.com/docs/platform/lightning-components-security/guide/lws-sanitize.html',
      'https://developer.salesforce.com/docs/platform/lwc/guide/reference-directives.html',
    ],
  },
  {
    id: 'lightning-record-pages-layouts',
    label: 'Lightning record pages, layouts, and component exposure',
    query: 'Salesforce Lightning record pages FlexiPage layouts LWC targets metadata',
    category: 'lightning',
    keywords: ['lightning record page', 'flexipage', 'layout', 'lwc targets', 'record context', 'quick action'],
    seedUrls: [
      'https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_flexipage.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_layouts.htm',
      'https://developer.salesforce.com/docs/platform/lwc/guide/reference-configuration-tags.html',
      'https://developer.salesforce.com/docs/platform/lwc/guide/use-record-context.html',
    ],
  },
  {
    id: 'metadata-api-versioning',
    label: 'Metadata API and component API versioning',
    query: 'Salesforce Metadata API API version support release notes',
    category: 'metadata_api',
    keywords: ['metadata api', 'api version', 'package xml', 'release notes'],
    seedUrls: [
      'https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_intro.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_support_policy.htm',
    ],
  },
  {
    id: 'metadata-deploy-retrieve-source-format',
    label: 'Metadata API deploy, retrieve, and source package boundaries',
    query: 'Salesforce Metadata API deploy retrieve package xml source format deployment',
    category: 'deployment',
    keywords: ['metadata api', 'deploy', 'retrieve', 'package xml', 'source format', 'deployment'],
    seedUrls: [
      'https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_deploy.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_retrieve.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_intro.htm',
    ],
  },
  {
    id: 'object-field-modeling',
    label: 'Custom object and field metadata modeling',
    query: 'Salesforce CustomObject CustomField metadata field types relationships object model',
    category: 'metadata_api',
    keywords: ['customobject', 'customfield', 'object model', 'field types', 'relationships', 'metadata'],
    seedUrls: [
      'https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/customobject.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/customfield.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_custom_objects.htm',
    ],
  },
  {
    id: 'validation-rules-formulas',
    label: 'Validation rules and formula behavior',
    query: 'Salesforce validation rules formulas error condition formula metadata Tooling API',
    category: 'metadata_api',
    keywords: ['validation rule', 'validationrule', 'formula', 'error condition formula', 'field validation'],
    seedUrls: [
      'https://developer.salesforce.com/docs/atlas.en-us.api_tooling.meta/api_tooling/tooling_api_objects_validationrule.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/customfield.htm',
    ],
  },
  {
    id: 'custom-metadata-types',
    label: 'Custom metadata types and deployable configuration',
    query: 'Salesforce custom metadata types CustomMetadata Metadata API Apex deployable configuration',
    category: 'metadata_api',
    keywords: ['custom metadata', 'custommetadata', 'custom metadata types', 'deployable configuration', 'metadata relationship'],
    seedUrls: [
      'https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_custommetadatatypes.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_custommetadata.htm',
    ],
  },
  {
    id: 'record-types-picklists',
    label: 'Record types and picklist metadata',
    query: 'Salesforce record types picklist values value sets Metadata API',
    category: 'metadata_api',
    keywords: ['record type', 'recordtype', 'picklist', 'value set', 'business process'],
    seedUrls: [
      'https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_recordtype.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_globalvalueset.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_standardvalueset.htm',
    ],
  },
  {
    id: 'reports-dashboards-metadata',
    label: 'Report and dashboard metadata',
    query: 'Salesforce Report Dashboard Metadata API folders report types dashboards',
    category: 'metadata_api',
    keywords: ['report', 'dashboard', 'metadata api', 'folder', 'report type'],
    seedUrls: [
      'https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_report.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_dashboard.htm',
    ],
  },
  {
    id: 'workflow-approval-processes',
    label: 'Workflow rules and approval process metadata',
    query: 'Salesforce Workflow ApprovalProcess metadata approval process workflow rules',
    category: 'metadata_api',
    keywords: ['workflow', 'approval process', 'approvalprocess', 'workflow rule', 'metadata'],
    seedUrls: [
      'https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_workflow.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_approvalprocess.htm',
    ],
  },
  {
    id: 'connected-app-oauth',
    label: 'Connected apps, OAuth settings, and scopes',
    query: 'Salesforce ConnectedApp OAuth scopes callback URL metadata security',
    category: 'integration',
    keywords: ['connected app', 'connectedapp', 'oauth', 'scopes', 'callback url', 'consumer key'],
    seedUrls: [
      'https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_connectedapp.htm',
    ],
  },
  {
    id: 'named-credentials-external-credentials',
    label: 'Named credentials and external credentials for callouts',
    query: 'Salesforce named credentials external credentials Apex callouts OAuth packaging principals',
    category: 'integration',
    keywords: ['named credential', 'external credential', 'callout', 'oauth', 'principal', 'user external credentials'],
    seedUrls: [
      'https://developer.salesforce.com/docs/platform/named-credentials/guide/get-started.html',
      'https://developer.salesforce.com/docs/platform/named-credentials/guide/nc-oauth-dev-guide.html',
      'https://developer.salesforce.com/docs/platform/named-credentials/guide/nc-package-credentials.html',
    ],
  },
  {
    id: 'platform-events-pubsub',
    label: 'Platform events, event bus, and Pub/Sub API',
    query: 'Salesforce platform events event bus Pub/Sub API publish subscribe allocations Apex',
    category: 'integration',
    keywords: ['platform events', 'event bus', 'pub/sub api', 'publish', 'subscribe', 'change data capture'],
    seedUrls: [
      'https://developer.salesforce.com/docs/atlas.en-us.platform_events.meta/platform_events/platform_events_intro.htm',
      'https://developer.salesforce.com/docs/platform/pub-sub-api/guide/intro.html',
      'https://developer.salesforce.com/docs/platform/pub-sub-api/guide/allocations.html',
    ],
  },
  {
    id: 'duplicate-matching-rules',
    label: 'Duplicate rules and matching rules',
    query: 'Salesforce DuplicateRule MatchingRule metadata duplicate management matching rules',
    category: 'metadata_api',
    keywords: ['duplicate rule', 'duplicaterule', 'matching rule', 'matchingrule', 'duplicate management'],
    seedUrls: [
      'https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_duplicaterule.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_matchingrule.htm',
    ],
  },
  {
    id: 'sales-cloud-admin-setup',
    label: 'Sales Cloud admin setup and data model',
    query: 'Sales Cloud setup data model accounts contacts leads opportunities campaigns forecasts territories',
    category: 'sales_cloud',
    keywords: ['sales cloud', 'account', 'contact', 'lead', 'opportunity', 'campaign', 'forecast', 'territory', 'sales process'],
    seedUrls: [
      'https://developer.salesforce.com/docs/platform/data-models/guide/sales-cloud-overview.html',
      'https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_account.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_contact.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_lead.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_opportunity.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_campaign.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_opportunitylineitem.htm',
    ],
  },
  {
    id: 'service-cloud-admin-setup',
    label: 'Service Cloud admin setup and case model',
    query: 'Service Cloud setup data model cases entitlements milestones knowledge queues routing',
    category: 'service_cloud',
    keywords: ['service cloud', 'case', 'entitlement', 'milestone', 'knowledge', 'queue', 'routing', 'support process'],
    seedUrls: [
      'https://developer.salesforce.com/docs/platform/data-models/guide/service-cloud-overview.html',
      'https://developer.salesforce.com/docs/platform/data-models/guide/case.html',
      'https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_case.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_entitlement.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_knowledge__kav.htm',
    ],
  },
  {
    id: 'data-cloud-development',
    label: 'Data Cloud development and object model',
    query: 'Salesforce Data Cloud development data lake objects data model objects DMO DLO',
    category: 'data_cloud',
    keywords: ['data cloud', 'data lake object', 'dlo', 'data model object', 'dmo', 'calculated insight', 'unified individual'],
    seedUrls: [
      'https://developer.salesforce.com/docs/data/data-cloud-dev/guide/get-started.htm',
      'https://developer.salesforce.com/docs/data/data-cloud-dev/guide/dc-object-model.html',
      'https://developer.salesforce.com/docs/data/data-cloud-ref/guide/c360dm-datamodelobjects.html',
    ],
  },
  {
    id: 'data-cloud-ingestion-query',
    label: 'Data Cloud ingestion, extraction, and metadata APIs',
    query: 'Salesforce Data Cloud ingestion API query extract metadata API data streams',
    category: 'data_cloud',
    keywords: ['data cloud', 'ingest', 'ingestion api', 'extract api', 'metadata api', 'data stream', 'query'],
    seedUrls: [
      'https://developer.salesforce.com/docs/atlas.en-us.c360a_api.meta/c360a_api/c360a_api_ingest_data.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.c360a_api.meta/c360a_api/c360a_api_extract_data.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.c360a_api.meta/c360a_api/c360a_api_metadata_api.htm',
    ],
  },
  {
    id: 'data-cloud-identity-modeling',
    label: 'Data Cloud identity resolution and data modeling',
    query: 'Salesforce Data Cloud identity resolution data model unified individual data model objects',
    category: 'data_cloud',
    keywords: ['data cloud', 'identity resolution', 'unified individual', 'data model', 'data model object', 'profile'],
    seedUrls: [
      'https://developer.salesforce.com/docs/atlas.en-us.c360a_api.meta/c360a_api/c360dm_model_data.htm',
      'https://developer.salesforce.com/docs/data/data-cloud-dev/guide/dc-object-model.html',
      'https://developer.salesforce.com/docs/data/data-cloud-ref/guide/c360dm-datamodelobjects.html',
    ],
  },
  {
    id: 'revenue-cloud-data-model',
    label: 'Revenue Cloud product, pricing, quote, and order model',
    query: 'Revenue Cloud product catalog pricing quote order contract data model Salesforce',
    category: 'revenue_cloud',
    keywords: ['revenue cloud', 'product catalog', 'pricing', 'quote', 'quote line item', 'order', 'contract', 'price book'],
    seedUrls: [
      'https://developer.salesforce.com/docs/platform/data-models/guide/revenue-cloud-category.html',
      'https://developer.salesforce.com/docs/platform/data-models/guide/product-catalog-mgmt.html',
      'https://developer.salesforce.com/docs/platform/data-models/guide/product-pricing.html',
      'https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_product2.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_pricebook2.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_quote.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_quotelineitem.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_order.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_orderitem.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_contract.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_asset.htm',
    ],
  },
  {
    id: 'revenue-cloud-cpq-industries',
    label: 'Revenue Cloud CPQ and Industries Communications data model',
    query: 'Salesforce Revenue Cloud CPQ Industries CME product catalog pricing quote order',
    category: 'revenue_cloud',
    keywords: ['revenue cloud', 'cpq', 'industries', 'communications cloud', 'cme', 'quote', 'order capture', 'product catalog'],
    seedUrls: [
      'https://developer.salesforce.com/docs/industries/cme/guide/introduction.html',
      'https://developer.salesforce.com/docs/industries/cme/guide/get-started.html',
      'https://developer.salesforce.com/docs/platform/data-models/guide/revenue-cloud-category.html',
      'https://developer.salesforce.com/docs/platform/data-models/guide/product-catalog-mgmt.html',
    ],
  },
  {
    id: 'marketing-cloud-engagement-apis',
    label: 'Marketing Cloud Engagement APIs and object model',
    query: 'Marketing Cloud Engagement REST SOAP API DataExtension Subscriber Journey Content API',
    category: 'marketing_cloud',
    keywords: ['marketing cloud', 'engagement', 'rest api', 'soap api', 'data extension', 'subscriber', 'journey', 'content api'],
    seedUrls: [
      'https://developer.salesforce.com/docs/marketing/marketing-cloud/guide/apis-overview.html',
      'https://developer.salesforce.com/docs/marketing/marketing-cloud/guide/rest-api-overview.html',
      'https://developer.salesforce.com/docs/marketing/marketing-cloud/guide/content-api',
      'https://developer.salesforce.com/docs/marketing/marketing-cloud/guide/soap_web_service_objects.html',
      'https://developer.salesforce.com/docs/marketing/marketing-cloud/references',
    ],
  },
  {
    id: 'marketing-cloud-growth-development',
    label: 'Marketing Cloud Growth administration and object model',
    query: 'Marketing Cloud Growth administration setup objects Salesforce developer guide',
    category: 'marketing_cloud',
    keywords: ['marketing cloud growth', 'campaign', 'segment', 'activation', 'object model', 'administration'],
    seedUrls: [
      'https://developer.salesforce.com/docs/marketing/marketing-cloud-growth/guide/mc-getting-started.html',
      'https://developer.salesforce.com/docs/marketing/marketing-cloud-growth/guide/mc-administration.html',
      'https://developer.salesforce.com/docs/marketing/marketing-cloud-growth/guide/mc-manage-objects.html',
    ],
  },
  {
    id: 'standard-object-reference-sales-service',
    label: 'Standard object reference for Sales and Service Cloud',
    query: 'Salesforce standard object reference Account Contact Lead Opportunity Case Task Event User Product Quote Order Contract Asset',
    category: 'object_reference',
    keywords: ['standard object', 'object reference', 'account', 'contact', 'lead', 'opportunity', 'case', 'task', 'event', 'user', 'product', 'quote', 'order'],
    seedUrls: [
      'https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/system_fields.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_account.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_contact.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_lead.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_opportunity.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_case.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_task.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_event.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_user.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_product2.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_pricebook2.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_quote.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_order.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_contract.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_asset.htm',
    ],
  },
  {
    id: 'metadata-api-type-reference',
    label: 'Metadata API type reference and coverage matrix',
    query: 'Salesforce Metadata API all metadata types metadata coverage CustomObject Flow Profile PermissionSet FlexiPage Layout',
    category: 'metadata_api',
    keywords: ['metadata api', 'metadata types', 'metadata coverage', 'customobject', 'customfield', 'flow', 'profile', 'permissionset', 'flexipage', 'layout'],
    seedUrls: [
      'https://developer.salesforce.com/docs/success/metadata-coverage-report/references/metadata-types/v66.0/metadata-types.html',
      'https://developer.salesforce.com/docs/metadata-coverage',
      'https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_intro.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/customobject.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/customfield.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_profile.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_permissionset.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_flexipage.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_layouts.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_customapplication.htm',
    ],
  },
  {
    id: 'flow-metadata-edge-cases',
    label: 'Flow metadata edge cases, tests, and runtime settings',
    query: 'Salesforce Flow Metadata API FlowDefinition FlowSettings FlowTest record triggered autolaunched subflow edge cases',
    category: 'flow',
    keywords: ['flow', 'flowdefinition', 'flowsettings', 'flowtest', 'record triggered flow', 'autolaunched flow', 'subflow', 'fault path'],
    seedUrls: [
      'https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_visual_workflow.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_flowdefinition.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_flowsettings.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_flowtest.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_triggers_order_of_execution.htm',
    ],
  },
  {
    id: 'emailmessage-object-reference',
    label: 'EmailMessage object reference and supported fields',
    query: 'EmailMessage object reference fields Salesforce API ReplyToEmailMessageId ThreadIdentifier RelatedToId Headers',
    category: 'object_reference',
    keywords: ['emailmessage', 'email message', 'replytoemailmessageid', 'threadidentifier', 'relatedtoid', 'headers', 'object reference'],
    seedUrls: [
      'https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_emailmessage.htm',
    ],
  },
  {
    id: 'emailmessage-threading-fields',
    label: 'EmailMessage threading fields and header behavior',
    query: 'EmailMessage ReplyToEmailMessageId ThreadIdentifier Headers Salesforce object reference',
    category: 'object_reference',
    keywords: ['emailmessage', 'replytoemailmessageid', 'threadidentifier', 'headers', 'message identifier', 'threading'],
    seedUrls: [
      'https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_emailmessage.htm',
    ],
  },
  {
    id: 'email-to-salesforce',
    label: 'Email-to-Salesforce behavior and enablement',
    query: 'Email-to-Salesforce setup behavior active Salesforce developer documentation',
    category: 'integration',
    keywords: ['email to salesforce', 'email-to-salesforce', 'emailservicesaddress', 'emailservicesfunction', 'active', 'setup'],
    seedUrls: [
      'https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_classes_email_inbound.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_emailmessage.htm',
    ],
  },
  {
    id: 'enhanced-email-activity-capture',
    label: 'Enhanced Email and Einstein Activity Capture behavior',
    query: 'Enhanced Email Einstein Activity Capture EmailMessage Salesforce developer documentation',
    category: 'integration',
    keywords: ['enhanced email', 'einstein activity capture', 'emailmessage', 'activity capture', 'logged as email messages'],
    seedUrls: [
      'https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_emailmessage.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_task.htm',
    ],
  },
  {
    id: 'outlook-email-integration',
    label: 'Outlook/Gmail integration email logging behavior',
    query: 'Salesforce Outlook Gmail integration email logging Enhanced Email',
    category: 'integration',
    keywords: ['outlook integration', 'gmail integration', 'email logging', 'send through external email services', 'office 365'],
    seedUrls: [
      'https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_emailmessage.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_task.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_event.htm',
    ],
  },
  {
    id: 'email-services',
    label: 'Email Services and inbound email Apex behavior',
    query: 'Salesforce Email Services inbound email Apex EmailServicesFunction Messaging.InboundEmail',
    category: 'apex',
    keywords: ['email services', 'emailservicesfunction', 'emailservicesaddress', 'inboundemail', 'inbound envelope', 'messaging.inboundemail'],
    seedUrls: [
      'https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_classes_email_inbound.htm',
    ],
  },
  {
    id: 'activity-task-relationships',
    label: 'Activity, Task, and email relationship fields',
    query: 'Salesforce Task Activity EmailMessage RelatedToId WhatId WhoId object reference',
    category: 'object_reference',
    keywords: ['task', 'activity', 'whatid', 'whoid', 'relatedtoid', 'emailmessage', 'relationship fields'],
    seedUrls: [
      'https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_task.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_emailmessage.htm',
    ],
  },
  {
    id: 'email-templates',
    label: 'Email template body and merge field behavior',
    query: 'Salesforce EmailTemplate Body HtmlValue merge fields object reference',
    category: 'object_reference',
    keywords: ['emailtemplate', 'email template', 'htmlvalue', 'body', 'merge fields'],
    seedUrls: [
      'https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_emailtemplate.htm',
    ],
  },
  {
    id: 'apex-email-apis',
    label: 'Apex outbound email APIs',
    query: 'Apex Messaging.SingleEmailMessage sendEmail Salesforce',
    category: 'apex',
    keywords: ['messaging.singleemailmessage', 'sendemail', 'apex email', 'single email message', 'mass email message'],
    seedUrls: [
      'https://developer.salesforce.com/docs/atlas.en-us.apexref.meta/apexref/apex_classes_email_outbound_single.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.apexref.meta/apexref/apex_classes_email_outbound_messaging.htm',
    ],
  },
  // --- Solution-architect coverage expansion (2026-08) ---
  {
    id: 'well-architected-framework',
    label: 'Salesforce Well-Architected framework',
    query: 'Salesforce Well-Architected framework trusted easy adaptable architecture health',
    category: 'architecture',
    keywords: ['well-architected', 'architecture', 'trusted', 'adaptable', 'resilient', 'architecture health'],
    seedUrls: [
      'https://architect.salesforce.com/well-architected/overview',
    ],
  },
  {
    id: 'architecture-decision-guides',
    label: 'Salesforce architecture decision guides',
    query: 'Salesforce architect decision guides record-triggered automation data architecture integration architecture',
    category: 'architecture',
    keywords: ['decision guide', 'architecture', 'record-triggered automation', 'data architecture', 'integration architecture', 'diagrams'],
    seedUrls: [
      'https://architect.salesforce.com/design/decision-guides',
      'https://architect.salesforce.com/docs/architect/decision-guides/guide/record-triggered.html',
    ],
  },
  {
    id: 'soql-sosl-reference',
    label: 'SOQL and SOSL reference',
    query: 'SOQL SOSL reference SELECT WHERE relationship queries aggregate functions Salesforce',
    category: 'apex',
    keywords: ['soql', 'sosl', 'select', 'relationship query', 'aggregate', 'query reference', 'find'],
    seedUrls: [
      'https://developer.salesforce.com/docs/atlas.en-us.soql_sosl.meta/soql_sosl/sforce_api_calls_soql_sosl_intro.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.soql_sosl.meta/soql_sosl/sforce_api_calls_soql_select.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.soql_sosl.meta/soql_sosl/sforce_api_calls_sosl.htm',
    ],
  },
  {
    id: 'apex-order-of-execution',
    label: 'Order of execution for record saves',
    query: 'Salesforce order of execution triggers flows validation rules workflow save order',
    category: 'apex',
    keywords: ['order of execution', 'save order', 'trigger order', 'before trigger', 'after trigger', 'recursion'],
    seedUrls: [
      'https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_triggers_order_of_execution.htm',
    ],
  },
  {
    id: 'bulk-api-large-data',
    label: 'Bulk API 2.0 and large data loads',
    query: 'Bulk API 2.0 ingest query large data loads PK chunking Salesforce',
    category: 'integration',
    keywords: ['bulk api', 'bulk api 2.0', 'ingest', 'pk chunking', 'data load', 'batch'],
    seedUrls: [
      'https://developer.salesforce.com/docs/atlas.en-us.api_asynch.meta/api_asynch/asynch_api_intro.htm',
    ],
  },
  {
    id: 'ldv-performance-scale',
    label: 'Large data volumes performance and scale',
    query: 'Salesforce large data volumes LDV skinny tables indexes divisions performance scale',
    category: 'architecture',
    keywords: ['large data volumes', 'ldv', 'skinny table', 'custom index', 'selectivity', 'scale', 'data skew', 'ownership skew'],
    seedUrls: [
      'https://developer.salesforce.com/docs/atlas.en-us.salesforce_large_data_volumes_bp.meta/salesforce_large_data_volumes_bp/ldv_deployments_introduction.htm',
    ],
  },
  {
    id: 'streaming-api',
    label: 'Streaming API and event subscriptions',
    query: 'Salesforce Streaming API PushTopic generic events CometD subscriptions',
    category: 'integration',
    keywords: ['streaming api', 'pushtopic', 'cometd', 'generic events', 'subscribe', 'replay id'],
    seedUrls: [
      'https://developer.salesforce.com/docs/atlas.en-us.api_streaming.meta/api_streaming/intro_stream.htm',
    ],
  },
  {
    id: 'change-data-capture',
    label: 'Change Data Capture',
    query: 'Salesforce Change Data Capture change events integration sync CDC',
    category: 'integration',
    keywords: ['change data capture', 'cdc', 'change event', 'data sync', 'event allocations'],
    seedUrls: [
      'https://developer.salesforce.com/docs/atlas.en-us.change_data_capture.meta/change_data_capture/cdc_intro.htm',
    ],
  },
  {
    id: 'api-limits-allocations',
    label: 'API request limits and allocations',
    query: 'Salesforce API request limits allocations daily limits concurrent requests governor',
    category: 'architecture',
    keywords: ['api limits', 'allocations', 'daily api requests', 'concurrent', 'rate limit', 'limits cheat sheet'],
    seedUrls: [
      'https://developer.salesforce.com/docs/atlas.en-us.salesforce_app_limits_cheatsheet.meta/salesforce_app_limits_cheatsheet/salesforce_app_limits_overview.htm',
    ],
  },
  {
    id: 'identity-sso-saml-oidc',
    label: 'Salesforce Identity, SSO, SAML, and OpenID Connect',
    query: 'Salesforce identity single sign-on SAML OpenID Connect My Domain identity provider',
    category: 'identity',
    keywords: ['single sign-on', 'sso', 'saml', 'openid connect', 'identity provider', 'my domain', 'login'],
    seedUrls: [
      'https://developer.salesforce.com/docs/atlas.en-us.identityImplGuide.meta/identityImplGuide/identity_overview.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.identityImplGuide.meta/identityImplGuide/security_overview_2fa.htm',
    ],
  },
  {
    id: 'oauth-flows',
    label: 'OAuth authorization flows',
    query: 'Salesforce OAuth 2.0 authorization flows web server JWT bearer client credentials refresh token',
    category: 'identity',
    keywords: ['oauth', 'authorization flow', 'jwt bearer', 'client credentials', 'web server flow', 'refresh token', 'device flow'],
    seedUrls: [
      'https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/intro_oauth_and_connected_apps.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.securityImplGuide.meta/securityImplGuide/connected_apps.htm',
    ],
  },
  {
    id: 'shield-platform-encryption',
    label: 'Shield Platform Encryption',
    query: 'Shield Platform Encryption tenant secret key management encrypted fields Salesforce',
    category: 'security',
    keywords: ['shield', 'platform encryption', 'tenant secret', 'key management', 'encrypted field', 'deterministic encryption'],
    seedUrls: [
      // The securityImplGuide atlas pages are retired (62-character shells); Help is the source now.
      'https://help.salesforce.com/s/articleView?id=xcloud.security_pe_overview.htm&language=en_US&type=5',
      'https://help.salesforce.com/s/articleView?id=xcloud.security_pe_concepts.htm&language=en_US&type=5',
      'https://help.salesforce.com/s/articleView?id=xcloud.security_pe_encryptable_data.htm&language=en_US&type=5',
      'https://help.salesforce.com/s/articleView?id=xcloud.security_pe_considerations_general.htm&language=en_US&type=5',
      'https://help.salesforce.com/s/articleView?id=xcloud.security_pe_setup.htm&language=en_US&type=5',
    ],
  },
  {
    id: 'event-monitoring-session-security',
    label: 'Event Monitoring and session security',
    query: 'Salesforce Event Monitoring EventLogFile session security transaction security policies',
    category: 'security',
    keywords: ['event monitoring', 'eventlogfile', 'session security', 'transaction security', 'login history', 'audit'],
    seedUrls: [
      'https://developer.salesforce.com/docs/atlas.en-us.securityImplGuide.meta/securityImplGuide/salesforce_security_guide.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_eventlogfile.htm',
    ],
  },
  {
    id: 'experience-cloud-architecture',
    label: 'Experience Cloud site architecture',
    query: 'Experience Cloud sites Experience Builder templates audiences architecture Salesforce',
    category: 'experience_cloud',
    keywords: ['experience cloud', 'experience builder', 'community', 'site', 'audience', 'template'],
    seedUrls: [
      'https://developer.salesforce.com/docs/atlas.en-us.communities_dev.meta/communities_dev/communities_dev_intro.htm',
    ],
  },
  {
    id: 'experience-cloud-lwr-sites',
    label: 'LWR sites for Experience Cloud',
    query: 'LWR Lightning Web Runtime sites Experience Cloud performance build your own',
    category: 'experience_cloud',
    keywords: ['lwr', 'lightning web runtime', 'build your own', 'experience cloud', 'site performance'],
    seedUrls: [
      'https://developer.salesforce.com/docs/atlas.en-us.exp_cloud_lwr.meta/exp_cloud_lwr/intro.htm',
    ],
  },
  {
    id: 'experience-cloud-sharing-security',
    label: 'Experience Cloud sharing and guest user security',
    query: 'Experience Cloud sharing sets guest user security external users sharing rules Salesforce',
    category: 'experience_cloud',
    keywords: ['sharing set', 'guest user', 'external user', 'community security', 'experience cloud security', 'external sharing model'],
    seedUrls: [
      'https://developer.salesforce.com/docs/atlas.en-us.communities_dev.meta/communities_dev/communities_dev_security_authenticated_and_guest_users.htm',
    ],
  },
  {
    id: 'sfdx-source-driven-dev',
    label: 'Salesforce DX source-driven development',
    query: 'Salesforce DX source-driven development project structure CLI metadata source tracking',
    category: 'devops',
    keywords: ['salesforce dx', 'sfdx', 'sf cli', 'source tracking', 'project structure', 'source format'],
    seedUrls: [
      'https://developer.salesforce.com/docs/atlas.en-us.sfdx_dev.meta/sfdx_dev/sfdx_dev_intro.htm',
    ],
  },
  {
    id: 'second-generation-packaging',
    label: 'Second-generation packaging (2GP)',
    query: 'second-generation managed packages unlocked packages 2GP package versions Salesforce DX',
    category: 'devops',
    keywords: ['2gp', 'unlocked package', 'managed package', 'package version', 'namespace', 'dependency'],
    seedUrls: [
      'https://developer.salesforce.com/docs/atlas.en-us.pkg2_dev.meta/pkg2_dev/sfdx_dev_dev2gp.htm',
    ],
  },
  {
    id: 'devops-center-release-mgmt',
    label: 'DevOps Center and release management',
    query: 'DevOps Center pipelines work items promote release management Salesforce',
    category: 'devops',
    keywords: ['devops center', 'pipeline', 'work item', 'promote', 'release management', 'deployment stage'],
    seedUrls: [
      'https://help.salesforce.com/s/articleView?id=sf.devops_center_overview.htm&type=5',
      'https://developer.salesforce.com/docs/atlas.en-us.sfdx_dev.meta/sfdx_dev/sfdx_dev_intro.htm',
    ],
  },
  {
    id: 'scratch-orgs-sandboxes',
    label: 'Scratch orgs, sandboxes, and environment strategy',
    query: 'scratch orgs sandboxes environment strategy org shape sandbox seeding Salesforce DX',
    category: 'devops',
    keywords: ['scratch org', 'sandbox', 'org shape', 'environment hub', 'seeding', 'refresh'],
    seedUrls: [
      'https://developer.salesforce.com/docs/atlas.en-us.sfdx_dev.meta/sfdx_dev/sfdx_dev_scratch_orgs.htm',
    ],
  },
  {
    id: 'omnistudio-overview-architecture',
    label: 'OmniStudio overview and architecture',
    query: 'OmniStudio standard runtime architecture components Salesforce industries',
    category: 'omnistudio',
    keywords: ['omnistudio', 'standard runtime', 'vlocity', 'industries', 'omnistudio components'],
    seedUrls: [
      'https://help.salesforce.com/s/articleView?id=sf.os_omnistudio_standard.htm&type=5',
    ],
  },
  {
    id: 'omnistudio-dataraptors',
    label: 'OmniStudio DataRaptors',
    query: 'OmniStudio DataRaptor extract transform load turbo bulk performance limits',
    category: 'omnistudio',
    keywords: ['dataraptor', 'extract', 'transform', 'load', 'turbo extract', 'omnistudio data mapper'],
    seedUrls: [
      'https://help.salesforce.com/s/articleView?id=sf.os_dataraptors.htm&type=5',
    ],
  },
  {
    id: 'omnistudio-integration-procedures',
    label: 'OmniStudio Integration Procedures',
    query: 'OmniStudio Integration Procedures HTTP actions chaining limits performance',
    category: 'omnistudio',
    keywords: ['integration procedure', 'http action', 'chainable', 'remote action', 'omnistudio integration'],
    seedUrls: [
      'https://help.salesforce.com/s/articleView?id=sf.os_integration_procedures.htm&type=5',
    ],
  },
  {
    id: 'omnistudio-flexcards-omniscripts',
    label: 'OmniStudio FlexCards and OmniScripts',
    query: 'OmniStudio FlexCards OmniScripts guided interactions design performance',
    category: 'omnistudio',
    keywords: ['flexcard', 'omniscript', 'guided interaction', 'lwc omniscript', 'omnistudio designer'],
    seedUrls: [
      'https://help.salesforce.com/s/articleView?id=sf.os_omniscripts.htm&type=5',
      'https://help.salesforce.com/s/articleView?id=sf.os_flexcards.htm&type=5',
    ],
  },
  {
    id: 'agentforce-agents-setup',
    label: 'Agentforce agents and setup',
    query: 'Agentforce agents topics actions setup Einstein generative AI Salesforce',
    category: 'agentforce',
    keywords: ['agentforce', 'agent', 'topics', 'actions', 'einstein', 'generative ai', 'copilot'],
    seedUrls: [
      'https://developer.salesforce.com/docs/einstein/genai/guide/get-started.html',
      'https://developer.salesforce.com/docs/einstein/genai/guide/get-started-agents.html',
    ],
  },
  {
    id: 'einstein-prompt-builder',
    label: 'Einstein Prompt Builder and prompt templates',
    query: 'Einstein Prompt Builder prompt templates grounding merge fields generative AI Salesforce',
    category: 'agentforce',
    keywords: ['prompt builder', 'prompt template', 'grounding', 'einstein trust layer', 'merge field'],
    seedUrls: [
      'https://developer.salesforce.com/docs/einstein/genai/guide/get-started-prompt-builder.html',
    ],
  },
  {
    id: 'agentforce-agent-api',
    label: 'Agentforce Agent API',
    query: 'Agentforce Agent API sessions messages programmatic agent invocation Salesforce',
    category: 'agentforce',
    keywords: ['agent api', 'agentforce api', 'session', 'invoke agent', 'einstein ai agent api'],
    seedUrls: [
      'https://developer.salesforce.com/docs/einstein/genai/guide/agent-api.html',
    ],
  },
  {
    id: 'field-service-architecture',
    label: 'Field Service data model and customization',
    query: 'Salesforce Field Service service appointments work orders scheduling data model developer',
    category: 'field_service',
    keywords: ['field service', 'service appointment', 'work order', 'scheduling', 'service resource', 'dispatcher'],
    seedUrls: [
      'https://developer.salesforce.com/docs/atlas.en-us.field_service_dev.meta/field_service_dev/fsl_dev_introduction.htm',
    ],
  },
  {
    id: 'crm-analytics-rest-data',
    label: 'CRM Analytics REST API and datasets',
    query: 'CRM Analytics REST API datasets dataflows SAQL lens dashboard Salesforce',
    category: 'analytics',
    keywords: ['crm analytics', 'tableau crm', 'einstein analytics', 'dataset', 'saql', 'dataflow', 'recipe'],
    seedUrls: [
      'https://developer.salesforce.com/docs/atlas.en-us.bi_dev_guide_rest.meta/bi_dev_guide_rest/bi_rest_overview.htm',
    ],
  },
  {
    id: 'omni-channel-routing',
    label: 'Omni-Channel routing and queues',
    query: 'Omni-Channel routing configuration PendingServiceRouting AgentWork queues skills-based routing',
    category: 'service_cloud',
    keywords: ['omni-channel', 'routing', 'pendingservicerouting', 'agentwork', 'skills-based routing', 'presence'],
    seedUrls: [
      'https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_pendingservicerouting.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_agentwork.htm',
    ],
  },
  // --- Docs grounding gap seeds (2.9.5): admin Help the index never had ---
  {
    id: 'org-limits-allocations',
    label: 'Org limits, storage, and edition allocations',
    query: 'Salesforce org limits data storage file storage custom fields per object edition allocations',
    category: 'limits',
    keywords: ['org limits', 'storage', 'data storage', 'file storage', 'custom fields allowed', 'allocations', 'limits resource', 'org list limits'],
    seedUrls: [
      'https://help.salesforce.com/s/articleView?id=xcloud.overview_storage.htm&language=en_US&type=5',
      'https://help.salesforce.com/s/articleView?id=platform.custom_field_allocations.htm&language=en_US&type=5',
      'https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/resources_limits.htm',
      'https://developer.salesforce.com/docs/platform/salesforce-cli-reference/guide/cli_reference_org_list_limits.html',
    ],
  },
  {
    id: 'org-security-health-check',
    label: 'Security Health Check and org security settings',
    query: 'Salesforce Security Health Check baseline score security settings',
    category: 'security',
    keywords: ['health check', 'security health check', 'baseline', 'security settings', 'session settings', 'password policies'],
    seedUrls: [
      'https://help.salesforce.com/s/articleView?id=xcloud.security_health_check.htm&language=en_US&type=5',
    ],
  },
  {
    id: 'lead-conversion',
    label: 'Lead conversion and lead field mapping',
    query: 'Salesforce lead conversion custom lead field mapping LeadConvert convertLead',
    category: 'sales_cloud',
    keywords: ['lead conversion', 'convert lead', 'leadconvert', 'convertlead', 'lead field mapping', 'map lead fields'],
    seedUrls: [
      'https://help.salesforce.com/s/articleView?id=sales.customize_mapleads.htm&language=en_US&type=5',
      'https://help.salesforce.com/s/articleView?id=sales.customize_mapleads_guidelines.htm&language=en_US&type=5',
      'https://help.salesforce.com/s/articleView?id=sales.lead_conversion_mapping.htm&language=en_US&type=5',
      'https://developer.salesforce.com/docs/atlas.en-us.apexref.meta/apexref/apex_dml_convertLead.htm',
      'https://developer.salesforce.com/docs/atlas.en-us.apexref.meta/apexref/apex_class_database_leadconvertresult.htm',
    ],
  },
  {
    id: 'email-limits',
    label: 'Email limits and allocations',
    query: 'Salesforce email limits single email mass email list email workflow email alert daily allocations',
    category: 'email',
    keywords: ['email limits', 'single email', 'mass email', 'list email', 'email alerts', 'daily allocation', 'email allocations'],
    seedUrls: [
      'https://help.salesforce.com/s/articleView?id=000386730&language=en_US&type=1',
      'https://help.salesforce.com/s/articleView?id=sales.allocations_email_general.htm&language=en_US&type=5',
      'https://help.salesforce.com/s/articleView?id=sales.limitations_email_mass.htm&language=en_US&type=5',
      'https://help.salesforce.com/s/articleView?id=platform.workflow_limits_email.htm&language=en_US&type=5',
    ],
  },
  {
    id: 'education-data-architecture',
    label: 'Education Data Architecture (EDA, hed__)',
    query: 'Education Data Architecture EDA hed objects affiliations program enrollment TDTM',
    category: 'education',
    keywords: ['education data architecture', 'eda', 'hed', 'affiliation', 'program enrollment', 'course connection', 'tdtm', 'higher education'],
    seedUrls: [
      'https://help.salesforce.com/s/articleView?id=sfdo.Education_Data_Architecture.htm&language=en_US&type=5',
      'https://help.salesforce.com/s/articleView?id=sfdo.eda_objects.htm&language=en_US&type=5',
      'https://help.salesforce.com/s/articleView?id=sfdo.EDA_Apex_Class_Descriptions.htm&language=en_US&type=5',
      'https://help.salesforce.com/s/articleView?id=sfdo.eda_whats_installed.htm&language=en_US&type=5',
    ],
  },
  {
    id: 'salesforce-cli-reference',
    label: 'Salesforce CLI (sf) command reference',
    query: 'Salesforce CLI sf command reference org list limits project retrieve start data query',
    category: 'devops',
    keywords: ['salesforce cli', 'sf cli', 'sf org', 'project retrieve', 'data query', 'command reference', 'target-org'],
    seedUrls: [
      'https://developer.salesforce.com/docs/platform/salesforce-cli-reference/guide/cli_reference_org_list_limits.html',
      'https://developer.salesforce.com/docs/platform/salesforce-cli-reference/guide/cli_reference_project_retrieve_start.html',
      'https://developer.salesforce.com/docs/platform/salesforce-cli-reference/guide/cli_reference_project_retrieve_preview.html',
      'https://developer.salesforce.com/docs/platform/salesforce-cli-reference/guide/cli_reference_data_query.html',
    ],
  },
];

const SALESFORCE_DOC_SITEMAP_SOURCES: SalesforceDocsSitemapSource[] = [
  {
    label: 'Salesforce Developer Docs sitemap',
    url: 'https://developer.salesforce.com/sitemap.xml',
    maxChildSitemaps: 4,
    maxEntries: 2500,
  },
  {
    label: 'Salesforce Architect sitemap',
    url: 'https://architect.salesforce.com/sitemap.xml',
    maxChildSitemaps: 4,
    maxEntries: 4000,
  },
];

export const SALESFORCE_DOC_TOPIC_ALIASES: Record<string, string[]> = {
  'emailmessage-object-fields': ['emailmessage-object-reference'],
  'emailmessage-fields': ['emailmessage-object-reference'],
  'emailmessage-reply-threading': ['emailmessage-threading-fields'],
  'emailmessage-threading': ['emailmessage-threading-fields'],
  'email-to-case-threading': ['emailmessage-threading-fields', 'email-to-salesforce', 'service-cloud-admin-setup'],
  'task-whatid-whoid': ['activity-task-relationships', 'standard-object-reference-sales-service'],
  'task-activity-relationships': ['activity-task-relationships'],
  'flow-record-update-fault': ['flow-fault-paths', 'flow-metadata-edge-cases'],
  'flow-trigger-emailmessage': ['flow-metadata-edge-cases', 'emailmessage-object-reference'],
  'apex-governor-limits-flow': ['apex-governor-limits', 'flow-order-recursion', 'flow-metadata-edge-cases'],
  // --- Solution-architect coverage expansion (2026-08) ---
  'well-architected': ['well-architected-framework'],
  'salesforce-well-architected': ['well-architected-framework'],
  'architecture-health': ['well-architected-framework', 'architecture-decision-guides'],
  'decision-guides': ['architecture-decision-guides'],
  'record-triggered-automation-guide': ['architecture-decision-guides', 'flow-order-recursion'],
  'soql-performance': ['soql-sosl-reference', 'soql-query-selectivity'],
  'sosl-search': ['soql-sosl-reference'],
  'order-of-execution': ['apex-order-of-execution'],
  'save-order': ['apex-order-of-execution'],
  'bulk-api': ['bulk-api-large-data'],
  'bulk-api-2-0': ['bulk-api-large-data'],
  'pk-chunking': ['bulk-api-large-data', 'ldv-performance-scale'],
  'data-migration': ['bulk-api-large-data', 'ldv-performance-scale'],
  'ldv': ['ldv-performance-scale'],
  'large-data-volumes': ['ldv-performance-scale'],
  'data-skew': ['ldv-performance-scale'],
  'skinny-tables': ['ldv-performance-scale'],
  'cdc': ['change-data-capture'],
  'change-events': ['change-data-capture', 'platform-events-pubsub'],
  'api-limits': ['api-limits-allocations', 'apex-governor-limits'],
  'sso': ['identity-sso-saml-oidc'],
  'sso-saml': ['identity-sso-saml-oidc'],
  'saml-setup': ['identity-sso-saml-oidc'],
  'openid-connect': ['identity-sso-saml-oidc'],
  'my-domain': ['identity-sso-saml-oidc'],
  'oauth': ['oauth-flows', 'connected-app-oauth'],
  'oauth-flow': ['oauth-flows', 'connected-app-oauth'],
  'jwt-bearer-flow': ['oauth-flows'],
  'client-credentials-flow': ['oauth-flows'],
  'shield-encryption': ['shield-platform-encryption'],
  'platform-encryption': ['shield-platform-encryption'],
  'event-monitoring': ['event-monitoring-session-security'],
  'eventlogfile': ['event-monitoring-session-security'],
  'transaction-security': ['event-monitoring-session-security'],
  'experience-cloud': ['experience-cloud-architecture'],
  'community-cloud': ['experience-cloud-architecture'],
  'lwr-sites': ['experience-cloud-lwr-sites'],
  'guest-user-security': ['experience-cloud-sharing-security'],
  'sharing-sets': ['experience-cloud-sharing-security'],
  'external-users': ['experience-cloud-sharing-security', 'sharing-model-rules'],
  'sfdx': ['sfdx-source-driven-dev'],
  'salesforce-dx': ['sfdx-source-driven-dev'],
  'source-tracking': ['sfdx-source-driven-dev', 'scratch-orgs-sandboxes'],
  '2gp': ['second-generation-packaging'],
  'unlocked-packages': ['second-generation-packaging'],
  'managed-packages': ['second-generation-packaging'],
  'devops-center': ['devops-center-release-mgmt'],
  'release-management': ['devops-center-release-mgmt', 'metadata-deploy-retrieve-source-format'],
  'ci-cd': ['devops-center-release-mgmt', 'sfdx-source-driven-dev'],
  'scratch-orgs': ['scratch-orgs-sandboxes'],
  'sandbox-strategy': ['scratch-orgs-sandboxes'],
  'omnistudio': ['omnistudio-overview-architecture'],
  'omnistudio-dataraptor': ['omnistudio-dataraptors'],
  'omnistudio-dataraptor-limits': ['omnistudio-dataraptors'],
  'dataraptor': ['omnistudio-dataraptors'],
  'integration-procedures': ['omnistudio-integration-procedures'],
  'omniscript': ['omnistudio-flexcards-omniscripts'],
  'flexcard': ['omnistudio-flexcards-omniscripts'],
  'agentforce': ['agentforce-agents-setup'],
  'einstein-copilot': ['agentforce-agents-setup'],
  'agent-actions': ['agentforce-agents-setup'],
  'prompt-builder': ['einstein-prompt-builder'],
  'prompt-templates': ['einstein-prompt-builder'],
  'einstein-trust-layer': ['einstein-prompt-builder', 'agentforce-agents-setup'],
  'agent-api': ['agentforce-agent-api'],
  'field-service': ['field-service-architecture'],
  'fsl': ['field-service-architecture'],
  'service-appointments': ['field-service-architecture'],
  'crm-analytics': ['crm-analytics-rest-data'],
  'tableau-crm': ['crm-analytics-rest-data'],
  'einstein-analytics': ['crm-analytics-rest-data'],
  'omni-channel': ['omni-channel-routing'],
  'skills-based-routing': ['omni-channel-routing'],
  // --- Docs grounding gap seeds (2.9.5) ---
  'org-limits': ['org-limits-allocations', 'api-limits-allocations'],
  'limits-forecast': ['org-limits-allocations'],
  'storage-limits': ['org-limits-allocations'],
  'data-storage': ['org-limits-allocations'],
  'file-storage': ['org-limits-allocations'],
  'custom-field-limits': ['org-limits-allocations'],
  'health-check': ['org-security-health-check'],
  'security-health-check': ['org-security-health-check'],
  'lead-conversion': ['lead-conversion'],
  'lead-convert': ['lead-conversion'],
  'email-limits': ['email-limits'],
  'eda': ['education-data-architecture'],
  'hed': ['education-data-architecture'],
  'education-data-architecture': ['education-data-architecture'],
  'education-cloud': ['education-data-architecture'],
  'sf-cli': ['salesforce-cli-reference'],
  'salesforce-cli': ['salesforce-cli-reference', 'sfdx-source-driven-dev'],
  'flow-trigger-order': ['flow-order-recursion'],
  'trigger-order': ['flow-order-recursion', 'apex-order-of-execution'],
  'before-save-flow': ['flow-order-recursion'],
  'record-triggered-flow': ['flow-order-recursion', 'flow-metadata-edge-cases'],
  'event-triggered-flow': ['flow-order-recursion', 'platform-events-pubsub'],
  'muting-permission-sets': ['permissions-least-privilege'],
  'permission-set-groups': ['permissions-least-privilege'],
  'profile-permissions': ['permissions-least-privilege'],
};

const SALESFORCE_DOC_PDF_BASE_URL = 'https://resources.docs.salesforce.com/latest/latest/en-us/sfdc/pdf';

export const SALESFORCE_DOC_PDF_SOURCES: SalesforceDocsPdfSource[] = [
  {
    id: 'metadata-api-developer-guide',
    title: 'Metadata API Developer Guide PDF',
    url: `${SALESFORCE_DOC_PDF_BASE_URL}/api_meta.pdf`,
    topicIds: [
      'metadata-api-versioning',
      'metadata-deploy-retrieve-source-format',
      'metadata-api-type-reference',
      'flow-metadata-edge-cases',
      'flow-fault-paths',
      'flow-tests-debugging',
      'permissions-least-privilege',
      'field-level-security-object-permissions',
      'custom-metadata-types',
      'record-types-picklists',
      'reports-dashboards-metadata',
      'workflow-approval-processes',
      'connected-app-oauth',
    ],
    keywords: ['metadata api', 'metadata type', 'flow', 'profile', 'permission set', 'custom object', 'custom field'],
  },
  {
    id: 'object-reference',
    title: 'Object Reference for the Salesforce Platform PDF',
    url: `${SALESFORCE_DOC_PDF_BASE_URL}/object_reference.pdf`,
    topicIds: [
      'standard-object-reference-sales-service',
      'sales-cloud-admin-setup',
      'service-cloud-admin-setup',
      'revenue-cloud-data-model',
      'emailmessage-object-reference',
      'emailmessage-threading-fields',
      'enhanced-email-activity-capture',
      'activity-task-relationships',
      'email-templates',
    ],
    keywords: ['object reference', 'standard object', 'account', 'contact', 'case', 'emailmessage', 'quote', 'order'],
  },
  {
    id: 'apex-developer-guide',
    title: 'Apex Developer Guide PDF',
    // Renamed by Salesforce from salesforce_apex_language_reference.pdf in the
    // Summer '26 doc refresh (2026-08-07).
    url: `${SALESFORCE_DOC_PDF_BASE_URL}/salesforce_apex_developer_guide.pdf`,
    topicIds: [
      'apex-governor-limits',
      'apex-sharing-security',
      'apex-crud-fls-user-mode',
      'apex-async-processing',
      'apex-testing',
      'apex-email-apis',
      'email-services',
    ],
    keywords: ['apex', 'governor limits', 'sharing', 'test methods', 'queueable', 'batch apex', 'email'],
  },
  {
    id: 'rest-api-developer-guide',
    title: 'REST API Developer Guide PDF',
    url: `${SALESFORCE_DOC_PDF_BASE_URL}/api_rest.pdf`,
    topicIds: [
      'metadata-deploy-retrieve-source-format',
      'connected-app-oauth',
      'data-cloud-ingestion-query',
      'standard-object-reference-sales-service',
    ],
    keywords: ['rest api', 'oauth', 'sobject', 'query', 'composite'],
  },
  {
    id: 'tooling-api-developer-guide',
    title: 'Tooling API Developer Guide PDF',
    url: `${SALESFORCE_DOC_PDF_BASE_URL}/api_tooling.pdf`,
    topicIds: [
      'validation-rules-formulas',
      'metadata-api-type-reference',
      'apex-testing',
      'flow-tests-debugging',
    ],
    keywords: ['tooling api', 'validation rule', 'apex test', 'metadata component'],
  },
  {
    id: 'sales-cloud-guide',
    title: 'Get Started with Sales Cloud Implementation Guide PDF',
    // sales_core.pdf was retired (now redirects to a Help article); the Sales
    // Cloud implementation guide is the surviving PDF for this ground.
    url: `${SALESFORCE_DOC_PDF_BASE_URL}/smb_sales_impl_guide.pdf`,
    topicIds: [
      'sales-cloud-admin-setup',
      'standard-object-reference-sales-service',
      'sharing-model-rules',
      'permissions-least-privilege',
    ],
    keywords: ['sales cloud', 'lead', 'opportunity', 'forecast', 'territory', 'account', 'contact'],
  },
  {
    id: 'entitlements-implementation-guide',
    title: 'Entitlement Management Implementation Guide PDF',
    url: `${SALESFORCE_DOC_PDF_BASE_URL}/salesforce_entitlements_implementation_guide.pdf`,
    topicIds: [
      'service-cloud-admin-setup',
      'standard-object-reference-sales-service',
      'workflow-approval-processes',
    ],
    keywords: ['entitlement', 'milestone', 'case', 'service cloud', 'support process'],
  },
  {
    id: 'knowledge-developer-guide',
    title: 'Salesforce Knowledge Developer Guide PDF',
    url: `${SALESFORCE_DOC_PDF_BASE_URL}/salesforce_knowledge_dev_guide.pdf`,
    topicIds: [
      'service-cloud-admin-setup',
      'standard-object-reference-sales-service',
      'data-cloud-development',
    ],
    keywords: ['knowledge', 'article', 'knowledge__kav', 'data category', 'service cloud'],
  },
  // salesforce_security_impl_guide.pdf and mc_data_management_and_analytics.pdf
  // were retired by Salesforce in 2026 (both now redirect to Help articles, no
  // replacement PDFs exist). Their topics stay covered by full-text HTML seeds:
  // the securityImplGuide atlas pages and the Marketing Cloud developer guides.
  {
    id: 'limits-quick-reference',
    title: 'Salesforce Limits Quick Reference PDF',
    url: `${SALESFORCE_DOC_PDF_BASE_URL}/salesforce_app_limits_cheatsheet.pdf`,
    topicIds: [
      'apex-governor-limits',
      'apex-async-processing',
      'soql-query-selectivity',
      'platform-events-pubsub',
      'org-limits-allocations',
    ],
    keywords: ['limits', 'governor limits', 'api limits', 'async', 'platform events'],
  },
  {
    id: 'bulk-api-guide',
    title: 'Bulk API Developer Guide PDF',
    url: `${SALESFORCE_DOC_PDF_BASE_URL}/api_asynch.pdf`,
    topicIds: [
      'data-cloud-ingestion-query',
      'soql-query-selectivity',
      'connected-app-oauth',
    ],
    keywords: ['bulk api', 'query', 'ingest', 'large data volumes', 'oauth'],
  },
  {
    id: 'integration-patterns-guide',
    title: 'Integration Patterns and Practices PDF',
    url: `${SALESFORCE_DOC_PDF_BASE_URL}/integration_patterns_and_practices.pdf`,
    topicIds: [
      'connected-app-oauth',
      'named-credentials-external-credentials',
      'platform-events-pubsub',
      'data-cloud-ingestion-query',
    ],
    keywords: ['integration', 'event bus', 'callout', 'oauth', 'pattern'],
  },
  {
    id: 'account-engagement-implementation-guide',
    title: 'Account Engagement Implementation Guide PDF',
    url: `${SALESFORCE_DOC_PDF_BASE_URL}/pardot_pbus_upgrade_implementation_guide.pdf`,
    topicIds: [
      'marketing-cloud-engagement-apis',
      'marketing-cloud-growth-development',
      'sales-cloud-admin-setup',
    ],
    keywords: ['account engagement', 'pardot', 'marketing cloud', 'campaign', 'lead'],
  },
  // --- Solution-architect coverage expansion (2026-08) ---
  {
    id: 'soql-sosl-reference-guide',
    title: 'SOQL and SOSL Reference PDF',
    url: `${SALESFORCE_DOC_PDF_BASE_URL}/salesforce_soql_sosl.pdf`,
    topicIds: [
      'soql-sosl-reference',
      'soql-query-selectivity',
    ],
    keywords: ['soql', 'sosl', 'select', 'query reference', 'relationship query', 'aggregate'],
  },
  {
    id: 'sfdx-developer-guide',
    title: 'Salesforce DX Developer Guide PDF',
    url: `${SALESFORCE_DOC_PDF_BASE_URL}/sfdx_dev.pdf`,
    topicIds: [
      'sfdx-source-driven-dev',
      'scratch-orgs-sandboxes',
      'devops-center-release-mgmt',
    ],
    keywords: ['salesforce dx', 'sfdx', 'scratch org', 'source tracking', 'cli', 'project'],
  },
  {
    id: 'second-generation-packaging-guide',
    title: 'Second-Generation Packaging Developer Guide PDF',
    url: `${SALESFORCE_DOC_PDF_BASE_URL}/pkg2_dev.pdf`,
    topicIds: [
      'second-generation-packaging',
      'sfdx-source-driven-dev',
    ],
    keywords: ['2gp', 'unlocked package', 'managed package', 'package version', 'namespace'],
  },
  {
    id: 'experience-cloud-developer-guide',
    title: 'Experience Cloud Developer Guide PDF',
    url: `${SALESFORCE_DOC_PDF_BASE_URL}/communities_dev.pdf`,
    topicIds: [
      'experience-cloud-architecture',
      'experience-cloud-sharing-security',
    ],
    keywords: ['experience cloud', 'community', 'experience builder', 'guest user', 'sharing set'],
  },
  {
    id: 'lwr-sites-guide',
    title: 'LWR Sites for Experience Cloud PDF',
    url: `${SALESFORCE_DOC_PDF_BASE_URL}/exp_cloud_lwr.pdf`,
    topicIds: [
      'experience-cloud-lwr-sites',
      'experience-cloud-architecture',
    ],
    keywords: ['lwr', 'lightning web runtime', 'experience cloud', 'site performance'],
  },
  {
    id: 'field-service-developer-guide',
    title: 'Field Service Developer Guide PDF',
    url: `${SALESFORCE_DOC_PDF_BASE_URL}/field_service_dev.pdf`,
    topicIds: [
      'field-service-architecture',
    ],
    keywords: ['field service', 'service appointment', 'work order', 'scheduling', 'service resource'],
  },
  {
    id: 'large-data-volumes-guide',
    title: 'Best Practices for Deployments with Large Data Volumes PDF',
    url: `${SALESFORCE_DOC_PDF_BASE_URL}/salesforce_large_data_volumes_bp.pdf`,
    topicIds: [
      'ldv-performance-scale',
      'bulk-api-large-data',
      'soql-query-selectivity',
    ],
    keywords: ['large data volumes', 'ldv', 'skinny table', 'pk chunking', 'index', 'performance'],
  },
  {
    id: 'crm-analytics-rest-guide',
    title: 'CRM Analytics REST API Developer Guide PDF',
    url: `${SALESFORCE_DOC_PDF_BASE_URL}/bi_dev_guide_rest.pdf`,
    topicIds: [
      'crm-analytics-rest-data',
    ],
    keywords: ['crm analytics', 'rest api', 'dataset', 'saql', 'lens', 'dashboard'],
  },
];

const storageAuth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/devstorage.read_write'],
});

async function getStorageAccessToken(): Promise<string> {
  const client = await storageAuth.getClient();
  const accessTokenResponse = await client.getAccessToken();
  const accessToken = typeof accessTokenResponse === 'string'
    ? accessTokenResponse
    : accessTokenResponse?.token;
  if (!accessToken) {
    throw new Error('Unable to acquire a Google Cloud Storage access token for Salesforce docs index storage.');
  }
  return accessToken;
}

async function authorizedStorageFetch(url: string, init: RequestInit): Promise<Response> {
  const accessToken = await getStorageAccessToken();
  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${accessToken}`);
  return fetch(url, { ...init, headers });
}

function storageBucketPath(): string {
  return encodeURIComponent(SALESFORCE_DOC_INDEX_BUCKET);
}

function storageObjectPath(): string {
  return encodeURIComponent(SALESFORCE_DOC_INDEX_PATH);
}

export async function writeSalesforceDocsIndex(index: SalesforceDocsIndex): Promise<void> {
  const uploadUrl = `https://storage.googleapis.com/upload/storage/v1/b/${storageBucketPath()}/o?uploadType=media&name=${storageObjectPath()}`;
  const response = await authorizedStorageFetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
    // Minified on purpose: the index is multi-MB and read on lookup paths.
    body: JSON.stringify(index),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to write Salesforce docs index to Cloud Storage (${response.status}): ${errorText}`);
  }
  cachedIndexState = null;
}

const SALESFORCE_DOC_MISS_PREFIX = 'salesforce-docs/misses/';

/**
 * Logs the topics one lookup could not answer with read text, as one object
 * under salesforce-docs/misses/<date>/ (server-only: storage rules deny the
 * path). The next index build reads them and goes looking for those pages.
 */
export async function recordSalesforceDocsMisses(misses: SalesforceDocsMiss[]): Promise<void> {
  if (misses.length === 0) return;
  const at = new Date().toISOString();
  const name = `${SALESFORCE_DOC_MISS_PREFIX}${at.slice(0, 10)}/${at}-${crypto.randomBytes(4).toString('hex')}.json`;
  const uploadUrl = `https://storage.googleapis.com/upload/storage/v1/b/${storageBucketPath()}/o?uploadType=media&name=${encodeURIComponent(name)}`;
  const response = await authorizedStorageFetch(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ version: 1, at, misses }),
  });
  if (!response.ok) {
    throw new Error(`Failed to record Salesforce docs misses (${response.status}): ${await response.text()}`);
  }
}

/** Misses logged after `sinceIso` (all of them when it is absent). */
export async function readSalesforceDocsMissesSince(sinceIso?: string): Promise<SalesforceDocsMiss[]> {
  const sinceDate = sinceIso ? sinceIso.slice(0, 10) : '';
  const names: string[] = [];
  let pageToken: string | undefined;
  do {
    const listUrl = `https://storage.googleapis.com/storage/v1/b/${storageBucketPath()}/o?prefix=${encodeURIComponent(SALESFORCE_DOC_MISS_PREFIX)}&fields=items(name),nextPageToken${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
    const response = await authorizedStorageFetch(listUrl, { method: 'GET' });
    if (!response.ok) {
      throw new Error(`Failed to list Salesforce docs misses (${response.status}): ${await response.text()}`);
    }
    const page = await response.json() as { items?: Array<{ name: string }>; nextPageToken?: string };
    for (const item of page.items || []) {
      // Object names start with the logging date, so older days are skipped unread.
      const day = item.name.slice(SALESFORCE_DOC_MISS_PREFIX.length, SALESFORCE_DOC_MISS_PREFIX.length + 10);
      if (!sinceDate || day >= sinceDate) names.push(item.name);
    }
    pageToken = page.nextPageToken;
  } while (pageToken);

  const misses: SalesforceDocsMiss[] = [];
  for (const name of names) {
    const response = await authorizedStorageFetch(
      `https://storage.googleapis.com/storage/v1/b/${storageBucketPath()}/o/${encodeURIComponent(name)}?alt=media`,
      { method: 'GET' },
    );
    if (!response.ok) continue;
    const logged = await response.json() as { misses?: SalesforceDocsMiss[] };
    for (const miss of logged.misses || []) {
      if (!sinceIso || miss.at > sinceIso) misses.push(miss);
    }
  }
  return misses;
}

const SALESFORCE_DOC_INDEX_CACHE_TTL_MS = 5 * 60 * 1000;

interface DownloadedSalesforceDocsIndex {
  index: SalesforceDocsIndex | null;
  generation?: string;
}

let cachedIndexState: {
  promise: Promise<DownloadedSalesforceDocsIndex>;
  validatedAtMs: number;
} | null = null;

async function fetchSalesforceDocsIndexGeneration(): Promise<string | null> {
  const metadataUrl = `https://storage.googleapis.com/storage/v1/b/${storageBucketPath()}/o/${storageObjectPath()}?fields=generation`;
  const response = await authorizedStorageFetch(metadataUrl, { method: 'GET' });
  if (response.status === 404) return null;
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to read Salesforce docs index metadata (${response.status}): ${errorText}`);
  }
  const metadata = await response.json() as { generation?: string };
  return metadata.generation || null;
}

async function downloadSalesforceDocsIndex(): Promise<DownloadedSalesforceDocsIndex> {
  try {
    const downloadUrl = `https://storage.googleapis.com/storage/v1/b/${storageBucketPath()}/o/${storageObjectPath()}?alt=media`;
    const response = await authorizedStorageFetch(downloadUrl, { method: 'GET' });
    if (response.status === 404) return { index: null };
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to read Salesforce docs index from Cloud Storage (${response.status}): ${errorText}`);
    }
    const generation = response.headers.get('x-goog-generation') || undefined;
    const parsed = JSON.parse(await response.text()) as SalesforceDocsIndex;
    return {
      index: parsed && parsed.version === SALESFORCE_DOC_INDEX_VERSION ? parsed : null,
      generation,
    };
  } catch (error) {
    console.warn('[salesforceDocsIndex] Failed to read Salesforce docs index:', error);
    return { index: null };
  }
}

function isOfficialSalesforceUrl(urlValue: string): boolean {
  try {
    const url = new URL(urlValue);
    return url.protocol === 'https:' && OFFICIAL_HOST_PATTERN.test(url.hostname);
  } catch {
    return false;
  }
}

export function canonicalizeUrl(urlValue: string): string | null {
  try {
    const url = new URL(urlValue);
    if (!isOfficialSalesforceUrl(url.toString())) return null;
    url.hash = '';
    for (const key of Array.from(url.searchParams.keys())) {
      // Prefix-match only true tracking-param families; `d`, `nc`, `cmpid` must be
      // exact — a prefix match would strip real params like `docId`/`deliverable`.
      if (/^(?:utm_|trk|mc_)/i.test(key) || /^(?:d|nc|cmpid)$/i.test(key)) {
        url.searchParams.delete(key);
      }
    }
    url.hostname = url.hostname.toLowerCase();
    return url.toString();
  } catch {
    return null;
  }
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&#38;/g, '&')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripHtmlTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractHtmlTitle(html: string): string | undefined {
  const navTitle = html.match(/<meta\s+name=["']nav-title["']\s+content=["']([^"']+)["']/i)?.[1];
  if (navTitle) return decodeXmlEntities(navTitle).trim().slice(0, 180);
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return title ? decodeXmlEntities(stripHtmlTags(title)).trim().slice(0, 180) : undefined;
}

function normalizeForMatch(value: string): string {
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    decoded = value;
  }
  return decoded
    .toLowerCase()
    .replace(/&[a-z]+;/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeTopicAliasKey(value: string): string {
  return normalizeForMatch(value).replace(/\s+/g, '-');
}

function aliasTopicIdsFor(topic: SalesforceDocsLookupTopicLike): string[] {
  const aliases = new Set<string>([topic.id]);
  const lookupValues = [topic.id, topic.label, topic.query].filter(Boolean);
  for (const value of lookupValues) {
    const key = normalizeTopicAliasKey(value);
    for (const alias of SALESFORCE_DOC_TOPIC_ALIASES[key] || []) {
      aliases.add(alias);
    }
  }
  return Array.from(aliases);
}

function indexedTopicsForAliasIds(aliasIds: string[]): SalesforceDocsIndexTopic[] {
  const aliasSet = new Set(aliasIds);
  return SALESFORCE_DOC_TOPICS.filter((indexedTopic) => aliasSet.has(indexedTopic.id));
}

function isNonEnglishLocalizedSalesforceUrl(urlValue: string): boolean {
  try {
    const url = new URL(urlValue);
    return /\/(?!en-us(?:\/|$))[a-z]{2}-[a-z]{2}(?:\/|$)/i.test(url.pathname);
  } catch {
    return false;
  }
}

function prefersDeveloperReferenceSources(category?: string): boolean {
  return Boolean(category && ['object_reference', 'apex', 'flow', 'metadata_api', 'email', 'integration'].includes(category));
}

function scoringCategoryForTopic(topic: SalesforceDocsLookupTopicLike, aliasTopicIds: string[]): string | undefined {
  return topic.category || indexedTopicsForAliasIds(aliasTopicIds)[0]?.category;
}

function extractTagValue(block: string, tagName: string): string | undefined {
  const match = block.match(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i'));
  return match?.[1] ? decodeXmlEntities(match[1]).trim() : undefined;
}

function isEligibleSitemapDocumentationUrl(urlValue: string): boolean {
  const url = new URL(urlValue);
  if (isNonEnglishLocalizedSalesforceUrl(urlValue)) return false;
  if (url.hostname === 'developer.salesforce.com') {
    return url.pathname.startsWith('/docs/');
  }
  if (url.hostname === 'architect.salesforce.com') {
    return !['/', '/connect', '/homepage'].includes(url.pathname);
  }
  return true;
}

function parseSitemapIndexUrls(xml: string): string[] {
  return Array.from(xml.matchAll(/<sitemap\b[\s\S]*?<\/sitemap>/gi))
    .map((match) => extractTagValue(match[0], 'loc'))
    .filter((urlValue): urlValue is string => Boolean(urlValue))
    .map((urlValue) => canonicalizeUrl(urlValue))
    .filter((urlValue): urlValue is string => Boolean(urlValue));
}

function parseSitemapEntries(xml: string, sitemapUrl: string, sourceLabel: string): SalesforceDocsSitemapEntry[] {
  return Array.from(xml.matchAll(/<url\b[\s\S]*?<\/url>/gi))
    .map((match) => {
      const urlValue = extractTagValue(match[0], 'loc');
      if (!urlValue) return null;
      const canonicalUrl = canonicalizeUrl(urlValue);
      if (!canonicalUrl) return null;
      if (!isEligibleSitemapDocumentationUrl(canonicalUrl)) return null;
      const entry: SalesforceDocsSitemapEntry = {
        url: canonicalUrl,
        sitemapUrl,
        sourceLabel,
      };
      const lastModified = extractTagValue(match[0], 'lastmod');
      if (lastModified) entry.lastModified = lastModified;
      return entry;
    })
    .filter((entry): entry is SalesforceDocsSitemapEntry => Boolean(entry));
}

function extractTitle(text: string, fallback: string): string {
  const heading = text.match(/^\s*#\s+(.+)$/m)?.[1]?.trim();
  if (heading) return heading.slice(0, 180);
  const firstSentence = text.split(/[.!?]\s+/)[0]?.trim();
  return firstSentence && firstSentence.length >= 8 ? firstSentence.slice(0, 180) : fallback;
}

function humanizeSalesforceDocId(id: string): string {
  return id
    .replace(/^(release-notes|platform|sf)\./i, '')
    .replace(/\.htm$/i, '')
    .replace(/^rn_\d+_/i, '')
    .replace(/^rn_/i, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

// Every Help article is rendered with headless Chrome at index-build time: the
// article body only exists after the Lightning page runs, and admin Help
// (storage, limits, security settings, Flow behaviour) has no developer-guide
// equivalent. Lookups never render (allowRendering: false).
function isRenderableSalesforceHelpArticleUrl(urlValue: string): boolean {
  return isHelpArticleUrl(urlValue);
}

function isSalesforceHelpReleaseNotesUrl(urlValue: string): boolean {
  try {
    const url = new URL(urlValue);
    const articleId = url.searchParams.get('id') || '';
    return url.hostname === 'help.salesforce.com' && (
      /release-notes/i.test(url.pathname)
      || /^release-notes\./i.test(articleId)
    );
  } catch {
    return false;
  }
}

function buildRenderableHelpArticleUrl(urlValue: string): string {
  const url = new URL(urlValue);
  if (!url.searchParams.get('language')) url.searchParams.set('language', 'en_US');
  if (!url.searchParams.get('type')) url.searchParams.set('type', '5');
  return url.toString();
}

function normalizeRenderedHelpTitle(value: string): string | undefined {
  const title = value
    .replace(/\s+\|\s+Salesforce.*$/i, '')
    .replace(/\s+-\s+Salesforce Help$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  return title ? title.slice(0, 180) : undefined;
}

function normalizeRenderedHelpText(value: string): string {
  const dropLinePatterns = [
    /^loading$/i,
    /^agentforce is temporarily unavailable\./i,
    /^read more$/i,
    /^pdf$/i,
    /^table of contents$/i,
    /^search$/i,
    /^search\[input:/i,
    /^filter by\b/i,
    /^select filters$/i,
    /^clear all$/i,
    /^done$/i,
    /^you are here:?$/i,
    /^image:/i,
    /^salesforce help$/i,
    /^docs$/i,
  ];

  return value
    .replace(/\u0000/g, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]{2,}/g, ' ').trim())
    .filter((line) => line && !dropLinePatterns.some((pattern) => pattern.test(line)))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isSalesforceHelpErrorText(text: string): boolean {
  return /we looked high and low|couldn['\u2019]t find that page/i.test(text);
}

function sameRenderedHelpLine(line: string, title: string): boolean {
  const normalize = (value: string) => value.replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
  return normalize(line) === normalize(title);
}

/**
 * Splits the article viewer's text into the page header (breadcrumb, guide
 * name) and the article itself, dropping site banners before the breadcrumb
 * and the feedback widget after the body. Knowledge articles (type=1) have no
 * breadcrumb and start at their title.
 */
export function extractRenderedHelpArticle(rawText: string, title?: string): { header: string; text: string } {
  let lines = rawText
    .replace(/\u0000/g, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]{2,}/g, ' ').trim());
  const feedbackIndex = lines.findIndex((line) => /^did this article solve your issue\??$/i.test(line));
  if (feedbackIndex >= 0) lines = lines.slice(0, feedbackIndex);

  let header: string[] = [];
  const crumbIndex = lines.findIndex((line) => /^you are here:?$/i.test(line));
  const titleIndex = title
    ? lines.findIndex((line, index) => index > crumbIndex && sameRenderedHelpLine(line, title))
    : -1;
  if (titleIndex >= 0) {
    header = lines.slice(0, titleIndex);
    lines = lines.slice(titleIndex);
  } else if (crumbIndex >= 0) {
    header = lines.slice(0, crumbIndex + 1);
    lines = lines.slice(crumbIndex + 1);
  }

  return {
    header: header.filter(Boolean).join('\n'),
    text: normalizeRenderedHelpText(lines.join('\n')),
  };
}

function extractSalesforceReleaseLabel(text: string): string | undefined {
  const match = text.match(/\b(Spring|Summer|Winter)\s+[\u2019']?([0-9]{2})\b/i);
  if (!match) return undefined;
  const season = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
  return `${season} '${match[2]}`;
}

/**
 * Salesforce release numbers step by 2 per release, three releases a year:
 * 264 = Winter '27, 266 = Spring '27, 268 = Summer '27 (208 = Summer '17).
 */
export function salesforceReleaseLabelForVersion(version: string | undefined): string | undefined {
  const releaseNumber = Number(version);
  if (!Number.isInteger(releaseNumber) || releaseNumber < 100 || releaseNumber % 2 !== 0) return undefined;
  const step = (releaseNumber - 264) / 2;
  const season = ['Winter', 'Spring', 'Summer'][((step % 3) + 3) % 3];
  const year = 27 + Math.floor(step / 3);
  if (year < 0 || year > 99) return undefined;
  return `${season} '${String(year).padStart(2, '0')}`;
}

function extractHelpReleaseVersion(urlValue: string): string | undefined {
  try {
    const release = new URL(urlValue).searchParams.get('release') || '';
    return release.match(/\b[0-9]{3}\b/)?.[0];
  } catch {
    return undefined;
  }
}

async function resolveSalesforceHelpChromeExecutable(chromium: any): Promise<string> {
  const configuredPath = process.env.CHROME_EXECUTABLE_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;
  if (configuredPath) return configuredPath;
  for (const localPath of LOCAL_CHROME_EXECUTABLE_PATHS) {
    if (existsSync(localPath)) return localPath;
  }
  return chromium.default.executablePath();
}

function isLocalChromeExecutablePath(executablePath: string): boolean {
  return LOCAL_CHROME_EXECUTABLE_PATHS.includes(executablePath)
    || /\/Applications\/.*Chrome/i.test(executablePath)
    || /\/Applications\/.*Chromium/i.test(executablePath);
}

let salesforceHelpBrowserPromise: Promise<any> | null = null;

async function getSalesforceHelpBrowser(): Promise<any> {
  if (!salesforceHelpBrowserPromise) {
    salesforceHelpBrowserPromise = (async () => {
      const chromium = await import('@sparticuz/chromium');
      const puppeteer = await import('puppeteer-core');
      const executablePath = await resolveSalesforceHelpChromeExecutable(chromium);
      const isLocalChrome = isLocalChromeExecutablePath(executablePath);
      const args = isLocalChrome
        ? [
          '--disable-setuid-sandbox',
          '--no-sandbox',
          '--no-first-run',
          '--no-default-browser-check',
          '--lang=en-US',
        ]
        : [
          ...(chromium.default.args || []),
          '--disable-setuid-sandbox',
          '--no-first-run',
          '--no-zygote',
          '--lang=en-US',
        ];
      return puppeteer.default.launch({
        executablePath,
        // sparticuz >=149 dropped its `headless` getter; 'shell' matches the
        // --headless='shell' flag it now bakes into `args`.
        headless: isLocalChrome ? true : 'shell',
        args: Array.from(new Set(args)),
      });
    })().catch((error) => {
      salesforceHelpBrowserPromise = null;
      throw error;
    });
  }
  return salesforceHelpBrowserPromise;
}

export async function closeSalesforceHelpBrowser(): Promise<void> {
  const browserPromise = salesforceHelpBrowserPromise;
  salesforceHelpBrowserPromise = null;
  if (!browserPromise) return;
  try {
    const browser = await browserPromise;
    await browser.close();
  } catch (error) {
    console.warn('[salesforceDocsIndex] Failed to close Salesforce Help browser', error);
  }
}

let lastHelpRenderAtMs = 0;

// Renders run one at a time with a pause between them: bursts trip Salesforce's
// IP cool-down, after which every Help and developer-docs request 403s for a while.
async function waitForHelpRenderSlot(): Promise<void> {
  const spacingMs = SALESFORCE_HELP_RENDER_SPACING_MS + Math.floor(Math.random() * 1000);
  const waitMs = lastHelpRenderAtMs + spacingMs - Date.now();
  if (waitMs > 0) await sleep(waitMs);
  lastHelpRenderAtMs = Date.now();
}

/** A Help article link as `https://help.salesforce.com/s/articleView?id=…&language=en_US&type=…`, or null. */
export function canonicalHelpArticleUrl(href: string): string | null {
  try {
    const url = new URL(href, 'https://help.salesforce.com/s/');
    if (url.hostname !== 'help.salesforce.com' || !url.pathname.endsWith('/articleView')) return null;
    const articleId = url.searchParams.get('id');
    if (!articleId || !/^[A-Za-z0-9._-]+$/.test(articleId)) return null;
    const language = url.searchParams.get('language');
    if (language && language !== 'en_US') return null;
    const type = url.searchParams.get('type') || '5';
    return `https://help.salesforce.com/s/articleView?id=${articleId}&language=en_US&type=${type}`;
  } catch {
    return null;
  }
}

async function fetchRenderedHelpArticleContent(urlValue: string): Promise<OfficialDocContent> {
  await waitForHelpRenderSlot();
  const browser = await getSalesforceHelpBrowser();
  const page = await browser.newPage();
  try {
    console.log('[salesforceDocsIndex] Rendering Salesforce Help article', { url: urlValue });
    await page.setViewport({ width: 1200, height: 900, deviceScaleFactor: 1 });
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US' });
    await page.goto(buildRenderableHelpArticleUrl(urlValue), {
      waitUntil: 'domcontentloaded',
      timeout: SALESFORCE_HELP_RENDER_TIMEOUT_MS,
    });
    // The article viewer renders its feedback widget after the body, so that
    // marker means the article is in; a long body is the fallback signal.
    await page.waitForFunction(
      () => {
        const viewerText = (document.querySelector('c-hc-article-viewer') as HTMLElement | null)?.innerText || '';
        if (/did this article solve your issue/i.test(viewerText)) return true;
        const text = document.body?.innerText || '';
        if (text.length > 4000) return true;
        return text.length > 1200 && /Release Notes|Release Updates|Features Become Available|About Data 360 Releases/i.test(text);
      },
      { timeout: Math.min(30000, SALESFORCE_HELP_RENDER_TIMEOUT_MS) },
    ).catch(() => undefined);
    // The guide's table of contents loads after the article; Knowledge articles (type=1) have none.
    if (new URL(urlValue).searchParams.get('type') !== '1') {
      await page.waitForFunction(
        () => {
          let count = 0;
          const walk = (root: Document | ShadowRoot) => {
            for (const element of Array.from(root.querySelectorAll('*'))) {
              if (element.tagName === 'A' && (element.getAttribute('href') || '').includes('articleView?id=')) count += 1;
              if (element.shadowRoot) walk(element.shadowRoot);
            }
          };
          walk(document);
          return count > 20;
        },
        { timeout: 8000 },
      ).catch(() => undefined);
    }

    const rendered = await page.evaluate(() => {
      // Table-of-contents and "See also" links live in nested shadow roots.
      const links: Array<{ href: string; title: string }> = [];
      const walk = (root: Document | ShadowRoot) => {
        for (const element of Array.from(root.querySelectorAll('*'))) {
          if (element.tagName === 'A') {
            const href = element.getAttribute('href') || '';
            const title = ((element as HTMLElement).innerText || element.textContent || '').replace(/\s+/g, ' ').trim();
            if (href.includes('articleView?') && title) links.push({ href, title });
          }
          if (element.shadowRoot) walk(element.shadowRoot);
        }
      };
      walk(document);
      const viewer = document.querySelector('c-hc-article-viewer') as HTMLElement | null;
      return {
        title: document.title || '',
        text: viewer?.innerText || document.body?.innerText || '',
        url: window.location.href,
        links,
      };
    });
    const title = normalizeRenderedHelpTitle(rendered.title);
    const article = extractRenderedHelpArticle(rendered.text, title);
    if (isSalesforceHelpErrorText(article.text)) {
      throw new Error('Rendered Salesforce Help article was an error page.');
    }
    if (article.text.length < FULL_TEXT_CONTENT_LENGTH_FLOOR) {
      throw new Error(`Rendered Salesforce Help article was too short (${article.text.length} chars)`);
    }

    const maxChars = positiveLimit(SALESFORCE_HELP_RENDER_MAX_CHARS);
    const text = maxChars ? article.text.slice(0, maxChars) : article.text;
    const documentationVersion = extractHelpReleaseVersion(rendered.url) || extractHelpReleaseVersion(urlValue);
    const discoveredLinks = new Map<string, string>();
    for (const link of rendered.links) {
      const canonical = canonicalHelpArticleUrl(link.href);
      if (canonical && !discoveredLinks.has(canonical)) discoveredLinks.set(canonical, link.title.slice(0, 180));
    }
    return {
      text,
      contentQuality: 'full_text',
      title: title || extractTitle(text, humanizeSalesforceDocId(new URL(urlValue).searchParams.get('id') || 'Salesforce Help Article')),
      // The page's own version only: its title, breadcrumb, or release number.
      // A season mentioned in the body ("available since Summer '17") is not it.
      releaseLabel: extractSalesforceReleaseLabel(`${rendered.title}\n${article.header}`)
        || salesforceReleaseLabelForVersion(documentationVersion),
      documentationVersion,
      discoveredLinks: Array.from(discoveredLinks, ([url, linkTitle]) => ({ url, title: linkTitle })),
      warnings: [
        maxChars && article.text.length > maxChars
          ? `Rendered Salesforce Help article text was truncated at ${maxChars} characters by SALESFORCE_DOCS_HELP_RENDER_MAX_CHARS.`
          : '',
      ].filter(Boolean),
    };
  } finally {
    await page.close().catch(() => undefined);
  }
}

function addDaysIso(isoValue: string, days: number): string {
  const base = Date.parse(isoValue);
  const timestamp = Number.isFinite(base) ? base : Date.now();
  return new Date(timestamp + days * 24 * 60 * 60 * 1000).toISOString();
}

function freshnessSignalFor(record: Pick<SalesforceDocsIndexRecord, 'etag' | 'lastModified'>): SalesforceDocsFreshnessSignal {
  if (record.etag) return 'etag';
  if (record.lastModified) return 'last_modified';
  return 'content_hash_only';
}

function pdfRefreshStatus(record: Pick<SalesforceDocsIndexRecord, 'retrievedAt' | 'refreshCadenceDays'>, now = Date.now()): SalesforceDocsPdfRefreshStatus {
  const retrievedAtMs = Date.parse(record.retrievedAt);
  const cadenceDays = record.refreshCadenceDays || PDF_REFRESH_CADENCE_DAYS;
  if (!Number.isFinite(retrievedAtMs)) return 'overdue';
  const ageMs = now - retrievedAtMs;
  const cadenceMs = cadenceDays * 24 * 60 * 60 * 1000;
  if (ageMs > cadenceMs * PDF_REFRESH_OVERDUE_MULTIPLIER) return 'overdue';
  if (ageMs > cadenceMs) return 'due';
  return 'fresh';
}

function inferPdfVersion(text: string): { apiVersion?: string; releaseLabel?: string; documentationVersion?: string } {
  const match = text.match(/Version\s+([0-9]+(?:\.[0-9]+)?)\s*,\s*([^.\n\r]+?)(?:\s+Last updated|\s{2,}|$)/i);
  if (!match) return {};
  const releaseLabel = match[2].replace(/\s+/g, ' ').trim();
  return {
    apiVersion: match[1],
    releaseLabel,
    documentationVersion: match[1],
  };
}

function inferSourceType(urlValue: string): SalesforceDocsIndexRecord['sourceType'] {
  const url = new URL(urlValue);
  if (url.pathname.endsWith('.pdf')) {
    return /release[-_]?notes/i.test(url.pathname) ? 'release_notes_pdf' : 'pdf_guide';
  }
  if (url.hostname === 'www.salesforce.com' || url.pathname.includes('/releases')) return 'release_page';
  if (isSalesforceHelpReleaseNotesUrl(urlValue)) return 'release_notes';
  if (url.hostname === 'developer.salesforce.com') return 'developer_doc';
  if (url.hostname === 'help.salesforce.com') return 'help_doc';
  if (url.hostname === 'architect.salesforce.com') return 'architect_doc';
  return 'official_doc';
}

/**
 * Standard forward-looking-statements / safe-harbor boilerplate appears on GA
 * release-notes and docs pages; it must not flag the whole document as preview.
 * Sentences carrying that boilerplate are dropped before status matching.
 */
function stripSalesforceSafeHarborText(text: string): string {
  return text
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !/forward-looking statements?|unreleased services or features|purchase decisions?.{0,120}(?:currently|generally) available/i.test(sentence))
    .join(' ');
}

export function inferSalesforceDocumentationStatus(text: string): SalesforceDocsIndexRecord['status'] {
  const normalized = stripSalesforceSafeHarborText(text.replace(/\s+/g, ' '));
  if (
    /\b(?:developer|public|private)\s+preview\b/i.test(normalized)
    || /\b(?:this|the)\s+(?:release|feature|document|content|functionality|release note)\s+is\s+(?:currently\s+)?(?:in\s+)?(?:preview|beta|pilot)\b/i.test(normalized)
    || /\b(?:these|the)\s+features?\b.{0,160}\b(?:preview|beta|pilot|do not become generally available|don't become generally available|can't guarantee general availability)\b/i.test(normalized)
    || /(?:do not|don't|can't|cannot)\s+(?:become\s+)?generally available/i.test(normalized)
  ) {
    return 'preview';
  }
  if (/generally available|\bGA\b|current release|latest release/i.test(text)) {
    return 'ga';
  }
  return 'unknown';
}

function sourceWarnings(text: string, status: SalesforceDocsIndexRecord['status']): string[] {
  const warnings: string[] = [];
  if (status === 'preview') {
    warnings.push('Source contains preview, beta, pilot, or not-yet-GA language; recommendations must be confidence-downgraded.');
  }
  if (/links point to material from the previous release|previous-release documentation|previous release/i.test(text)) {
    warnings.push('Source warns that linked documentation may point to previous-release material.');
  }
  return warnings;
}

function confidenceImpactForSource(
  status: SalesforceDocsIndexRecord['status'],
  warnings: string[],
): SalesforceDocsConfidenceImpact {
  if (warnings.some((warning) => /older than|stale|due|overdue/i.test(warning))) return 'stale-risk';
  if (status === 'preview' || warnings.some((warning) => /preview|beta|pilot|not-yet-GA|not yet GA/i.test(warning))) {
    return 'preview-risk';
  }
  if (warnings.some((warning) => /previous-release|previous release|previous/i.test(warning))) {
    return 'release-link-risk';
  }
  return 'supports';
}

function excerptFor(text: string, topic: SalesforceDocsIndexTopic): string {
  const terms = [...topic.keywords, ...topic.query.split(/[^a-z0-9]+/i)]
    .map((term) => term.toLowerCase())
    .filter((term) => term.length >= 4);
  const lower = text.toLowerCase();
  const index = terms
    .map((term) => lower.indexOf(term))
    .filter((position) => position >= 0)
    .sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, index - 220);
  return `${start > 0 ? '...' : ''}${text.slice(start, start + 700)}${start + 700 < text.length ? '...' : ''}`;
}

function fetchErrorMessage(error: any, fallback = 'Unknown fetch failure'): string {
  const message = error?.message || fallback;
  const cause = error?.cause;
  const causeCode = typeof cause?.code === 'string' ? cause.code : undefined;
  const causeMessage = typeof cause?.message === 'string' ? cause.message : undefined;
  if (causeCode && causeMessage) return `${message}: ${causeCode} ${causeMessage}`;
  if (causeCode) return `${message}: ${causeCode}`;
  if (causeMessage) return `${message}: ${causeMessage}`;
  return message;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchTextWithCurl(url: string, timeoutMs: number): Promise<string> {
  const timeoutSeconds = Math.max(5, Math.ceil(timeoutMs / 1000));
  const result = await execFile('curl', ['-L', '--fail', '--silent', '--show-error', '--max-time', String(timeoutSeconds), url], {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  }) as { stdout: string; stderr: string };
  return result.stdout;
}

async function fetchText(url: string, timeoutMs = 20000, maxAttempts = 3): Promise<string> {
  if (!isOfficialSalesforceUrl(url)) {
    throw new Error(`URL is not an allowed official Salesforce URL: ${url}`);
  }
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'text/html, text/plain, application/xhtml+xml, application/json, */*',
          'User-Agent': 'SymposiumAI-SalesforceDocsIndexer/1.0 (+https://app.symposiumai.app)',
        },
      });
      if (response.ok) {
        return await response.text();
      }
      lastError = new Error(`HTTP ${response.status}`);
      if (ALLOW_CURL_TEXT_FETCH && response.status === 403) break;
      if (![403, 429, 500, 502, 503, 504].includes(response.status) || attempt === maxAttempts - 1) {
        break;
      }
    } catch (error: any) {
      lastError = error instanceof Error ? new Error(fetchErrorMessage(error)) : new Error(fetchErrorMessage(error, 'Unknown fetch failure'));
      if (ALLOW_CURL_TEXT_FETCH && /UNABLE_TO_VERIFY|fetch failed/i.test(lastError.message)) break;
      if (attempt === maxAttempts - 1) break;
    } finally {
      clearTimeout(timeout);
    }
    await sleep(750 * (attempt + 1));
  }
  if (ALLOW_CURL_TEXT_FETCH) {
    try {
      console.warn('[salesforceDocsIndex] Falling back to curl for Salesforce text fetch', {
        url,
        fetchError: lastError?.message,
      });
      return await fetchTextWithCurl(url, timeoutMs);
    } catch (curlError: any) {
      throw new Error(`Text fetch failed via fetch (${lastError?.message || 'unknown'}) and curl fallback (${fetchErrorMessage(curlError, 'Unknown curl text fetch failure')})`);
    }
  }
  throw lastError || new Error('Unknown fetch failure');
}

function parseCurlHeaderValue(headers: string, name: string): string | undefined {
  const pattern = new RegExp(`^${name}:\\s*(.+)$`, 'im');
  return headers.match(pattern)?.[1]?.trim();
}

async function fetchPdfDocumentWithCurl(url: string): Promise<FetchedPdfDocument> {
  const [bodyResult, headResult] = await Promise.all([
    execFile('curl', ['-L', '--fail', '--silent', '--show-error', '--max-time', '90', url], {
      encoding: 'buffer',
      maxBuffer: 80 * 1024 * 1024,
    } as any) as Promise<{ stdout: Buffer; stderr: Buffer }>,
    execFile('curl', ['-I', '-L', '--silent', '--show-error', '--max-time', '30', url], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
    }) as Promise<{ stdout: string; stderr: string }>,
  ]);
  const bytes = new Uint8Array(bodyResult.stdout);
  if (bytes.length < 1000) {
    throw new Error(`curl PDF response was too short (${bytes.length} bytes)`);
  }
  const signature = Buffer.from(bytes.slice(0, 4)).toString('utf8');
  if (signature !== '%PDF') {
    throw new Error(`curl PDF response did not start with a PDF signature; content-type was ${parseCurlHeaderValue(headResult.stdout, 'content-type') || 'unknown'}`);
  }
  return {
    bytes,
    contentType: parseCurlHeaderValue(headResult.stdout, 'content-type'),
    etag: parseCurlHeaderValue(headResult.stdout, 'etag'),
    lastModified: parseCurlHeaderValue(headResult.stdout, 'last-modified'),
    contentByteLength: Number(parseCurlHeaderValue(headResult.stdout, 'content-length')) || bytes.length,
  };
}

async function fetchPdfDocument(url: string, timeoutMs = 60000): Promise<FetchedPdfDocument> {
  if (!isOfficialSalesforceUrl(url)) {
    throw new Error(`URL is not an allowed official Salesforce URL: ${url}`);
  }
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/pdf, application/octet-stream, */*',
          'User-Agent': 'SymposiumAI-SalesforceDocsIndexer/1.0 (+https://app.symposiumai.app)',
        },
      });
      if (response.ok) {
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.length < 1000) {
          throw new Error(`PDF response was too short (${bytes.length} bytes)`);
        }
        const signature = Buffer.from(bytes.slice(0, 4)).toString('utf8');
        if (signature !== '%PDF') {
          throw new Error(`PDF response did not start with a PDF signature; content-type was ${response.headers.get('content-type') || 'unknown'}`);
        }
        return {
          bytes,
          contentType: response.headers.get('content-type') || undefined,
          etag: response.headers.get('etag') || undefined,
          lastModified: response.headers.get('last-modified') || undefined,
          contentByteLength: Number(response.headers.get('content-length')) || bytes.length,
        };
      }
      lastError = new Error(`HTTP ${response.status}`);
      if ((ALLOW_CURL_PDF_FETCH || ALLOW_CURL_TEXT_FETCH) && response.status === 403) break;
      if (![403, 429, 500, 502, 503, 504].includes(response.status) || attempt === 2) {
        break;
      }
    } catch (error: any) {
      lastError = error instanceof Error ? new Error(fetchErrorMessage(error, 'Unknown PDF fetch failure')) : new Error(fetchErrorMessage(error, 'Unknown PDF fetch failure'));
      if ((ALLOW_CURL_PDF_FETCH || ALLOW_CURL_TEXT_FETCH) && /UNABLE_TO_VERIFY|fetch failed/i.test(lastError.message)) break;
      if (attempt === 2) break;
    } finally {
      clearTimeout(timeout);
    }
    await sleep(1250 * (attempt + 1));
  }
  if (ALLOW_CURL_PDF_FETCH || ALLOW_CURL_TEXT_FETCH) {
    try {
      console.warn('[salesforceDocsIndex] Falling back to curl for Salesforce PDF fetch', {
        url,
        fetchError: lastError?.message,
      });
      return await fetchPdfDocumentWithCurl(url);
    } catch (curlError: any) {
      throw new Error(`PDF fetch failed via fetch (${lastError?.message || 'unknown'}) and curl fallback (${fetchErrorMessage(curlError, 'Unknown curl PDF fetch failure')})`);
    }
  }
  throw lastError || new Error('Unknown PDF fetch failure');
}

async function fetchOfficialJson<T>(url: string, options: { timeoutMs?: number; maxAttempts?: number } = {}): Promise<T> {
  const text = await fetchText(url, options.timeoutMs ?? 20000, options.maxAttempts ?? 3);
  return JSON.parse(text) as T;
}

let pdfJsPromise: Promise<any> | null = null;

async function loadPdfJs(): Promise<any> {
  if (!pdfJsPromise) {
    pdfJsPromise = import('pdfjs-dist/legacy/build/pdf.mjs');
  }
  return pdfJsPromise;
}

function normalizeExtractedPdfText(text: string): string {
  return text
    .replace(/\u0000/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function positiveLimit(value: number): number | null {
  return Number.isFinite(value) && value > 0 ? value : null;
}

function buildTextChunks(text: string, sourceId: string): SalesforceDocsIndexTextChunk[] {
  const targetChars = Math.max(1000, positiveLimit(PDF_TEXT_CHUNK_TARGET_CHARS) || 3500);
  const overlapChars = Math.min(Math.max(0, positiveLimit(PDF_TEXT_CHUNK_OVERLAP_CHARS) || 350), Math.floor(targetChars / 3));
  const step = Math.max(1, targetChars - overlapChars);
  const chunks: SalesforceDocsIndexTextChunk[] = [];
  for (let start = 0; start < text.length; start += step) {
    const chunkText = text.slice(start, start + targetChars).trim();
    if (chunkText.length < 80) continue;
    chunks.push({
      id: `${sourceId}-chunk-${chunks.length + 1}`,
      ordinal: chunks.length + 1,
      text: chunkText,
      contentLength: chunkText.length,
      responseHash: crypto.createHash('sha256').update(chunkText).digest('hex'),
    });
  }
  return chunks;
}

async function extractPdfText(bytes: Uint8Array, sourceId: string): Promise<ExtractedPdfText> {
  const pdfjs = await loadPdfJs();
  const document = await pdfjs.getDocument({
    data: bytes,
    disableWorker: true,
    isEvalSupported: false,
    useWorkerFetch: false,
  }).promise;
  const pageCount = Number(document.numPages) || 0;
  const configuredPageLimit = positiveLimit(PDF_EXTRACT_MAX_PAGES);
  const configuredCharLimit = positiveLimit(PDF_EXTRACT_MAX_CHARS);
  const pageLimit = configuredPageLimit ? Math.min(pageCount, configuredPageLimit) : pageCount;
  let extractedPageCount = 0;
  let extractedTextLength = 0;
  const pageChunks: string[] = [];
  const warnings: string[] = [];

  for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item: any) => typeof item?.str === 'string' ? item.str : '')
      .filter(Boolean)
      .join(' ');
    if (pageText.trim()) pageChunks.push(pageText);
    extractedPageCount = pageNumber;
    extractedTextLength += pageText.length;
    if (configuredCharLimit && extractedTextLength >= configuredCharLimit) break;
  }

  const normalizedText = normalizeExtractedPdfText(pageChunks.join('\n\n'));
  const text = configuredCharLimit ? normalizedText.slice(0, configuredCharLimit) : normalizedText;
  if (pageCount > extractedPageCount) {
    warnings.push(`PDF has ${pageCount} page(s); only the first ${extractedPageCount} page(s) were extracted for the documentation index.`);
  }
  if (configuredCharLimit && text.length >= configuredCharLimit) {
    warnings.push(`PDF text extraction was truncated at ${configuredCharLimit} characters for index size control.`);
  }

  return {
    text,
    chunks: buildTextChunks(text, sourceId),
    pageCount,
    extractedPageCount,
    warnings,
  };
}

function parseDeveloperDocsReference(urlValue: string): { docId: string; deliverable: string; contentDocumentId: string } | null {
  try {
    const url = new URL(urlValue);
    if (url.hostname !== 'developer.salesforce.com') return null;
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] !== 'docs' || parts.length < 4) return null;
    if (!parts[1].startsWith('atlas.')) return null;
    return {
      docId: parts[1],
      deliverable: parts[2],
      contentDocumentId: parts.slice(3).join('/'),
    };
  } catch {
    return null;
  }
}

async function fetchDeveloperDocsContent(
  urlValue: string,
  options: { timeoutMs?: number; maxAttempts?: number } = {},
): Promise<OfficialDocContent | null> {
  const reference = parseDeveloperDocsReference(urlValue);
  if (!reference) return null;

  type DeveloperDocumentResponse = {
    content?: string;
    content_document_id?: string;
    deliverable?: string;
    title?: string;
    doc_title?: string;
    version?: {
      version_text?: string;
      release_version?: string;
      doc_version?: string;
    };
  };

  type DeveloperContentResponse = {
    content?: string;
    title?: string;
  };

  const documentUrl = `https://developer.salesforce.com/docs/get_document/${encodeURIComponent(reference.docId)}`;
  const document = await fetchOfficialJson<DeveloperDocumentResponse>(documentUrl, options);
  const documentVersion = document.version?.doc_version;
  const releaseLabel = document.version?.version_text;
  const apiVersion = document.version?.release_version;
  const expectedContentId = reference.contentDocumentId.replace(/\.htm$/i, '');
  const rootContentId = document.content_document_id?.replace(/\.htm$/i, '');

  let title = document.title || document.doc_title;
  let html = rootContentId === expectedContentId ? document.content : undefined;

  if (!html) {
    const deliverable = document.deliverable || reference.deliverable;
    if (!documentVersion) {
      throw new Error(`Developer docs API did not return a documentation version for ${reference.docId}`);
    }
    const contentUrl = [
      'https://developer.salesforce.com/docs/get_document_content',
      encodeURIComponent(deliverable),
      encodeURIComponent(reference.contentDocumentId),
      'en-us',
      encodeURIComponent(documentVersion),
    ].join('/');
    const content = await fetchOfficialJson<DeveloperContentResponse>(contentUrl, options);
    html = content.content;
    title = content.title || title;
  }

  const text = stripHtmlTags(html || '');
  if (text.length < FULL_TEXT_CONTENT_LENGTH_FLOOR) {
    throw new Error(`Developer docs API content was too short (${text.length} chars)`);
  }

  return {
    // Whole page: long reference pages (Flow metadata) are chunked, not cut.
    text,
    contentQuality: 'full_text',
    title,
    apiVersion,
    releaseLabel,
    documentationVersion: documentVersion,
    warnings: releaseLabel && /preview|beta|pilot/i.test(releaseLabel)
      ? [`Developer documentation version is ${releaseLabel}; preview content must be confidence-downgraded.`]
      : [],
  };
}

function isHelpArticleUrl(urlValue: string): boolean {
  try {
    const url = new URL(urlValue);
    return url.hostname === 'help.salesforce.com'
      && url.pathname.includes('/articleView')
      && Boolean(url.searchParams.get('id'));
  } catch {
    return false;
  }
}

export type OfficialDocRetrievalPlan = 'developer_api' | 'rendered_help' | 'help_unrendered' | 'raw_html';

/**
 * An official page that was found but whose text was not read: a Help article
 * outside the index (its body only exists after rendering, which lookups never
 * do), or a page Salesforce blocked. It is never evidence.
 */
export class SalesforceDocNotReadError extends Error {
  constructor(readonly url: string, readonly reason: 'not_rendered' | 'blocked', message: string) {
    super(message);
    this.name = 'SalesforceDocNotReadError';
  }
}

export interface FetchOfficialDocOptions {
  /** Headless-Chrome rendering of help.salesforce.com release-notes articles. Index build only — never enable inside executeTool. */
  allowRendering?: boolean;
  fetchTimeoutMs?: number;
  maxAttempts?: number;
}

export function officialDocRetrievalPlan(
  urlValue: string,
  options: { allowRendering?: boolean } = {},
): OfficialDocRetrievalPlan {
  const allowRendering = options.allowRendering !== false;
  if (parseDeveloperDocsReference(urlValue)) return 'developer_api';
  if (allowRendering && isRenderableSalesforceHelpArticleUrl(urlValue)) return 'rendered_help';
  if (isHelpArticleUrl(urlValue)) return 'help_unrendered';
  return 'raw_html';
}

export async function fetchOfficialDocContent(
  url: string,
  options: FetchOfficialDocOptions = {},
): Promise<OfficialDocContent> {
  const plan = officialDocRetrievalPlan(url, options);
  const timeoutMs = options.fetchTimeoutMs ?? 20000;
  const maxAttempts = options.maxAttempts ?? 3;
  let developerDocsApiError: string | undefined;

  if (plan === 'developer_api') {
    try {
      const developerContent = await fetchDeveloperDocsContent(url, { timeoutMs, maxAttempts });
      if (developerContent) return developerContent;
    } catch (error: any) {
      developerDocsApiError = error?.message || 'Unknown developer docs API failure';
    }
  }

  if (plan === 'rendered_help') {
    // A render that fails is a failure: the article was not read.
    return fetchRenderedHelpArticleContent(url);
  }

  if (plan === 'help_unrendered') {
    throw new SalesforceDocNotReadError(
      url,
      'not_rendered',
      'Salesforce Help article bodies are read when the docs index is built, and this article is not in the index yet.',
    );
  }

  let html: string;
  try {
    html = await fetchText(url, timeoutMs, maxAttempts);
  } catch (error: any) {
    if (/HTTP 403/.test(error?.message || '')) {
      throw new SalesforceDocNotReadError(url, 'blocked', `Salesforce blocked this page (HTTP 403): ${error.message}`);
    }
    throw error;
  }
  const normalized = stripHtmlTags(html);
  // Below the full-text floor is a site shell ("Salesforce Developers"), not a page.
  if (normalized.length < FULL_TEXT_CONTENT_LENGTH_FLOOR) {
    throw new Error(`Fetched content was too short (${normalized.length} chars)`);
  }
  return {
    text: normalized,
    contentQuality: 'full_text',
    title: extractHtmlTitle(html),
    warnings: developerDocsApiError
      ? [`Developer docs JSON endpoint failed (${developerDocsApiError}); indexed rendered official HTML fallback.`]
      : [],
  };
}

async function fetchSitemapXml(url: string): Promise<string> {
  const xml = await fetchText(url, 30000);
  if (!/<loc\b/i.test(xml)) {
    throw new Error('Sitemap response did not contain any loc entries');
  }
  return xml;
}

async function collectSitemapEntries(
  source: SalesforceDocsSitemapSource,
  failures: SalesforceDocsIndex['failures'],
): Promise<SalesforceDocsSitemapEntry[]> {
  const entries: SalesforceDocsSitemapEntry[] = [];
  try {
    const rootXml = await fetchSitemapXml(source.url);
    const childSitemaps = parseSitemapIndexUrls(rootXml).slice(0, source.maxChildSitemaps);
    if (childSitemaps.length === 0) {
      return parseSitemapEntries(rootXml, source.url, source.label).slice(0, source.maxEntries);
    }

    for (const childUrl of childSitemaps) {
      if (entries.length >= source.maxEntries) break;
      try {
        const childXml = await fetchSitemapXml(childUrl);
        entries.push(...parseSitemapEntries(childXml, childUrl, source.label));
      } catch (error: any) {
        failures.push({
          topicId: 'sitemap-discovery',
          url: childUrl,
          error: error?.message || 'Unknown sitemap fetch failure',
        });
      }
    }
  } catch (error: any) {
    failures.push({
      topicId: 'sitemap-discovery',
      url: source.url,
      error: error?.message || 'Unknown sitemap fetch failure',
    });
  }
  return entries.slice(0, source.maxEntries);
}

async function discoverSitemapEntries(failures: SalesforceDocsIndex['failures']): Promise<SalesforceDocsSitemapEntry[]> {
  const entries: SalesforceDocsSitemapEntry[] = [];
  const seen = new Set<string>();
  for (const source of SALESFORCE_DOC_SITEMAP_SOURCES) {
    const sourceEntries = await collectSitemapEntries(source, failures);
    for (const entry of sourceEntries) {
      if (seen.has(entry.url)) continue;
      seen.add(entry.url);
      entries.push(entry);
    }
  }
  return entries;
}

function scoreSitemapEntryForTopic(entry: SalesforceDocsSitemapEntry, topic: SalesforceDocsIndexTopic): number {
  let score = 0;
  const url = new URL(entry.url);
  if (isNonEnglishLocalizedSalesforceUrl(entry.url)) return 0;
  const idParam = url.searchParams.get('id') || '';
  const releaseParam = url.searchParams.get('release') || '';
  const haystack = normalizeForMatch(`${url.hostname} ${url.pathname} ${idParam} ${releaseParam} ${entry.sourceLabel}`);
  const category = normalizeForMatch(topic.category);

  if (category && haystack.includes(category)) score += 5;
  if (topic.id.startsWith('apex-') && haystack.includes('apex')) score += 10;
  if (topic.id.startsWith('flow-') && /(flow|process|automation|record triggered)/.test(haystack)) score += 10;
  if (topic.id.includes('permissions') && /(permission|profile|userperm|security)/.test(haystack)) score += 10;
  if (topic.id.includes('lightning') && /(lwc|lightning|security|dom)/.test(haystack)) score += 10;
  if (topic.id.includes('metadata') && /(metadata|api|version|package)/.test(haystack)) score += 10;
  if (topic.id.includes('release') && /(release notes|release notes|rn |release)/.test(haystack)) score += 12;
  if (topic.id.includes('sales-cloud') && /(sales cloud|sales|account|contact|lead|opportunity|campaign|forecast|territory)/.test(haystack)) score += 14;
  if (topic.id.includes('service-cloud') && /(service cloud|service|case|entitlement|milestone|knowledge|queue|routing)/.test(haystack)) score += 14;
  if (topic.id.includes('data-cloud') && /(data cloud|c360|customer 360|data model|dmo|dlo|ingest|extract|identity)/.test(haystack)) score += 14;
  if (topic.id.includes('revenue-cloud') && /(revenue cloud|cpq|quote|order|product|price|catalog|contract|asset|industries|cme)/.test(haystack)) score += 14;
  if (topic.id.includes('marketing-cloud') && /(marketing cloud|engagement|growth|dataextension|subscriber|journey|content api|soap|rest)/.test(haystack)) score += 14;
  if (topic.id === 'standard-object-reference-sales-service' && /(object reference|sforce api objects|account|contact|lead|opportunity|case|task|event|quote|order)/.test(haystack)) score += 16;
  if (topic.id === 'metadata-api-type-reference' && /(metadata coverage|metadata types|api meta|customobject|customfield|flow|profile|permissionset|layout|flexipage)/.test(haystack)) score += 16;
  if (topic.id === 'flow-metadata-edge-cases' && /(flow|visual workflow|flowdefinition|flowsettings|flowtest|record triggered|autolaunched|subflow)/.test(haystack)) score += 16;
  if (topic.id.includes('omnistudio') && /(omnistudio|dataraptor|omniscript|flexcard|integration procedure|vlocity)/.test(haystack)) score += 14;
  if (topic.id.includes('experience-cloud') && /(experience cloud|communities|community|lwr|experience builder|guest user)/.test(haystack)) score += 14;
  if (topic.category === 'identity' && /(identity|sso|saml|oauth|openid|login|my domain|mfa)/.test(haystack)) score += 12;
  if (topic.category === 'devops' && /(sfdx|salesforce dx|devops|package|packaging|scratch org|sandbox|source tracking|deploy)/.test(haystack)) score += 12;
  if (topic.category === 'agentforce' && /(agentforce|einstein|genai|generative|prompt|copilot|agent)/.test(haystack)) score += 14;
  if (topic.id === 'field-service-architecture' && /(field service|service appointment|work order|scheduling|dispatcher)/.test(haystack)) score += 14;
  if (topic.id === 'crm-analytics-rest-data' && /(analytics|bi |saql|dataset|dataflow|tableau)/.test(haystack)) score += 14;
  if (/(bulk-api|ldv|streaming-api|change-data-capture)/.test(topic.id) && /(bulk api|large data|streaming|cometd|change data capture|cdc|pk chunking)/.test(haystack)) score += 12;
  if (/(shield|event-monitoring)/.test(topic.id) && /(shield|encryption|event monitoring|eventlogfile|transaction security|session)/.test(haystack)) score += 12;
  if (/(email|emailmessage|activity|task|outlook|gmail)/.test(topic.id) && /(email|emailmessage|emailmessageid|activity|task|outlook|gmail|emailservices)/.test(haystack)) score += 14;
  if (topic.category === 'object_reference' && /(object reference|sforce api objects|object_reference)/.test(haystack)) score += 12;
  if (topic.category === 'integration' && /(setup|integration|emailadmin|outlook|gmail|activity capture)/.test(haystack)) score += 8;

  for (const keyword of topic.keywords) {
    const normalizedKeyword = normalizeForMatch(keyword);
    if (!normalizedKeyword || normalizedKeyword.length < 4) continue;
    if (haystack.includes(normalizedKeyword)) {
      score += normalizedKeyword.includes(' ') ? 8 : 4;
    }
  }

  for (const token of topic.query.split(/[^a-z0-9]+/i)) {
    const normalizedToken = normalizeForMatch(token);
    if (normalizedToken.length >= 5 && haystack.includes(normalizedToken)) score += 1;
  }

  if (entry.lastModified) {
    const ageMs = Date.now() - Date.parse(entry.lastModified);
    if (Number.isFinite(ageMs) && ageMs < MAX_INDEX_SOURCE_AGE_MS) score += 2;
  }

  if (prefersDeveloperReferenceSources(topic.category) && url.hostname === 'developer.salesforce.com') {
    score += 4;
  }
  if (prefersDeveloperReferenceSources(topic.category) && url.hostname === 'architect.salesforce.com') {
    score -= 25;
  }
  // Architecture topics are the one family where architect.salesforce.com IS
  // the primary source rather than a distraction from reference docs.
  if (topic.category === 'architecture' && url.hostname === 'architect.salesforce.com') {
    score += 12;
  }

  return Math.max(0, score);
}

function isMetadataOnlyUrl(urlValue: string): boolean {
  try {
    const url = new URL(urlValue);
    return url.hostname === 'help.salesforce.com' && url.pathname.includes('/articleView');
  } catch {
    return false;
  }
}

function contentQualityForRecord(record: SalesforceDocsIndexRecord): SalesforceDocsContentQuality {
  return record.contentQuality || (record.contentLength >= FULL_TEXT_CONTENT_LENGTH_FLOOR ? 'full_text' : 'metadata_only');
}

function isFullTextRecord(record: SalesforceDocsIndexRecord): boolean {
  return contentQualityForRecord(record) === 'full_text' && record.contentLength >= FULL_TEXT_CONTENT_LENGTH_FLOOR;
}

function topicRecords(records: SalesforceDocsIndexRecord[], topicId: string): SalesforceDocsIndexRecord[] {
  return records.filter((record) => record.topicIds.includes(topicId));
}

function shouldFetchSitemapEntryForTopic(
  entry: SalesforceDocsSitemapEntry,
  topic: SalesforceDocsIndexTopic,
  records: SalesforceDocsIndexRecord[],
): boolean {
  if (!isMetadataOnlyUrl(entry.url)) return true;
  const recordsForTopic = topicRecords(records, topic.id);
  const metadataOnlyRecordsForTopic = recordsForTopic.filter((record) => contentQualityForRecord(record) === 'metadata_only').length;
  const fullTextRecordsForTopic = recordsForTopic.filter(isFullTextRecord).length;
  if (metadataOnlyRecordsForTopic >= MAX_METADATA_ONLY_SITEMAP_RECORDS_PER_TOPIC) return false;
  return fullTextRecordsForTopic === 0 || recordsForTopic.length < 2;
}

// --- Lookup misses → pages to read -------------------------------------------

const MISS_STOPWORDS = new Set([
  'salesforce', 'official', 'documentation', 'document', 'documents', 'documented', 'docs', 'doc', 'help', 'article', 'guide', 'says', 'the', 'and', 'for',
  'with', 'how', 'what', 'when', 'which', 'does', 'are', 'from', 'into', 'about', 'behavior', 'behaviour',
  'using', 'use', 'this', 'that', 'per', 'its', 'can', 'not', 'all', 'any',
]);
/** Pages read per miss: the best two candidates are enough to answer it, and renders are throttled. */
const MISS_CANDIDATES_PER_MISS = 2;

export function missTokens(text: string): string[] {
  return Array.from(new Set(
    normalizeForMatch(text).split(' ').filter((token) => token.length >= 3 && !MISS_STOPWORDS.has(token)),
  ));
}

/** Folds repeated misses (same query) into one, keeping the earliest and latest sighting. */
export function aggregateMisses(
  misses: SalesforceDocsMiss[],
  carried: SalesforceDocsUnresolvedMiss[] = [],
): SalesforceDocsUnresolvedMiss[] {
  const byKey = new Map<string, SalesforceDocsUnresolvedMiss>();
  const add = (miss: SalesforceDocsUnresolvedMiss) => {
    const key = normalizeForMatch(miss.query || miss.label);
    if (!key) return;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...miss, candidateUrls: miss.candidateUrls ? [...miss.candidateUrls] : undefined });
      return;
    }
    existing.count += miss.count;
    if (miss.firstSeenAt < existing.firstSeenAt) existing.firstSeenAt = miss.firstSeenAt;
    if (miss.lastSeenAt > existing.lastSeenAt) {
      existing.lastSeenAt = miss.lastSeenAt;
      existing.reason = miss.reason;
    }
    const candidateUrls = new Set([...(existing.candidateUrls || []), ...(miss.candidateUrls || [])]);
    existing.candidateUrls = candidateUrls.size > 0 ? Array.from(candidateUrls) : undefined;
  };
  carried.forEach(add);
  misses.forEach((miss) => add({
    label: miss.label,
    query: miss.query,
    reason: miss.reason,
    firstSeenAt: miss.at,
    lastSeenAt: miss.at,
    count: 1,
    candidateUrls: miss.candidateUrls,
  }));
  return Array.from(byKey.values());
}

/**
 * Official pages most likely to answer a miss: the pages the lookup itself
 * found but could not read come first, then Help catalog titles and sitemap
 * paths that carry at least half of the miss's words (two at minimum).
 */
export function rankMissCandidates(
  miss: Pick<SalesforceDocsUnresolvedMiss, 'label' | 'query' | 'candidateUrls'>,
  catalog: SalesforceDocsHelpCatalogEntry[],
): string[] {
  const ranked: string[] = [];
  for (const candidateUrl of miss.candidateUrls || []) {
    const url = canonicalHelpArticleUrl(candidateUrl) || canonicalizeUrl(candidateUrl);
    if (url && !/\.pdf$/i.test(new URL(url).pathname) && !ranked.includes(url)) ranked.push(url);
  }
  const tokens = missTokens(`${miss.label} ${miss.query}`);
  if (tokens.length === 0) return ranked;
  const needed = Math.max(Math.min(2, tokens.length), Math.ceil(tokens.length / 2));
  const scored = catalog
    .map((entry) => {
      const titleTokens = new Set(normalizeForMatch(entry.title).split(' '));
      const matched = tokens.filter((token) => titleTokens.has(token)).length;
      return { url: entry.url, matched };
    })
    .filter((entry) => entry.matched >= needed)
    .sort((a, b) => b.matched - a.matched || a.url.localeCompare(b.url));
  for (const entry of scored) {
    if (!ranked.includes(entry.url)) ranked.push(entry.url);
  }
  return ranked;
}

/** A topic's own words: its label and query, without generic words like "salesforce" or "docs". */
export function topicOwnTerms(topic: { label: string; query: string }): string[] {
  return missTokens(`${topic.label} ${topic.query}`);
}

/**
 * Whether a passage is about the topic on the topic's own terms: it carries at
 * least two of them (one when the topic has one), or three when the topic is
 * long. Alias expansion and generic words help rank passages, but they can't
 * make a passage count as an answer.
 */
export function passageAnswersTopic(text: string, ownTerms: string[]): boolean {
  return loweredPassageAnswersTopic(text.toLowerCase(), ownTerms);
}

function loweredPassageAnswersTopic(lowered: string, ownTerms: string[]): boolean {
  if (ownTerms.length === 0) return false;
  const needed = Math.max(Math.min(2, ownTerms.length), Math.min(3, Math.ceil(ownTerms.length / 2)));
  let matched = 0;
  for (const term of ownTerms) {
    const found = term.length >= 5
      ? lowered.includes(term)
      : new RegExp(`(^|[^a-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`).test(lowered);
    if (found) matched += 1;
    if (matched >= needed) return true;
  }
  return false;
}

function sitemapCatalogEntries(entries: SalesforceDocsSitemapEntry[]): SalesforceDocsHelpCatalogEntry[] {
  return entries.map((entry) => {
    const url = new URL(entry.url);
    return { url: entry.url, title: `${url.pathname} ${url.searchParams.get('id') || ''}` };
  });
}

function learnedTopicForMiss(miss: Pick<SalesforceDocsUnresolvedMiss, 'label' | 'query'>): SalesforceDocsIndexTopic {
  const slug = normalizeForMatch(miss.query || miss.label).replace(/\s+/g, '-').slice(0, 60);
  return {
    id: `learned-${slug}`,
    label: miss.label,
    query: miss.query,
    category: 'learned',
    keywords: missTokens(`${miss.label} ${miss.query}`),
    seedUrls: [],
  };
}

async function buildRecord(
  topic: SalesforceDocsIndexTopic,
  rawUrl: string,
  retrievedAt: string,
  index: number,
  discovery: {
    source: 'seed' | 'sitemap' | 'miss';
    lastModified?: string;
    sitemapUrl?: string;
    sitemapScore?: number;
  } = { source: 'seed' },
  helpCatalog?: Map<string, string>,
): Promise<SalesforceDocsIndexRecord> {
  const url = canonicalizeUrl(rawUrl);
  if (!url) {
    throw new Error(`URL is not an allowed official Salesforce URL: ${rawUrl}`);
  }
  const content = await fetchOfficialDocContent(url);
  for (const link of content.discoveredLinks || []) {
    if (helpCatalog && !helpCatalog.has(link.url)) helpCatalog.set(link.url, link.title);
  }
  const text = content.text;
  const recordId = `sf-doc-index-${index}`;
  const textChunks = content.contentQuality === 'full_text'
    ? buildTextChunks(text, recordId)
    : [];
  const status = inferSalesforceDocumentationStatus(`${text} ${content.releaseLabel || ''}`);
  const warnings = [...sourceWarnings(`${text} ${content.releaseLabel || ''}`, status), ...(content.warnings || [])];
  return {
    id: recordId,
    topicIds: [topic.id],
    title: content.title || extractTitle(text, topic.label),
    url,
    domain: new URL(url).hostname,
    sourceType: inferSourceType(url),
    status,
    retrievedAt,
    responseHash: crypto.createHash('sha256').update(text).digest('hex'),
    contentQuality: content.contentQuality,
    contentLength: text.length,
    textChunks: textChunks.length > 0 ? textChunks : undefined,
    chunkCount: textChunks.length > 0 ? textChunks.length : undefined,
    excerpt: excerptFor(text, topic),
    keywords: topic.keywords,
    warnings,
    apiVersion: content.apiVersion,
    releaseLabel: content.releaseLabel,
    documentationVersion: content.documentationVersion,
    lastModified: discovery.lastModified,
    discoverySource: discovery.source,
    sitemapUrl: discovery.sitemapUrl,
    sitemapScore: discovery.sitemapScore,
    confidenceImpact: confidenceImpactForSource(status, warnings),
  };
}

async function buildPdfRecord(
  source: SalesforceDocsPdfSource,
  retrievedAt: string,
  index: number,
): Promise<SalesforceDocsIndexRecord> {
  const url = canonicalizeUrl(source.url);
  if (!url) {
    throw new Error(`URL is not an allowed official Salesforce PDF URL: ${source.url}`);
  }

  const topics = source.topicIds
    .map((topicId) => SALESFORCE_DOC_TOPICS.find((topic) => topic.id === topicId))
    .filter((topic): topic is SalesforceDocsIndexTopic => Boolean(topic));
  if (topics.length === 0) {
    throw new Error(`PDF source ${source.id} did not reference any indexed Salesforce docs topics.`);
  }

  const pdf = await fetchPdfDocument(url);
  // Hash first: pdf.js takes ownership of the buffer and leaves it empty.
  const responseHash = crypto.createHash('sha256').update(Buffer.from(pdf.bytes)).digest('hex');
  const extracted = await extractPdfText(pdf.bytes, source.id);
  if (extracted.text.length < FULL_TEXT_CONTENT_LENGTH_FLOOR) {
    throw new Error(`PDF text extraction was too short (${extracted.text.length} chars)`);
  }

  const primaryTopic = topics[0];
  const keywords = Array.from(new Set([
    ...source.keywords,
    ...topics.flatMap((topic) => topic.keywords),
  ]));
  const version = inferPdfVersion(extracted.text);
  const status = inferSalesforceDocumentationStatus(version.releaseLabel || source.title);
  const refreshCadenceDays = source.refreshCadenceDays || PDF_REFRESH_CADENCE_DAYS;
  const recordSeed = {
    etag: pdf.etag,
    lastModified: pdf.lastModified,
  };
  const freshnessSignal = freshnessSignalFor(recordSeed);
  const warnings = [
    ...sourceWarnings(version.releaseLabel || '', status),
    ...extracted.warnings,
    freshnessSignal === 'content_hash_only'
      ? 'PDF source did not expose ETag or Last-Modified headers; staleness checks rely on scheduled re-fetch and content hash comparison.'
      : '',
  ].filter(Boolean);

  return {
    id: `sf-doc-index-${index}`,
    topicIds: topics.map((topic) => topic.id),
    title: source.title,
    url,
    domain: new URL(url).hostname,
    sourceType: inferSourceType(url),
    sourceFormat: 'pdf',
    pdfSourceId: source.id,
    status,
    retrievedAt,
    responseHash,
    contentQuality: 'full_text',
    contentLength: extracted.text.length,
    contentType: pdf.contentType,
    contentByteLength: pdf.contentByteLength,
    textChunks: extracted.chunks,
    chunkCount: extracted.chunks.length,
    excerpt: excerptFor(extracted.text, { ...primaryTopic, keywords }),
    keywords,
    warnings,
    apiVersion: version.apiVersion,
    releaseLabel: version.releaseLabel,
    documentationVersion: version.documentationVersion,
    etag: pdf.etag,
    lastModified: pdf.lastModified,
    pageCount: extracted.pageCount,
    extractedPageCount: extracted.extractedPageCount,
    refreshCadenceDays,
    nextRefreshDueAt: addDaysIso(retrievedAt, refreshCadenceDays),
    freshnessSignal,
    discoverySource: 'seed',
    confidenceImpact: confidenceImpactForSource(status, warnings),
  };
}

function buildPdfCorpusSourceHealth(
  record: SalesforceDocsIndexRecord,
  generatedAt: string,
): SalesforceDocsPdfCorpusSourceHealth {
  const refreshCadenceDays = record.refreshCadenceDays || PDF_REFRESH_CADENCE_DAYS;
  const nextRefreshDueAt = record.nextRefreshDueAt || addDaysIso(record.retrievedAt, refreshCadenceDays);
  return {
    sourceId: record.pdfSourceId || record.id,
    title: record.title,
    url: record.url,
    retrievedAt: record.retrievedAt,
    lastModified: record.lastModified,
    etag: record.etag,
    contentByteLength: record.contentByteLength,
    pageCount: record.pageCount,
    extractedPageCount: record.extractedPageCount,
    chunkCount: record.chunkCount,
    refreshCadenceDays,
    nextRefreshDueAt,
    refreshStatus: pdfRefreshStatus(record, Date.parse(generatedAt)),
    freshnessSignal: record.freshnessSignal || freshnessSignalFor(record),
  };
}

function buildPdfCorpusSummary(
  records: SalesforceDocsIndexRecord[],
  generatedAt: string,
): SalesforceDocsPdfCorpusSummary {
  const pdfRecords = records.filter((record) => record.sourceFormat === 'pdf');
  const sources = pdfRecords
    .map((record) => buildPdfCorpusSourceHealth(record, generatedAt))
    .sort((a, b) => a.title.localeCompare(b.title));
  const sourcesDueForRefresh = sources.filter((source) => source.refreshStatus !== 'fresh');
  const missingFreshnessSignals = sources.filter((source) => source.freshnessSignal === 'content_hash_only');
  const truncatedSources = pdfRecords.filter((record) =>
    typeof record.pageCount === 'number'
    && typeof record.extractedPageCount === 'number'
    && record.pageCount > record.extractedPageCount
  );

  return {
    sourceCount: SALESFORCE_DOC_PDF_SOURCES.length,
    indexedCount: pdfRecords.length,
    refreshCadenceDays: PDF_REFRESH_CADENCE_DAYS,
    dueForRefreshCount: sourcesDueForRefresh.length,
    overdueCount: sourcesDueForRefresh.filter((source) => source.refreshStatus === 'overdue').length,
    sourcesDueForRefresh,
    sources,
    warnings: [
      sourcesDueForRefresh.length > 0
        ? `${sourcesDueForRefresh.length} official Salesforce PDF source(s) are due or overdue for refresh.`
        : '',
      missingFreshnessSignals.length > 0
        ? `${missingFreshnessSignals.length} official Salesforce PDF source(s) lack ETag/Last-Modified validators; scheduled re-fetch and response hashing are required to detect changes.`
        : '',
      truncatedSources.length > 0
        ? `${truncatedSources.length} official Salesforce PDF source(s) were partially extracted because of page or character limits.`
        : '',
    ].filter(Boolean),
  };
}

export async function buildSalesforceDocsIndexNow(options: SalesforceDocsIndexBuildOptions = {}): Promise<SalesforceDocsIndex> {
  try {
    return await buildSalesforceDocsIndexNowInternal(options);
  } finally {
    await closeSalesforceHelpBrowser();
  }
}

async function buildSalesforceDocsIndexNowInternal(options: SalesforceDocsIndexBuildOptions = {}): Promise<SalesforceDocsIndex> {
  const generatedAt = new Date().toISOString();
  const records: SalesforceDocsIndexRecord[] = [];
  const failures: SalesforceDocsIndex['failures'] = [];
  const seenUrls = new Set<string>();
  const helpCatalog = new Map<string, string>();
  const includePdfDocs = options.includePdfDocs !== false;
  const includeWebDocs = options.includeWebDocs !== false;
  const includeSitemapDocs = includeWebDocs && options.includeSitemapDocs !== false;
  const requestedTopicIds = options.topicIds?.length ? new Set(options.topicIds) : null;
  const selectedTopics = requestedTopicIds
    ? SALESFORCE_DOC_TOPICS.filter((topic) => requestedTopicIds.has(topic.id))
    : SALESFORCE_DOC_TOPICS;
  const selectedTopicIds = new Set(selectedTopics.map((topic) => topic.id));
  const selectedPdfSources = requestedTopicIds
    ? SALESFORCE_DOC_PDF_SOURCES.filter((source) => source.topicIds.some((topicId) => selectedTopicIds.has(topicId)))
    : SALESFORCE_DOC_PDF_SOURCES;

  for (const pdfSource of includePdfDocs ? selectedPdfSources : []) {
    const canonicalUrl = canonicalizeUrl(pdfSource.url);
    if (!canonicalUrl) {
      failures.push({ topicId: pdfSource.topicIds[0] || pdfSource.id, url: pdfSource.url, error: 'PDF URL is not an allowed official Salesforce URL.' });
      continue;
    }
    if (seenUrls.has(canonicalUrl)) continue;
    seenUrls.add(canonicalUrl);

    try {
      console.log('[salesforceDocsIndex] Fetching Salesforce PDF source', {
        sourceId: pdfSource.id,
        url: canonicalUrl,
      });
      records.push(await buildPdfRecord(pdfSource, generatedAt, records.length + 1));
    } catch (error: any) {
      failures.push({
        topicId: pdfSource.topicIds[0] || pdfSource.id,
        url: canonicalUrl,
        error: error?.message || 'Unknown PDF fetch or extraction failure',
      });
    }
  }

  for (const topic of includeWebDocs ? selectedTopics : []) {
    for (const rawUrl of topic.seedUrls) {
      const canonicalUrl = canonicalizeUrl(rawUrl);
      if (!canonicalUrl) {
        failures.push({ topicId: topic.id, url: rawUrl, error: 'URL is not an allowed official Salesforce URL.' });
        continue;
      }

      const existingRecord = records.find((record) => record.url === canonicalUrl);
      if (existingRecord) {
        existingRecord.topicIds = Array.from(new Set([...existingRecord.topicIds, topic.id]));
        existingRecord.keywords = Array.from(new Set([...existingRecord.keywords, ...topic.keywords]));
        continue;
      }
      if (seenUrls.has(canonicalUrl)) continue;
      seenUrls.add(canonicalUrl);

      try {
        records.push(await buildRecord(topic, canonicalUrl, generatedAt, records.length + 1, { source: 'seed' }, helpCatalog));
      } catch (error: any) {
        failures.push({
          topicId: topic.id,
          url: canonicalUrl,
          error: error?.message || 'Unknown fetch failure',
        });
      }
    }
  }

  const sitemapEntries = includeSitemapDocs ? await discoverSitemapEntries(failures) : [];
  for (const topic of includeSitemapDocs ? selectedTopics : []) {
    const scoredEntries = sitemapEntries
      .map((entry) => ({ entry, score: scoreSitemapEntryForTopic(entry, topic) }))
      .filter(({ score }) => score >= MIN_SITEMAP_TOPIC_SCORE)
      .sort((a, b) => b.score - a.score || a.entry.url.localeCompare(b.entry.url));

    let topicSitemapRecordCount = 0;
    for (const { entry, score } of scoredEntries) {
      if (topicSitemapRecordCount >= MAX_SITEMAP_RECORDS_PER_TOPIC) break;
      if (!shouldFetchSitemapEntryForTopic(entry, topic, records)) continue;
      const existingRecord = records.find((record) => record.url === entry.url);
      if (existingRecord) {
        existingRecord.topicIds = Array.from(new Set([...existingRecord.topicIds, topic.id]));
        existingRecord.keywords = Array.from(new Set([...existingRecord.keywords, ...topic.keywords]));
        continue;
      }
      if (seenUrls.has(entry.url)) continue;
      seenUrls.add(entry.url);

      try {
        records.push(await buildRecord(topic, entry.url, generatedAt, records.length + 1, {
          source: 'sitemap',
          lastModified: entry.lastModified,
          sitemapUrl: entry.sitemapUrl,
          sitemapScore: score,
        }, helpCatalog));
        topicSitemapRecordCount += 1;
      } catch (error: any) {
        failures.push({
          topicId: topic.id,
          url: entry.url,
          error: error?.message || 'Unknown sitemap-discovered fetch failure',
        });
      }
    }
  }

  // Pages learned from earlier lookup misses are seeds now. One that fails
  // today stays learned, so the next build tries it again.
  const learnedSources: SalesforceDocsLearnedSource[] = [];
  for (const learned of includeWebDocs ? options.previousIndex?.learnedSources || [] : []) {
    learnedSources.push(learned);
    if (records.some((record) => record.url === learned.url) || seenUrls.has(learned.url)) continue;
    seenUrls.add(learned.url);
    try {
      records.push(await buildRecord(learnedTopicForMiss({ label: learned.title, query: learned.query }), learned.url, generatedAt, records.length + 1, { source: 'miss' }, helpCatalog));
    } catch (error: any) {
      failures.push({ topicId: 'learned', url: learned.url, error: error?.message || 'Unknown learned-page fetch failure' });
    }
  }

  // New misses, plus the ones no page has answered yet, against every official
  // page this build knows of: the pages it read (a seed may already answer a
  // miss), the Help catalog (this build's and earlier ones), and the developer
  // and architect sitemaps.
  for (const entry of options.previousIndex?.helpCatalog || []) {
    if (!helpCatalog.has(entry.url)) helpCatalog.set(entry.url, entry.title);
  }
  const missCatalog = [
    ...records.filter(isFullTextRecord).map((record) => ({ url: record.url, title: record.title })),
    ...Array.from(helpCatalog, ([url, title]) => ({ url, title })),
    ...sitemapCatalogEntries(sitemapEntries),
  ];
  const unresolvedMisses: SalesforceDocsUnresolvedMiss[] = [];
  const pendingMisses = includeWebDocs
    ? aggregateMisses(options.misses || [], options.previousIndex?.unresolvedMisses || [])
    : [];
  for (const miss of pendingMisses) {
    const candidates = rankMissCandidates(miss, missCatalog).slice(0, MISS_CANDIDATES_PER_MISS);
    let answered = false;
    for (const url of candidates) {
      if (records.some((record) => record.url === url && isFullTextRecord(record))) {
        answered = true;
        continue;
      }
      if (seenUrls.has(url)) continue;
      seenUrls.add(url);
      try {
        const record = await buildRecord(learnedTopicForMiss(miss), url, generatedAt, records.length + 1, { source: 'miss' }, helpCatalog);
        records.push(record);
        learnedSources.push({ url, title: record.title, query: miss.query, learnedAt: generatedAt });
        answered = true;
      } catch (error: any) {
        failures.push({ topicId: 'learned', url, error: error?.message || 'Unknown miss-candidate fetch failure' });
      }
    }
    if (!answered) {
      unresolvedMisses.push({
        ...miss,
        reason: candidates.length > 0 ? 'candidates_unreadable' : 'no_candidate_page',
      });
    }
  }

  const fullTextRecords = records.filter(isFullTextRecord).length;
  const metadataOnlyRecords = records.filter((record) => contentQualityForRecord(record) === 'metadata_only').length;
  const pdfCorpus = buildPdfCorpusSummary(records, generatedAt);

  const index: SalesforceDocsIndex = {
    version: SALESFORCE_DOC_INDEX_VERSION,
    generatedAt,
    sourcePolicy: {
      allowedHostPattern: '*.salesforce.com',
      storagePath: SALESFORCE_DOC_INDEX_PATH,
    },
    topics: selectedTopics,
    records,
    failures,
    discovery: {
      sitemapSources: SALESFORCE_DOC_SITEMAP_SOURCES.map((source) => source.url),
      sitemapUrlCount: sitemapEntries.length,
      sitemapRecordLimitPerTopic: MAX_SITEMAP_RECORDS_PER_TOPIC,
    },
    pdfCorpus,
    helpCatalog: Array.from(helpCatalog, ([url, title]) => ({ url, title }))
      .sort((a, b) => a.title.localeCompare(b.title) || a.url.localeCompare(b.url)),
    learnedSources,
    unresolvedMisses,
    warnings: [
      records.length === 0 ? 'No official Salesforce documentation records were fetched.' : '',
      failures.length > 0 ? `${failures.length} official Salesforce documentation seed URL(s) failed to fetch.` : '',
      includeSitemapDocs && sitemapEntries.length === 0 ? 'Salesforce documentation sitemap discovery returned no official URLs.' : '',
      !includeWebDocs ? 'Salesforce web documentation fetch was skipped for this index build.' : '',
      !includePdfDocs ? 'Salesforce PDF documentation fetch was skipped for this index build.' : '',
      pdfCorpus.indexedCount < SALESFORCE_DOC_PDF_SOURCES.length
        ? `Only ${pdfCorpus.indexedCount} of ${SALESFORCE_DOC_PDF_SOURCES.length} curated official Salesforce PDF source(s) were indexed.`
        : '',
      metadataOnlyRecords > 0 ? `${metadataOnlyRecords} official Salesforce documentation record(s) are metadata-only Help Center references without extracted article body text.` : '',
      fullTextRecords < MIN_REFRESH_FULL_TEXT_RECORDS ? `Only ${fullTextRecords} full-text documentation record(s) met the quality floor.` : '',
      ...pdfCorpus.warnings,
    ].filter(Boolean),
  };

  return index;
}

function developerDocRecordCount(index: SalesforceDocsIndex): number {
  return index.records.filter((record) => record.domain === 'developer.salesforce.com').length;
}

function fullTextRecordCount(index: SalesforceDocsIndex): number {
  return index.records.filter(isFullTextRecord).length;
}

function metadataOnlyRecordCount(index: SalesforceDocsIndex): number {
  return index.records.filter((record) => contentQualityForRecord(record) === 'metadata_only').length;
}

function pdfRecordCount(index: SalesforceDocsIndex): number {
  return index.records.filter((record) => record.sourceFormat === 'pdf').length;
}

function metadataOnlyRatio(index: SalesforceDocsIndex): number {
  if (index.records.length === 0) return 0;
  return metadataOnlyRecordCount(index) / index.records.length;
}

function countRecordsBySourceType(index: SalesforceDocsIndex): Record<string, number> {
  return index.records.reduce((acc, record) => {
    acc[record.sourceType] = (acc[record.sourceType] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}

function countFailuresByDomain(index: SalesforceDocsIndex): Record<string, number> {
  return index.failures.reduce((acc, failure) => {
    let domain = 'unknown';
    try {
      domain = new URL(failure.url).hostname;
    } catch {
      domain = 'invalid-url';
    }
    acc[domain] = (acc[domain] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}

/** Curated topics this build covered that ended up with no full-text record to answer from. */
export function topicsWithoutFullTextRecords(index: SalesforceDocsIndex): string[] {
  return index.topics
    .filter((topic) => !index.records.some((record) => isFullTextRecord(record) && record.topicIds.includes(topic.id)))
    .map((topic) => topic.id);
}

export interface SalesforceDocsIndexComparison {
  previousGeneratedAt: string;
  /** Topics whose full-text record count went down since the previous build. */
  topicsLosingRecords: Array<{ topicId: string; before: number; after: number }>;
  droppedUrls: string[];
  addedUrls: string[];
}

export function compareSalesforceDocsIndexes(previous: SalesforceDocsIndex, next: SalesforceDocsIndex): SalesforceDocsIndexComparison {
  const fullTextCountsByTopic = (index: SalesforceDocsIndex) => {
    const counts = new Map<string, number>();
    for (const record of index.records.filter(isFullTextRecord)) {
      for (const topicId of record.topicIds) counts.set(topicId, (counts.get(topicId) || 0) + 1);
    }
    return counts;
  };
  const before = fullTextCountsByTopic(previous);
  const after = fullTextCountsByTopic(next);
  const previousUrls = new Set(previous.records.filter(isFullTextRecord).map((record) => record.url));
  const nextUrls = new Set(next.records.filter(isFullTextRecord).map((record) => record.url));
  return {
    previousGeneratedAt: previous.generatedAt,
    topicsLosingRecords: next.topics
      .map((topic) => ({ topicId: topic.id, before: before.get(topic.id) || 0, after: after.get(topic.id) || 0 }))
      .filter((topic) => topic.after < topic.before),
    droppedUrls: Array.from(previousUrls).filter((url) => !nextUrls.has(url)).sort(),
    addedUrls: Array.from(nextUrls).filter((url) => !previousUrls.has(url)).sort(),
  };
}

export function refreshCoverageError(index: SalesforceDocsIndex): string | null {
  const developerRecords = developerDocRecordCount(index);
  if (developerRecords < MIN_REFRESH_DEVELOPER_DOC_RECORDS) {
    return [
      `Salesforce docs index refresh produced ${developerRecords} developer.salesforce.com record(s),`,
      `below required minimum ${MIN_REFRESH_DEVELOPER_DOC_RECORDS}; keeping the previous index.`,
    ].join(' ');
  }

  const fullTextRecords = fullTextRecordCount(index);
  if (fullTextRecords < MIN_REFRESH_FULL_TEXT_RECORDS) {
    return [
      `Salesforce docs index refresh produced ${fullTextRecords} full-text record(s),`,
      `below required minimum ${MIN_REFRESH_FULL_TEXT_RECORDS}; keeping the previous index.`,
    ].join(' ');
  }

  const pdfRecords = pdfRecordCount(index);
  if (pdfRecords < MIN_REFRESH_PDF_RECORDS) {
    return [
      `Salesforce docs index refresh produced ${pdfRecords} official Salesforce PDF record(s),`,
      `below required minimum ${MIN_REFRESH_PDF_RECORDS}; keeping the previous index.`,
    ].join(' ');
  }

  const ratio = metadataOnlyRatio(index);
  if (ratio > MAX_REFRESH_METADATA_ONLY_RATIO) {
    return [
      `Salesforce docs index refresh produced a metadata-only ratio of ${ratio.toFixed(2)},`,
      `above allowed maximum ${MAX_REFRESH_METADATA_ONLY_RATIO}; keeping the previous index.`,
    ].join(' ');
  }

  // A topic with nothing readable would answer lookups with no evidence (Shield
  // sat at zero records for weeks behind dead seeds before this gate).
  const emptyTopics = topicsWithoutFullTextRecords(index);
  if (emptyTopics.length > 0) {
    return [
      `Salesforce docs index refresh left ${emptyTopics.length} topic(s) with no full-text record`,
      `(${emptyTopics.join(', ')}); keeping the previous index.`,
    ].join(' ');
  }

  return null;
}

/**
 * Cached index reader. The parsed index is multi-MB, so instances hold one
 * shared copy: the in-flight promise is cached (thundering-herd guard at cold
 * start), a fresh copy is served inside the TTL, and after the TTL the stored
 * object generation is revalidated so a re-download only happens on change.
 */
export async function readSalesforceDocsIndex(): Promise<SalesforceDocsIndex | null> {
  const now = Date.now();
  if (cachedIndexState) {
    if (now - cachedIndexState.validatedAtMs < SALESFORCE_DOC_INDEX_CACHE_TTL_MS) {
      return (await cachedIndexState.promise).index;
    }
    const settled = await cachedIndexState.promise;
    if (settled.index && settled.generation) {
      try {
        const generation = await fetchSalesforceDocsIndexGeneration();
        if (generation && generation === settled.generation) {
          cachedIndexState.validatedAtMs = now;
          return settled.index;
        }
      } catch (error) {
        console.warn('[salesforceDocsIndex] Salesforce docs index revalidation failed; serving cached copy:', error);
        cachedIndexState.validatedAtMs = now;
        return settled.index;
      }
    }
  }

  const state = { promise: downloadSalesforceDocsIndex(), validatedAtMs: now };
  cachedIndexState = state;
  const result = await state.promise;
  if (!result.index && cachedIndexState === state) {
    cachedIndexState = null;
  }
  return result.index;
}

function tokensForTopic(topic: SalesforceDocsLookupTopicLike): string[] {
  const aliasTopicIds = aliasTopicIdsFor(topic);
  const indexedAliasTopics = indexedTopicsForAliasIds(aliasTopicIds);
  return Array.from(new Set([
    topic.id,
    topic.label,
    topic.query,
    ...aliasTopicIds,
    ...indexedAliasTopics.flatMap((indexedTopic) => [
      indexedTopic.id,
      indexedTopic.label,
      indexedTopic.query,
      indexedTopic.category,
      ...indexedTopic.keywords,
    ]),
    ...(topic.componentTypes || []),
    ...(topic.apiVersions || []),
    ...(topic.riskSignalIds || []),
  ].join(' ').toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length >= 3)));
}

// --- BM25 chunk relevance over the cached index -----------------------------
// Corpus stats (N, avgdl) are one cheap pass per parsed index; document
// frequency is computed lazily per token and memoized for the index object's
// lifetime, so the first lookup pays the scan and later lookups reuse it.

const BM25_K1 = 1.2;
const BM25_B = 0.75;
// Chunk influence on record scores is capped at 80 so topic-alias routing
// (see scoreRecordForTopic) is not swamped by one hot chunk.
const BM25_DISPLAY_SCALE = 8;
const BM25_DISPLAY_CAP = 80;

export interface SalesforceDocsBm25CorpusStats {
  totalChunks: number;
  avgChunkLength: number;
  dfByToken: Map<string, number>;
}

const bm25StatsByIndex = new WeakMap<SalesforceDocsIndex, SalesforceDocsBm25CorpusStats>();
const loweredChunkTextCache = new WeakMap<SalesforceDocsIndexTextChunk, string>();

function loweredChunkText(chunk: SalesforceDocsIndexTextChunk): string {
  let lowered = loweredChunkTextCache.get(chunk);
  if (lowered === undefined) {
    lowered = chunk.text.toLowerCase();
    loweredChunkTextCache.set(chunk, lowered);
  }
  return lowered;
}

export function buildBm25CorpusStats(index: SalesforceDocsIndex): SalesforceDocsBm25CorpusStats {
  let totalChunks = 0;
  let totalLength = 0;
  for (const record of index.records) {
    for (const chunk of record.textChunks || []) {
      totalChunks += 1;
      totalLength += chunk.contentLength || chunk.text.length;
    }
  }
  return {
    totalChunks,
    avgChunkLength: totalChunks > 0 ? totalLength / totalChunks : 0,
    dfByToken: new Map(),
  };
}

function getBm25CorpusStats(index: SalesforceDocsIndex): SalesforceDocsBm25CorpusStats {
  const cached = bm25StatsByIndex.get(index);
  if (cached) return cached;
  const stats = buildBm25CorpusStats(index);
  bm25StatsByIndex.set(index, stats);
  return stats;
}

function documentFrequencyForToken(
  index: SalesforceDocsIndex,
  stats: SalesforceDocsBm25CorpusStats,
  token: string,
): number {
  const cached = stats.dfByToken.get(token);
  if (cached !== undefined) return cached;
  let df = 0;
  for (const record of index.records) {
    for (const chunk of record.textChunks || []) {
      if (loweredChunkText(chunk).includes(token)) df += 1;
    }
  }
  stats.dfByToken.set(token, df);
  return df;
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let position = haystack.indexOf(needle);
  while (position !== -1) {
    count += 1;
    position = haystack.indexOf(needle, position + needle.length);
  }
  return count;
}

export function bm25ChunkScore(
  loweredText: string,
  chunkLength: number,
  tokens: string[],
  stats: SalesforceDocsBm25CorpusStats,
  dfResolver: (token: string) => number,
): number {
  if (stats.totalChunks === 0 || stats.avgChunkLength === 0) return 0;
  let score = 0;
  for (const token of tokens) {
    const tf = countOccurrences(loweredText, token);
    if (tf === 0) continue;
    const df = dfResolver(token);
    const idf = Math.log(1 + (stats.totalChunks - df + 0.5) / (df + 0.5));
    const lengthNorm = 1 - BM25_B + BM25_B * (chunkLength / stats.avgChunkLength);
    score += idf * ((tf * (BM25_K1 + 1)) / (tf + BM25_K1 * lengthNorm));
  }
  return score;
}

type ChunkScorer = (chunk: SalesforceDocsIndexTextChunk, tokens: string[]) => number;

function createChunkScorer(index: SalesforceDocsIndex): ChunkScorer {
  const stats = getBm25CorpusStats(index);
  const dfResolver = (token: string) => documentFrequencyForToken(index, stats, token);
  return (chunk, tokens) => bm25ChunkScore(
    loweredChunkText(chunk),
    chunk.contentLength || chunk.text.length,
    tokens,
    stats,
    dfResolver,
  );
}

function scaleBm25ForDisplay(rawScore: number): number {
  if (rawScore <= 0) return 0;
  return Math.max(1, Math.min(Math.round(rawScore * BM25_DISPLAY_SCALE), BM25_DISPLAY_CAP));
}

function matchedChunksForRecord(
  record: SalesforceDocsIndexRecord,
  tokens: string[],
  scoreChunk: ChunkScorer,
  ownTerms: string[],
  maxChunks = MAX_MATCHED_CHUNKS_PER_SOURCE,
): NonNullable<SalesforceDocsIndexEvidenceSource['matchedChunks']> {
  if (!record.textChunks || record.textChunks.length === 0) return [];
  return record.textChunks
    .filter((chunk) => loweredPassageAnswersTopic(loweredChunkText(chunk), ownTerms))
    .map((chunk) => ({ chunk, rawScore: scoreChunk(chunk, tokens) }))
    .filter(({ rawScore }) => rawScore > 0)
    .sort((a, b) => b.rawScore - a.rawScore || a.chunk.ordinal - b.chunk.ordinal)
    .slice(0, maxChunks)
    .map(({ chunk, rawScore }) => ({
      id: chunk.id,
      ordinal: chunk.ordinal,
      text: chunk.text,
      score: scaleBm25ForDisplay(rawScore),
      contentLength: chunk.contentLength,
    }));
}

function scoreRecordForTopic(
  record: SalesforceDocsIndexRecord,
  topic: SalesforceDocsLookupTopicLike,
  tokens: string[],
  aliasTopicIds: string[],
  scoreChunk: ChunkScorer,
): number {
  if (isNonEnglishLocalizedSalesforceUrl(record.url)) return 0;
  let score = 0;
  const aliasTopicMatch = record.topicIds.some((topicId) => aliasTopicIds.includes(topicId));
  // Alias routing is a strong prior, not a trump card: BM25 chunk relevance
  // (capped at 80) must be able to outrank an alias match with weak content.
  if (aliasTopicMatch) score += 40;
  const haystack = [
    record.title,
    record.url,
    record.excerpt,
    record.keywords.join(' '),
    record.topicIds.join(' '),
  ].join(' ').toLowerCase();
  for (const token of tokens) {
    if (haystack.includes(token)) score += 2;
  }
  const chunkScores = record.textChunks
    ? record.textChunks.map((chunk) => scoreChunk(chunk, tokens))
    : [];
  const bestChunkScore = chunkScores.length > 0 ? Math.max(...chunkScores) : 0;
  score += scaleBm25ForDisplay(bestChunkScore);
  for (const riskSignalId of topic.riskSignalIds || []) {
    if (riskSignalId.includes('apex') && record.topicIds.some((id) => id.startsWith('apex-'))) score += 8;
    if (riskSignalId.includes('flow') && record.topicIds.some((id) => id.startsWith('flow-'))) score += 8;
    if (riskSignalId.includes('permissions') && record.topicIds.includes('permissions-least-privilege')) score += 8;
    if (riskSignalId.includes('lightning') && record.topicIds.includes('lightning-security')) score += 8;
  }
  const scoringCategory = scoringCategoryForTopic(topic, aliasTopicIds);
  if (aliasTopicMatch && record.sourceType === 'developer_doc') {
    score += 15;
  }
  if (aliasTopicMatch && record.sourceFormat === 'pdf' && record.topicIds.length > 5 && aliasTopicIds.length > 2) {
    score -= 20;
  }
  if (prefersDeveloperReferenceSources(scoringCategory) && record.sourceType === 'developer_doc') {
    score += 8;
  }
  if (prefersDeveloperReferenceSources(scoringCategory) && record.sourceType === 'architect_doc') {
    score -= 35;
  }
  if (scoringCategory === 'architecture' && record.sourceType === 'architect_doc') {
    score += 15;
  }
  return Math.max(0, score);
}

export function selectionIsAliasRouted(
  records: Array<Pick<SalesforceDocsIndexRecord, 'topicIds'>>,
  aliasTopicIds: string[],
): boolean {
  return records.some((record) => record.topicIds.some((topicId) => aliasTopicIds.includes(topicId)));
}

function selectScoredRecordsForTopic(
  scored: Array<{ record: SalesforceDocsIndexRecord; score: number }>,
  aliasTopicIds: string[],
  maxResults: number,
): Array<{ record: SalesforceDocsIndexRecord; score: number }> {
  const indexedAliasIds = aliasTopicIds.filter((topicId) =>
    SALESFORCE_DOC_TOPICS.some((indexedTopic) => indexedTopic.id === topicId)
  );
  const selected: Array<{ record: SalesforceDocsIndexRecord; score: number }> = [];
  const seenUrls = new Set<string>();

  for (const aliasTopicId of indexedAliasIds) {
    if (selected.length >= maxResults) break;
    const bestForAlias = scored.find((item) =>
      item.record.topicIds.includes(aliasTopicId) && !seenUrls.has(item.record.url)
    );
    if (!bestForAlias) continue;
    selected.push(bestForAlias);
    seenUrls.add(bestForAlias.record.url);
  }

  for (const item of scored) {
    if (selected.length >= maxResults) break;
    if (seenUrls.has(item.record.url)) continue;
    selected.push(item);
    seenUrls.add(item.record.url);
  }

  return selected;
}

export async function lookupSalesforceDocsIndex(
  topics: SalesforceDocsLookupTopicLike[],
  options: { generatedAt: string; maxResultsPerTopic: number },
): Promise<SalesforceDocsIndexLookupResult> {
  const index = await readSalesforceDocsIndex();
  if (!index) {
    return {
      sources: [],
      topicHits: [],
      aliasRoutedTopicIds: [],
      warnings: [`Salesforce documentation index is unavailable at ${SALESFORCE_DOC_INDEX_PATH}; falling back to live official-source lookup.`],
      indexSummary: {
        status: 'unavailable',
        storagePath: SALESFORCE_DOC_INDEX_PATH,
        recordCount: 0,
        topicCoverage: topics.map((topic) => ({
          topicId: topic.id,
          status: 'unavailable',
          sourceCount: 0,
          reason: 'Salesforce documentation index was unavailable.',
        })),
        missedTopics: topics.map((topic) => ({
          topicId: topic.id,
          label: topic.label,
          reason: 'unavailable',
        })),
        stalenessWarnings: [],
      },
    };
  }

  const indexAgeMs = Date.now() - Date.parse(index.generatedAt);
  const warnings = [...index.warnings];
  const pdfCorpus = buildPdfCorpusSummary(index.records, new Date().toISOString());
  if (pdfCorpus.dueForRefreshCount > 0) {
    warnings.push(`${pdfCorpus.dueForRefreshCount} cached official Salesforce PDF source(s) are due or overdue for refresh.`);
  }
  if (Number.isFinite(indexAgeMs) && indexAgeMs > MAX_INDEX_AGE_MS) {
    warnings.push(`Salesforce documentation index is older than ${Math.round(MAX_INDEX_AGE_MS / (24 * 60 * 60 * 1000))} days; live verification is recommended.`);
  }

  const sources: SalesforceDocsIndexEvidenceSource[] = [];
  const topicHits = new Set<string>();
  const aliasRoutedTopicIds = new Set<string>();
  const topicSourceCounts = new Map<string, number>();
  const seenSourceKeys = new Set<string>();

  const scoreChunk = createChunkScorer(index);
  const topicsWithUnansweringMatches = new Set<string>();
  for (const topic of topics) {
    const tokens = tokensForTopic(topic);
    const aliasTopicIds = aliasTopicIdsFor(topic);
    const ownTerms = topicOwnTerms(topic);
    const scored = index.records
      .filter(isFullTextRecord)
      .map((record) => ({ record, score: scoreRecordForTopic(record, topic, tokens, aliasTopicIds, scoreChunk) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.record.title.localeCompare(b.record.title));
    // A page is evidence for a topic only when one of its passages is about the
    // topic in the topic's own words; ranking alone (aliases, "salesforce") isn't.
    const answering: typeof scored = [];
    for (const item of scored) {
      if ((item.record.textChunks || []).some((chunk) => loweredPassageAnswersTopic(loweredChunkText(chunk), ownTerms))) {
        answering.push(item);
        if (answering.length >= options.maxResultsPerTopic * 3) break;
      }
    }
    const selected = selectScoredRecordsForTopic(answering, aliasTopicIds, options.maxResultsPerTopic);

    if (selected.length === 0) {
      if (scored.length > 0) topicsWithUnansweringMatches.add(topic.id);
      continue;
    }
    topicHits.add(topic.id);
    if (selectionIsAliasRouted(selected.map((item) => item.record), aliasTopicIds)) {
      aliasRoutedTopicIds.add(topic.id);
    }
    topicSourceCounts.set(topic.id, selected.length);

    for (const item of selected) {
      const sourceKey = `${topic.id}:${item.record.url}`;
      if (seenSourceKeys.has(sourceKey)) continue;
      seenSourceKeys.add(sourceKey);

      const sourceAgeMs = Date.now() - Date.parse(item.record.retrievedAt);
      const recordPdfRefreshStatus = item.record.sourceFormat === 'pdf'
        ? pdfRefreshStatus(item.record)
        : null;
      const matchedChunks = matchedChunksForRecord(item.record, tokens, scoreChunk, ownTerms);
      const sourceWarnings = [
        ...item.record.warnings,
        `Source came from cached official Salesforce docs index generated ${index.generatedAt}.`,
        Number.isFinite(sourceAgeMs) && sourceAgeMs > MAX_INDEX_SOURCE_AGE_MS
          ? 'Cached source is older than 90 days; confidence should be downgraded unless live verification succeeds.'
          : '',
        recordPdfRefreshStatus && recordPdfRefreshStatus !== 'fresh'
          ? `Cached PDF source is ${recordPdfRefreshStatus} for refresh; verify against the latest official PDF before making release-sensitive claims.`
          : '',
      ].filter(Boolean);

      sources.push({
        id: `sf-doc-cache-${sources.length + 1}`,
        topicId: topic.id,
        title: item.record.title,
        url: item.record.url,
        domain: item.record.domain,
        sourceType: item.record.sourceType,
        status: item.record.status,
        retrievedAt: item.record.retrievedAt,
        responseHash: item.record.responseHash,
        contentQuality: contentQualityForRecord(item.record),
        contentLength: item.record.contentLength,
        excerpt: matchedChunks[0]?.text || item.record.excerpt,
        matchedChunks: matchedChunks.length > 0 ? matchedChunks : undefined,
        searchSnippet: `Cached official Salesforce documentation index match (score ${item.score}).`,
        warnings: sourceWarnings,
        apiVersion: item.record.apiVersion,
        releaseLabel: item.record.releaseLabel,
        documentationVersion: item.record.documentationVersion,
        lastModified: item.record.lastModified,
        confidenceImpact: confidenceImpactForSource(item.record.status, sourceWarnings),
      });
    }
  }

  return {
    sources,
    topicHits: Array.from(topicHits),
    aliasRoutedTopicIds: Array.from(aliasRoutedTopicIds),
    warnings,
    indexSummary: {
      status: sources.length > 0
        ? (Number.isFinite(indexAgeMs) && indexAgeMs > MAX_INDEX_AGE_MS ? 'stale' : 'hit')
        : 'miss',
      generatedAt: index.generatedAt,
      storagePath: SALESFORCE_DOC_INDEX_PATH,
      recordCount: index.records.length,
      developerDocCount: developerDocRecordCount(index),
      fullTextRecordCount: fullTextRecordCount(index),
      metadataOnlyRecordCount: metadataOnlyRecordCount(index),
      pdfRecordCount: pdfRecordCount(index),
      indexSourceCounts: countRecordsBySourceType(index),
      pdfCorpus,
      failedDomains: countFailuresByDomain(index),
      topicCoverage: topics.map((topic) => {
        const sourceCount = topicSourceCounts.get(topic.id) || 0;
        const stale = sourceCount > 0 && Number.isFinite(indexAgeMs) && indexAgeMs > MAX_INDEX_AGE_MS;
        return {
          topicId: topic.id,
          status: sourceCount > 0 ? (stale ? 'stale' as const : 'hit' as const) : 'miss' as const,
          sourceCount,
          reason: sourceCount > 0
            ? undefined
            : topicsWithUnansweringMatches.has(topic.id)
              ? 'Indexed pages ranked for this topic, but none has a passage about it in its own terms.'
              : 'No cached official Salesforce documentation source matched this topic.',
        };
      }),
      missedTopics: topics
        .filter((topic) => !topicHits.has(topic.id))
        .map((topic) => ({
          topicId: topic.id,
          label: topic.label,
          reason: topicsWithUnansweringMatches.has(topic.id)
            ? 'no_matching_passage' as const
            : index.topics.some((indexedTopic) => aliasTopicIdsFor(topic).includes(indexedTopic.id))
              ? 'no_official_source' as const
              : 'not_indexed' as const,
        })),
      stalenessWarnings: warnings.filter((warning) => /older than|stale|previous|due|overdue/i.test(warning)),
    },
  };
}

// The in-function refresh (onCall + onSchedule) was removed 2026-08: Salesforce
// 403s all Cloud Functions egress to developer.salesforce.com, so a GCF-hosted
// build can never pass the coverage gates. The GitHub Actions workflow
// (.github/workflows/salesforce-docs-index.yml) is the only working build pipe;
// scripts/salesforce-docs-index.mjs enforces refreshCoverageError as its
// baseline quality gate before upload.
