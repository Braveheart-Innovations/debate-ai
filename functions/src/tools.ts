import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as crypto from 'crypto';
import { promises as dns } from 'dns';
import * as net from 'net';
import { getDecryptedApiKey, encryptionKey } from './apiKeys';
import { executeWebSearch } from './web_search';
import {
  MAX_SANDBOX_FETCH_BYTES,
  parseSandboxFetchTarget,
  saveFetchToSandbox,
  type SandboxFetchTarget,
} from './fetchToSandbox';
import { e2bApiKey, getSandboxService } from './sandbox/callables';
import { fetchOfficialDocContent, inferSalesforceDocumentationStatus, lookupSalesforceDocsIndex } from './salesforceDocsIndex';
import {
  getDecryptedDataServiceKey,
  CONNECTOR_AUTH_CONFIG,
  VALID_CONNECTOR_IDS,
  fredApiKey,
  socrataAppToken,
  nasaApiKey,
  usCensusApiKey,
  blsRegistrationKey,
  fbiCrimeApiKey,
  stackExchangeApiKey,
  librariesIoApiKey,
} from './dataConnectors';

// ============================================================================
// Types
// ============================================================================

/**
 * Tool definition in OpenAI-compatible format
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description?: string;
      enum?: string[];
    }>;
    required?: string[];
  };
  category?: 'web' | 'data' | 'files' | 'compute';
}

/**
 * Tool call from AI response
 */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

/**
 * Result of tool execution
 */
export interface ToolResult {
  toolCallId: string;
  success: boolean;
  content?: string;
  error?: string;
  metadata?: {
    executionTime?: number;
    truncated?: boolean;
    originalLength?: number;
    cached?: boolean;
    /** Response content type (fetch_api). */
    contentType?: string;
    /** fetch_api saved into the sandbox: where, how big, its SHA-256; `content` is then a preview. */
    sandboxPath?: string;
    bytes?: number;
    responseHash?: string;
    previewTruncated?: boolean;
  };
}

/**
 * Tool choice options
 */
export type ToolChoice = 'auto' | 'none' | 'required' | { name: string };

// ============================================================================
// Tool Transformers
// ============================================================================

/**
 * Transform tools for Claude API
 */
export function transformToolsForClaude(tools: ToolDefinition[]): {
  name: string;
  description: string;
  input_schema: ToolDefinition['parameters'];
}[] {
  return tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters,
  }));
}

/**
 * Transform tool choice for Claude API
 */
export function transformToolChoiceForClaude(
  choice: ToolChoice
): { type: 'auto' | 'any' | 'tool'; name?: string } {
  if (choice === 'auto') return { type: 'auto' };
  if (choice === 'none') return { type: 'auto' }; // Claude doesn't have 'none', use auto
  if (choice === 'required') return { type: 'any' };
  if (typeof choice === 'object' && choice.name) {
    return { type: 'tool', name: choice.name };
  }
  return { type: 'auto' };
}

/**
 * Parse Claude tool_use blocks to standard ToolCall format
 */
export function parseClaudeToolCalls(content: {
  type: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}[]): ToolCall[] {
  return content
    .filter(block => block.type === 'tool_use')
    .map(block => ({
      id: block.id || `call_${Date.now()}`,
      type: 'function' as const,
      function: {
        name: block.name || '',
        arguments: JSON.stringify(block.input || {}),
      },
    }));
}

/**
 * Transform tools for OpenAI API (native format)
 */
export function transformToolsForOpenAI(tools: ToolDefinition[]): {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: ToolDefinition['parameters'];
  };
}[] {
  return tools.map(tool => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

/**
 * Transform tool choice for OpenAI API
 */
export function transformToolChoiceForOpenAI(
  choice: ToolChoice
): 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } } {
  if (choice === 'auto') return 'auto';
  if (choice === 'none') return 'none';
  if (choice === 'required') return 'required';
  if (typeof choice === 'object' && choice.name) {
    return { type: 'function', function: { name: choice.name } };
  }
  return 'auto';
}

/**
 * Parse OpenAI tool calls from response
 */
export function parseOpenAIToolCalls(message: {
  tool_calls?: {
    id: string;
    type: string;
    function: { name: string; arguments: string };
  }[];
}): ToolCall[] {
  if (!message.tool_calls) return [];
  return message.tool_calls.map(tc => ({
    id: tc.id,
    type: 'function' as const,
    function: {
      name: tc.function.name,
      arguments: tc.function.arguments,
    },
  }));
}

/**
 * Transform tools for Gemini API
 */
export function transformToolsForGemini(tools: ToolDefinition[]): {
  functionDeclarations: {
    name: string;
    description: string;
    parameters: ToolDefinition['parameters'];
  }[];
}[] {
  return [{
    functionDeclarations: tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    })),
  }];
}

/**
 * Parse Gemini function calls from response
 */
export function parseGeminiToolCalls(parts: {
  functionCall?: { name: string; args: Record<string, unknown> };
}[]): ToolCall[] {
  return parts
    .filter(part => part.functionCall)
    .map((part, index) => ({
      id: `call_${Date.now()}_${index}`,
      type: 'function' as const,
      function: {
        name: part.functionCall!.name,
        arguments: JSON.stringify(part.functionCall!.args || {}),
      },
    }));
}

/**
 * Transform tools for Mistral API (OpenAI-compatible format)
 */
export function transformToolsForMistral(tools: ToolDefinition[]) {
  return transformToolsForOpenAI(tools);
}

/**
 * Transform tools for Cohere API
 */
export function transformToolsForCohere(tools: ToolDefinition[]): {
  name: string;
  description: string;
  parameter_definitions: Record<string, {
    type: string;
    description?: string;
    required: boolean;
  }>;
}[] {
  return tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    parameter_definitions: Object.entries(tool.parameters.properties).reduce(
      (acc, [key, value]) => {
        acc[key] = {
          type: value.type,
          description: value.description,
          required: tool.parameters.required?.includes(key) ?? false,
        };
        return acc;
      },
      {} as Record<string, { type: string; description?: string; required: boolean }>
    ),
  }));
}

// ============================================================================
// Tool Handlers
// ============================================================================

interface FetchUrlArgs {
  url: string;
  selector?: string;
  includeMetadata?: boolean;
  includeLinks?: boolean;
  maxLinks?: number;
  maxLength?: number;
}

interface ExtractedLink {
  text: string;
  url: string;
}

interface SalesforceDocsLookupTopicArg {
  id?: string;
  label?: string;
  query?: string;
  category?: string;
  reasons?: string[];
  componentTypes?: string[];
  apiVersions?: string[];
  riskSignalIds?: string[];
}

interface SalesforceDocsLookupArgs {
  topics?: Array<string | SalesforceDocsLookupTopicArg>;
  componentTypes?: string[];
  apiVersions?: string[];
  riskSignalIds?: string[];
  releaseContext?: string;
  maxResultsPerTopic?: number;
}

interface SalesforceDocsTopic {
  id: string;
  label: string;
  query: string;
  category: string;
  reasons: string[];
  componentTypes: string[];
  apiVersions: string[];
  riskSignalIds: string[];
}

interface SalesforceDocEvidenceSource {
  id: string;
  topicId: string;
  title: string;
  url: string;
  domain: string;
  sourceType: 'release_page' | 'release_notes' | 'developer_doc' | 'help_doc' | 'architect_doc' | 'pdf_guide' | 'release_notes_pdf' | 'official_doc';
  status: 'ga' | 'preview' | 'unknown';
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
  confidenceImpact: 'supports' | 'unclear' | 'preview-risk' | 'release-link-risk' | 'stale-risk';
}

interface ConnectorInferenceRule {
  connectorId: string;
  matches: (url: URL) => boolean;
}

// URL validation - block private IPs and internal networks
const BLOCKED_HOSTS = [
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '10.',
  '172.16.',
  '172.17.',
  '172.18.',
  '172.19.',
  '172.20.',
  '172.21.',
  '172.22.',
  '172.23.',
  '172.24.',
  '172.25.',
  '172.26.',
  '172.27.',
  '172.28.',
  '172.29.',
  '172.30.',
  '172.31.',
  '192.168.',
  'metadata.google.internal',
  '169.254.',
];

/**
 * Inline fetch_api limit: the body travels back to the browser. Only production
 * web v2.3.12 still uses this path; remove it in the first deploy after v2.5.0
 * ships. Sandbox-target requests use MAX_SANDBOX_FETCH_BYTES.
 */
const MAX_FETCH_API_RESPONSE_BYTES = 750_000;
const SOCRATA_DOWNLOAD_BLOCK_MESSAGE = 'Blocked bulk download endpoint rows.json?accessType=DOWNLOAD because it is too large for interactive analysis. Query the dataset /resource/{dataset_id}.json endpoint with SoQL filters and a modest $limit (for example: 100-1000 rows), then paginate with $offset.';
const SALESFORCE_RELEASES_URL = 'https://www.salesforce.com/releases';
const SALESFORCE_OFFICIAL_HOST_PATTERN = /(^|\.)salesforce\.com$/i;
const SALESFORCE_RELEASE_LABEL_PATTERN = /\b(Spring|Summer|Winter)\s+[’']?(\d{2})\b/i;

const KNOWN_API_HOSTS = new Set([
  'api.weather.gov',
  'api.stlouisfed.org',
  'earthquake.usgs.gov',
  'clinicaltrials.gov',
  'api.fda.gov',
  'api.census.gov',
  'api.bls.gov',
  'api.nasa.gov',
  'api.usa.gov',
  'sdmx.oecd.org',
  'imf.org',
  'ec.europa.eu',
  'unstats.un.org',
  'registry.npmjs.org',
  'api.npmjs.org',
  'hacker-news.firebaseio.com',
  'pypi.org',
  'api.stackexchange.com',
  'libraries.io',
  'api.dictionaryapi.dev',
  'ghoapi.azureedge.net',
  'data.sec.gov',
  'query1.finance.yahoo.com',
  'api.openweathermap.org',
  'newsapi.org',
  'api.semanticscholar.org',
  'api.worldbank.org',
  'api.us.socrata.com',
  'eutils.ncbi.nlm.nih.gov',
  'overpass-api.de',
  'api.github.com',
]);

const CONNECTOR_INFERENCE_RULES: ConnectorInferenceRule[] = [
  { connectorId: 'fred', matches: (url) => normalizeHost(url.hostname) === 'api.stlouisfed.org' },
  { connectorId: 'us_census', matches: (url) => normalizeHost(url.hostname) === 'api.census.gov' },
  { connectorId: 'bls', matches: (url) => normalizeHost(url.hostname) === 'api.bls.gov' },
  { connectorId: 'nasa', matches: (url) => normalizeHost(url.hostname) === 'api.nasa.gov' },
  {
    connectorId: 'fbi_crime',
    matches: (url) => normalizeHost(url.hostname) === 'api.usa.gov' && url.pathname.includes('/crime/fbi/cde'),
  },
  { connectorId: 'stack_exchange', matches: (url) => normalizeHost(url.hostname) === 'api.stackexchange.com' },
  { connectorId: 'libraries_io', matches: (url) => normalizeHost(url.hostname).endsWith('libraries.io') },
  { connectorId: 'openweathermap', matches: (url) => normalizeHost(url.hostname) === 'api.openweathermap.org' },
  { connectorId: 'newsapi', matches: (url) => normalizeHost(url.hostname) === 'newsapi.org' },
  { connectorId: 'github', matches: (url) => normalizeHost(url.hostname) === 'api.github.com' },
  { connectorId: 'socrata', matches: (url) => isSocrataHost(url) },
];

function normalizeHost(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/^www\./, '');
}

function isSocrataHost(url: URL): boolean {
  const host = normalizeHost(url.hostname);
  if (host === 'api.us.socrata.com') return true;
  if (host === 'data.cms.gov') return true;
  if (host.endsWith('.socrata.com')) return true;
  return host.startsWith('data.') && (host.endsWith('.gov') || host.endsWith('.us'));
}

function isLikelyApiUrl(url: URL): boolean {
  const host = normalizeHost(url.hostname);
  if (KNOWN_API_HOSTS.has(host)) return true;
  if (isSocrataHost(url)) return true;
  if (host.startsWith('api.')) return true;

  const path = url.pathname.toLowerCase();
  if (path.endsWith('.json') || path.endsWith('.csv')) return true;
  if (path.includes('/api/') || path.includes('/resource/')) return true;

  return false;
}

function getSocrataBulkDownloadError(url: URL): string | null {
  const path = url.pathname.toLowerCase();
  const accessType = (url.searchParams.get('accessType') || url.searchParams.get('accesstype') || '').toLowerCase();

  if (path.endsWith('/rows.json') && accessType === 'download') {
    return SOCRATA_DOWNLOAD_BLOCK_MESSAGE;
  }

  return null;
}

function inferConnectorIdFromUrl(url: URL): string | undefined {
  for (const rule of CONNECTOR_INFERENCE_RULES) {
    if (rule.matches(url)) {
      return rule.connectorId;
    }
  }
  return undefined;
}

function hasExplicitConnectorAuth(
  connectorId: string,
  queryParams: Record<string, string>,
  requestHeaders: Record<string, string>,
): boolean {
  const authConfig = CONNECTOR_AUTH_CONFIG[connectorId];
  if (!authConfig || authConfig.authType === 'none') return false;

  if (authConfig.authType === 'query_param' && authConfig.authKeyName) {
    return queryParams[authConfig.authKeyName] !== undefined;
  }

  if (authConfig.authType === 'header' && authConfig.authKeyName) {
    return Object.keys(requestHeaders).some((headerName) => headerName.toLowerCase() === authConfig.authKeyName!.toLowerCase());
  }

  if (authConfig.authType === 'bearer') {
    return Object.keys(requestHeaders).some((headerName) => headerName.toLowerCase() === 'authorization');
  }

  return false;
}

function clampTimeoutMs(timeout: unknown): number {
  if (typeof timeout !== 'number' || Number.isNaN(timeout)) {
    return 30000;
  }
  return Math.min(Math.max(timeout, 1000), 55000);
}

function toSafeHeaderMap(headers: unknown): Record<string, string> {
  const safeHeaders: Record<string, string> = {};
  if (!headers || typeof headers !== 'object') return safeHeaders;

  for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
    // Never forward cloud-metadata probe headers (SSRF hardening).
    if (typeof value === 'string' && !FORBIDDEN_OUTBOUND_HEADERS.has(key.toLowerCase())) {
      safeHeaders[key] = value;
    }
  }

  return safeHeaders;
}

function toSafeQueryParamMap(queryParams: unknown): Record<string, string> {
  const safeParams: Record<string, string> = {};
  if (!queryParams || typeof queryParams !== 'object') return safeParams;

  for (const [key, value] of Object.entries(queryParams as Record<string, unknown>)) {
    if (value === null || value === undefined) continue;
    safeParams[key] = String(value);
  }

  return safeParams;
}

function decodeChunks(chunks: Uint8Array[], totalBytes: number): string {
  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

async function readResponseTextWithLimit(
  response: Response,
  maxBytes: number,
): Promise<{ text: string; bytesRead: number; exceeded: boolean }> {
  const reader = response.body?.getReader();
  if (!reader) {
    const fallbackText = await response.text();
    const fallbackBytes = new TextEncoder().encode(fallbackText).length;
    return {
      text: fallbackText,
      bytesRead: fallbackBytes,
      exceeded: fallbackBytes > maxBytes,
    };
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    const remaining = maxBytes - totalBytes;
    if (remaining <= 0) {
      await reader.cancel('Response exceeded configured byte limit');
      return {
        text: decodeChunks(chunks, totalBytes),
        bytesRead: totalBytes + value.byteLength,
        exceeded: true,
      };
    }

    if (value.byteLength > remaining) {
      chunks.push(value.subarray(0, remaining));
      totalBytes += remaining;
      await reader.cancel('Response exceeded configured byte limit');
      return {
        text: decodeChunks(chunks, totalBytes),
        bytesRead: totalBytes + (value.byteLength - remaining),
        exceeded: true,
      };
    }

    chunks.push(value);
    totalBytes += value.byteLength;
  }

  return {
    text: decodeChunks(chunks, totalBytes),
    bytesRead: totalBytes,
    exceeded: false,
  };
}

function inferApiResponseFormat(url: URL): 'json' | 'text' | 'csv' {
  const path = url.pathname.toLowerCase();
  const explicitFormat = (url.searchParams.get('format') || '').toLowerCase();

  if (path.endsWith('.csv') || explicitFormat === 'csv') return 'csv';
  if (path.endsWith('.json') || explicitFormat === 'json') return 'json';
  return 'json';
}

function tryParseUrl(value: string): URL | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(normalized);
  } catch {
    return null;
  }
}

function shouldRouteFetchUrlToApi(fetchUrl: string): boolean {
  const parsedUrl = tryParseUrl(fetchUrl);
  return parsedUrl ? isLikelyApiUrl(parsedUrl) : false;
}

function convertFetchUrlArgsToFetchApiArgs(args: FetchUrlArgs): FetchApiArgs {
  let normalizedUrl = args.url || '';
  if (normalizedUrl && !normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
    normalizedUrl = `https://${normalizedUrl}`;
  }

  let responseFormat: 'json' | 'text' | 'csv' = 'json';
  try {
    responseFormat = inferApiResponseFormat(new URL(normalizedUrl));
  } catch {
    responseFormat = 'json';
  }

  return {
    url: normalizedUrl,
    method: 'GET',
    response_format: responseFormat,
  };
}

function isBlockedUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    const hostname = url.hostname.toLowerCase();

    // Block non-http(s) protocols
    if (!['http:', 'https:'].includes(url.protocol)) {
      return true;
    }

    // Check against blocked hosts
    for (const blocked of BLOCKED_HOSTS) {
      if (hostname === blocked || hostname.startsWith(blocked)) {
        return true;
      }
    }

    return false;
  } catch {
    return true; // Invalid URL = blocked
  }
}

/**
 * SSRF protection.
 *
 * isBlockedUrl() only string-matches the literal hostname, which is trivially
 * bypassed by a DNS name that resolves to an internal IP (e.g. the GCP metadata
 * server at 169.254.169.254) or by decimal/hex/IPv6 IP encodings. The helpers
 * below actually resolve the host and reject any request that targets a
 * private, loopback, link-local, or otherwise-reserved address. Combined with
 * stripping cloud-metadata request headers (see FORBIDDEN_OUTBOUND_HEADERS in
 * toSafeHeaderMap), this closes the metadata-token-theft path.
 *
 * Known residual: redirects use redirect:'follow' (Node's fetch returns an
 * opaque response for redirect:'manual', so per-hop Location can't be read
 * without pinning via undici's dispatcher). A public host that 302s to an
 * internal service is therefore not re-validated here; the metadata server is
 * still protected because its required Metadata-Flavor header is stripped. To
 * fully close per-hop, add `undici` and pin connections with connect.lookup.
 */
class SsrfBlockedError extends Error {
  constructor(message = 'URL is not allowed (internal or invalid)') {
    super(message);
    this.name = 'SsrfBlockedError';
  }
}

// Outbound headers a caller must never be able to set — cloud metadata probes.
const FORBIDDEN_OUTBOUND_HEADERS = new Set([
  'metadata-flavor',
  'metadata',
  'x-goog-metadata',
  'x-google-metadata',
  'x-aws-ec2-metadata-token',
  'x-aws-ec2-metadata-token-ttl-seconds',
  'x-metadata-token',
]);

function ipv4IsReserved(ip: string): boolean {
  const parts = ip.split('.').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    return true; // malformed → treat as unsafe
  }
  const [a, b, c] = parts;
  if (a === 0) return true;                          // 0.0.0.0/8
  if (a === 10) return true;                         // 10.0.0.0/8 (private)
  if (a === 127) return true;                        // loopback
  if (a === 169 && b === 254) return true;           // link-local (GCP/AWS metadata)
  if (a === 172 && b >= 16 && b <= 31) return true;  // 172.16.0.0/12 (private)
  if (a === 192 && b === 168) return true;           // 192.168.0.0/16 (private)
  if (a === 192 && b === 0 && c === 0) return true;  // 192.0.0.0/24
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT)
  if (a >= 224) return true;                         // multicast / reserved
  return false;
}

function ipIsPrivateOrReserved(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) return ipv4IsReserved(ip);
  if (family === 6) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::') return true;            // loopback / unspecified
    const mapped = lower.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (mapped) return ipv4IsReserved(mapped[1]);                 // IPv4-mapped
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // fc00::/7 ULA
    if (/^fe[89ab]/.test(lower)) return true;                     // fe80::/10 link-local
    return false;
  }
  return true; // not a valid IP literal → unsafe
}

async function assertHostResolvesPublic(hostname: string): Promise<void> {
  const host = hostname.replace(/^\[|\]$/g, ''); // strip IPv6 brackets
  if (net.isIP(host)) {
    if (ipIsPrivateOrReserved(host)) throw new SsrfBlockedError();
    return;
  }
  let addresses: { address: string }[];
  try {
    addresses = await dns.lookup(host, { all: true });
  } catch {
    throw new SsrfBlockedError('URL host could not be resolved');
  }
  if (!addresses.length) throw new SsrfBlockedError('URL host could not be resolved');
  for (const { address } of addresses) {
    if (ipIsPrivateOrReserved(address)) throw new SsrfBlockedError();
  }
}

/**
 * fetch() wrapper that resolves and validates the target host before making the
 * request, rejecting private/loopback/link-local/reserved addresses. Callers
 * keep their own AbortController/timeout via init.signal.
 */
async function safeFetch(initialUrl: string, init: RequestInit): Promise<Response> {
  let parsed: URL;
  try {
    parsed = new URL(initialUrl);
  } catch {
    throw new SsrfBlockedError(`Invalid URL: ${initialUrl}`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new SsrfBlockedError('Only http(s) URLs are allowed');
  }
  await assertHostResolvesPublic(parsed.hostname);
  return fetch(initialUrl, { ...init, redirect: 'follow' });
}

/**
 * Fetch URL and extract readable content
 */
/**
 * Extract links from HTML content
 */
function extractLinks(html: string, baseUrl: string, maxLinks: number = 20): ExtractedLink[] {
  const links: ExtractedLink[] = [];
  const seen = new Set<string>();

  // Navigation/utility link text to skip
  const skipTexts = new Set([
    'home', 'menu', 'search', 'login', 'sign in', 'subscribe', 'newsletter',
    'more', 'read more', 'continue', 'next', 'previous', 'back', 'share',
    'facebook', 'twitter', 'linkedin', 'instagram', 'email', 'print',
    'comments', 'reply', 'like', 'save', 'bookmark', 'follow',
  ]);

  // Match anchor tags with href - more comprehensive regex
  const linkRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = linkRegex.exec(html)) !== null && links.length < maxLinks * 3) {
    let href = match[1];
    let text = match[2]
      .replace(/<[^>]+>/g, ' ') // Remove nested tags
      .replace(/\s+/g, ' ')
      .trim();

    // Skip empty text or very short text (but allow if it looks like a title)
    if (!text || text.length < 5) continue;

    // Skip common non-article links
    const lowerText = text.toLowerCase();
    if (skipTexts.has(lowerText)) continue;
    if (
      lowerText.startsWith('skip to') ||
      lowerText.includes('cookie') ||
      lowerText.includes('privacy policy') ||
      lowerText.includes('terms of') ||
      lowerText.includes('advertisement') ||
      lowerText.includes('sponsored')
    ) continue;

    // Skip anchor links, javascript, and mailto
    if (href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) continue;

    // Resolve relative URLs
    try {
      const resolvedUrl = new URL(href, baseUrl).toString();

      // Skip if already seen
      if (seen.has(resolvedUrl)) continue;
      seen.add(resolvedUrl);

      // Skip external domains for article discovery (keep same domain and subdomains)
      const baseHost = new URL(baseUrl).hostname.replace(/^www\./, '');
      const linkHost = new URL(resolvedUrl).hostname.replace(/^www\./, '');
      if (!linkHost.endsWith(baseHost) && !baseHost.endsWith(linkHost)) continue;

      // Skip common non-article paths
      const path = new URL(resolvedUrl).pathname.toLowerCase();
      if (
        path === '/' ||
        path.match(/^\/(tag|tags|category|categories|author|authors|page|pages|search|login|signin|signup|register|account|cart|checkout|contact|about|help|faq|support|terms|privacy|policy|subscribe|newsletter|rss|feed|sitemap|archive|archives)\/?$/i)
      ) continue;

      // Skip image/video/audio files
      if (path.match(/\.(jpg|jpeg|png|gif|svg|webp|mp4|mp3|wav|pdf)$/i)) continue;

      // Score the link to prioritize likely articles
      let score = 0;

      // Longer text is more likely to be article title
      if (text.length > 30) score += 2;
      if (text.length > 60) score += 2;

      // Path patterns that suggest articles
      if (path.match(/\/\d{4}\/\d{2}\//)) score += 3; // Date in URL like /2024/01/
      if (path.match(/\/news\//i)) score += 2;
      if (path.match(/\/story\//i)) score += 2;
      if (path.match(/\/article\//i)) score += 2;
      if (path.split('/').filter(s => s.length > 0).length >= 2) score += 1;

      // Text patterns that suggest article titles (contains action verbs, names, etc)
      if (text.match(/\b(says?|announces?|reveals?|reports?|launches?|introduces?|confirms?)\b/i)) score += 2;
      if (text.match(/[A-Z][a-z]+\s+[A-Z][a-z]+/)) score += 1; // Contains proper nouns

      links.push({
        text: text.slice(0, 150), // Allow slightly longer text for better context
        url: resolvedUrl,
        score,
      } as ExtractedLink & { score: number });
    } catch {
      // Invalid URL, skip
    }
  }

  // Sort by score (descending), then by text length
  return (links as (ExtractedLink & { score?: number })[])
    .sort((a, b) => {
      const scoreA = a.score || 0;
      const scoreB = b.score || 0;
      if (scoreB !== scoreA) return scoreB - scoreA;
      return b.text.length - a.text.length;
    })
    .slice(0, maxLinks)
    .map(({ text, url }) => ({ text, url })); // Remove score from output
}

async function handleFetchUrl(args: FetchUrlArgs): Promise<ToolResult> {
  let { url } = args;
  const { selector, includeMetadata = true, includeLinks = true, maxLinks = 15, maxLength = 50000 } = args;
  const startTime = Date.now();

  // Add https:// if no protocol specified
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }

  console.log('[handleFetchUrl] Fetching URL:', url);

  // Validate URL
  if (isBlockedUrl(url)) {
    return {
      toolCallId: '', // Will be set by caller
      success: false,
      error: 'URL is not allowed (internal or invalid)',
      metadata: { executionTime: Date.now() - startTime },
    };
  }

  try {
    // Fetch the page with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    const response = await safeFetch(url, {
      headers: {
        'User-Agent': 'SymposiumAI/1.0 (Tool Fetch)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        toolCallId: '',
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
        metadata: { executionTime: Date.now() - startTime },
      };
    }

    const contentType = response.headers.get('content-type') || '';
    const html = await response.text();

    // Simple content extraction (server-side, no JSDOM dependency)
    // For production, add jsdom and @mozilla/readability
    let content: string;
    let metadata: Record<string, string> = {};

    if (selector) {
      // With selector, do basic regex extraction
      const regex = new RegExp(`<${selector}[^>]*>([\\s\\S]*?)</${selector}>`, 'i');
      const match = html.match(regex);
      content = match ? stripHtmlTags(match[1]) : 'No content found for selector';
    } else {
      // Extract title
      const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
      if (titleMatch && includeMetadata) {
        metadata.title = titleMatch[1].trim();
      }

      // Extract meta description
      const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i);
      if (descMatch && includeMetadata) {
        metadata.description = descMatch[1].trim();
      }

      // Extract main content using multiple strategies
      let bodyContent = '';

      // Strategy 1: Look for article tags (may be multiple)
      const articleMatches = html.match(/<article[^>]*>([\s\S]*?)<\/article>/gi);
      if (articleMatches && articleMatches.length > 0) {
        // Combine all articles, prioritizing longer ones (likely main content)
        bodyContent = articleMatches
          .sort((a, b) => b.length - a.length)
          .slice(0, 5) // Take top 5 longest articles
          .join('\n\n');
      }

      // Strategy 2: Look for main content containers
      if (!bodyContent || bodyContent.length < 500) {
        const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
        if (mainMatch && mainMatch[1].length > bodyContent.length) {
          bodyContent = mainMatch[1];
        }
      }

      // Strategy 3: Look for common content class patterns
      if (!bodyContent || bodyContent.length < 500) {
        const contentPatterns = [
          /<div[^>]*class="[^"]*(?:story-body|article-body|post-content|entry-content|article-content|main-content)[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
          /<div[^>]*role="main"[^>]*>([\s\S]*?)<\/div>/gi,
          /<section[^>]*class="[^"]*(?:content|story|article)[^"]*"[^>]*>([\s\S]*?)<\/section>/gi,
        ];

        for (const pattern of contentPatterns) {
          const matches = html.match(pattern);
          if (matches) {
            const combined = matches.join('\n\n');
            if (combined.length > bodyContent.length) {
              bodyContent = combined;
            }
          }
        }
      }

      // Strategy 4: Extract all headlines and their surrounding content
      if (!bodyContent || bodyContent.length < 500) {
        // Get all h1-h3 headings with their parent containers
        const headingContent: string[] = [];
        const headingRegex = /<(h[1-3])[^>]*>([^<]+)<\/\1>/gi;
        let headingMatch;
        while ((headingMatch = headingRegex.exec(html)) !== null) {
          const headingText = headingMatch[2].trim();
          if (headingText.length > 10 && headingText.length < 200) {
            headingContent.push(`## ${headingText}`);
          }
        }

        // Also get paragraphs
        const paragraphRegex = /<p[^>]*>([^<]{50,})<\/p>/gi;
        let pMatch;
        while ((pMatch = paragraphRegex.exec(html)) !== null) {
          const pText = stripHtmlTags(pMatch[1]).trim();
          if (pText.length > 50) {
            headingContent.push(pText);
          }
        }

        if (headingContent.length > 0 && headingContent.join('\n\n').length > bodyContent.length) {
          bodyContent = headingContent.join('\n\n');
        }
      }

      // Strategy 5: Fall back to body
      if (!bodyContent || bodyContent.length < 200) {
        const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        if (bodyMatch) {
          bodyContent = bodyMatch[1];
        } else {
          bodyContent = html;
        }
      }

      // Remove scripts, styles, nav, header, footer, aside, and ads
      content = stripHtmlTags(
        bodyContent
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
          .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
          .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
          .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '')
          .replace(/<div[^>]*class="[^"]*(?:ad|advertisement|promo|sidebar|related)[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '')
      );
    }

    // Clean up whitespace
    content = content
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n\n')
      .trim();

    // Truncate if needed
    const originalLength = content.length;
    const truncated = content.length > maxLength;
    if (truncated) {
      content = content.slice(0, maxLength) + '...';
    }

    // Extract links from the page if requested
    let links: ExtractedLink[] = [];
    if (includeLinks) {
      // Extract from body content
      const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      if (bodyMatch) {
        links = extractLinks(bodyMatch[1], url, maxLinks);
      }
    }

    // Build result with metadata
    let result = '';
    if (includeMetadata && Object.keys(metadata).length > 0) {
      if (metadata.title) result += `Title: ${metadata.title}\n`;
      if (metadata.description) result += `Description: ${metadata.description}\n`;
      result += '\n---\n\n';
    }
    result += content;

    // Add links section if links were found
    if (includeLinks && links.length > 0) {
      result += '\n\n---\n\n**Links found on page:**\n';
      for (const link of links) {
        result += `- ${link.text}: ${link.url}\n`;
      }
    }

    return {
      toolCallId: '',
      success: true,
      content: result,
      metadata: {
        executionTime: Date.now() - startTime,
        truncated,
        originalLength,
      },
    };
  } catch (error: any) {
    console.error('[handleFetchUrl] Error fetching URL:', {
      url,
      errorName: error.name,
      errorMessage: error.message,
      errorCause: error.cause,
      errorStack: error.stack?.slice(0, 500),
    });

    const errorMessage = error.name === 'AbortError'
      ? 'Request timed out'
      : error.message || 'Failed to fetch URL';

    return {
      toolCallId: '',
      success: false,
      error: `Failed to fetch URL: ${errorMessage}`,
      metadata: { executionTime: Date.now() - startTime },
    };
  }
}

/**
 * Strip HTML tags from content
 */
function stripHtmlTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&[a-z]+;/gi, ' ');
}

// ============================================================================
// salesforce_docs_lookup Handler
// ============================================================================

const SALESFORCE_DOCS_FALLBACK_CONCURRENCY = 3;
const SALESFORCE_DOCS_FALLBACK_DEADLINE_MS = 70_000;
const SALESFORCE_DOCS_QUERY_FETCH_OPTIONS = {
  // Never launch headless Chrome inside executeTool; a single short attempt so
  // one slow official host cannot consume the whole topic budget.
  allowRendering: false,
  fetchTimeoutMs: 10000,
  maxAttempts: 1,
} as const;

interface SalesforceDocsFallbackCandidate {
  title: string;
  url: string;
  snippet?: string;
  content: string;
  contentQuality: 'full_text' | 'metadata_only';
  apiVersion?: string;
  releaseLabel?: string;
  documentationVersion?: string;
  warnings: string[];
}

interface SalesforceDocsFallbackResolution {
  topic: SalesforceDocsTopic;
  candidates: SalesforceDocsFallbackCandidate[];
  warnings: string[];
  rejectedUrls: string[];
}

async function runWithConcurrency<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<T[]> {
  const results = new Array<T>(tasks.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, tasks.length)) }, async () => {
    while (nextIndex < tasks.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await tasks[index]();
    }
  });
  await Promise.all(workers);
  return results;
}

async function fetchSalesforceDocsFallbackCandidate(
  topic: SalesforceDocsTopic,
  candidate: { title: string; url: string; snippet?: string },
  warnings: string[],
): Promise<SalesforceDocsFallbackCandidate | null> {
  if (/\.pdf$/i.test(new URL(candidate.url).pathname)) {
    warnings.push(`Skipped official Salesforce PDF ${candidate.url} for ${topic.label}: PDF guides are served from the cached documentation index, not live lookup.`);
    return null;
  }
  try {
    const content = await fetchOfficialDocContent(candidate.url, SALESFORCE_DOCS_QUERY_FETCH_OPTIONS);
    return {
      title: content.title || candidate.title || candidate.url,
      url: candidate.url,
      snippet: candidate.snippet,
      content: content.text,
      contentQuality: content.contentQuality,
      apiVersion: content.apiVersion,
      releaseLabel: content.releaseLabel,
      documentationVersion: content.documentationVersion,
      warnings: content.warnings || [],
    };
  } catch (error: any) {
    warnings.push(`Fetch failed for ${candidate.url}: ${error?.message || 'no content returned'}`);
    return null;
  }
}

async function resolveSalesforceDocsFallbackTopic(input: {
  topic: SalesforceDocsTopic;
  uid: string;
  encryptionKeyValue: string;
  releaseContext?: string;
  maxResultsPerTopic: number;
  seenSourceKeys: ReadonlySet<string>;
  deadlineAt: number;
}): Promise<SalesforceDocsFallbackResolution> {
  const { topic } = input;
  const warnings: string[] = [];
  const rejectedUrls: string[] = [];
  const candidates: SalesforceDocsFallbackCandidate[] = [];
  const resolution: SalesforceDocsFallbackResolution = { topic, candidates, warnings, rejectedUrls };
  const deadlineExceeded = () => {
    if (Date.now() < input.deadlineAt) return false;
    warnings.push(`Salesforce docs lookup deadline was reached before ${topic.label} could be resolved live; rerun the tool with fewer topics for live coverage.`);
    return true;
  };

  const directTopicUrl = canonicalizeSalesforceDocsUrl(topic.query);
  if (directTopicUrl) {
    if (input.seenSourceKeys.has(`${topic.id}:${directTopicUrl}`)) return resolution;
    if (deadlineExceeded()) return resolution;
    const candidate = await fetchSalesforceDocsFallbackCandidate(topic, {
      title: topic.label,
      url: directTopicUrl,
      snippet: 'Direct official Salesforce documentation reference supplied by the audit context.',
    }, warnings);
    if (candidate) candidates.push(candidate);
    return resolution;
  }

  if (/^https?:\/\//i.test(topic.query.trim())) {
    rejectedUrls.push(topic.query.trim());
    warnings.push(`Documentation reference for ${topic.label} is not an allowed official Salesforce HTTPS URL.`);
    return resolution;
  }

  if (deadlineExceeded()) return resolution;
  const query = buildSalesforceDocsSearchQuery(topic, input.releaseContext);
  let searchResponse: Awaited<ReturnType<typeof executeWebSearch>>;
  try {
    searchResponse = await executeWebSearch(input.uid, {
      query,
      num_results: Math.max(input.maxResultsPerTopic * 3, 5),
    }, input.encryptionKeyValue);
  } catch (error: any) {
    warnings.push(`Search failed for ${topic.label}: ${error?.message || 'unknown search failure'}`);
    return resolution;
  }

  const officialResults: Array<{ title: string; url: string; snippet?: string }> = [];
  for (const result of searchResponse.results || []) {
    const canonicalUrl = canonicalizeSalesforceDocsUrl(result.url);
    if (!canonicalUrl) {
      rejectedUrls.push(result.url);
      continue;
    }
    if (input.seenSourceKeys.has(`${topic.id}:${canonicalUrl}`)) continue;
    if (officialResults.some((existing) => existing.url === canonicalUrl)) continue;
    officialResults.push({ title: result.title, url: canonicalUrl, snippet: result.snippet });
    if (officialResults.length >= input.maxResultsPerTopic) break;
  }

  if (officialResults.length === 0) {
    warnings.push(`No official Salesforce documentation result was found for ${topic.label}.`);
    return resolution;
  }

  for (const result of officialResults) {
    if (deadlineExceeded()) return resolution;
    const candidate = await fetchSalesforceDocsFallbackCandidate(topic, result, warnings);
    if (candidate) candidates.push(candidate);
  }
  return resolution;
}

async function handleSalesforceDocsLookup(
  args: SalesforceDocsLookupArgs,
  uid: string,
  encryptionKeyValue: string
): Promise<ToolResult> {
  const startTime = Date.now();
  const generatedAt = new Date().toISOString();
  const componentTypes = normalizeStringArray(args.componentTypes);
  const apiVersions = normalizeStringArray(args.apiVersions);
  const riskSignalIds = normalizeStringArray(args.riskSignalIds);
  const topics = normalizeSalesforceDocsTopics(args.topics, componentTypes, apiVersions, riskSignalIds);
  const maxResultsPerTopic = clampInteger(args.maxResultsPerTopic, 1, 5, 2);
  const warnings: string[] = [];
  const releaseContextWarnings: string[] = [];
  const rejectedUrls = new Set<string>();
  const sources: SalesforceDocEvidenceSource[] = [];
  const seenSourceKeys = new Set<string>();
  const sourceKey = (topicId: string, url: string) => `${topicId}:${url}`;
  let docsIndexSummary: Record<string, unknown> | undefined;

  const deadlineAt = startTime + SALESFORCE_DOCS_FALLBACK_DEADLINE_MS;
  const [releaseFetch, indexLookup] = await Promise.all([
    handleFetchUrl({
      url: SALESFORCE_RELEASES_URL,
      includeMetadata: true,
      maxLength: 20000,
    }),
    lookupSalesforceDocsIndex(topics, {
      generatedAt,
      maxResultsPerTopic,
    }),
  ]);
  let detectedRelease: string | undefined;
  if (releaseFetch.success && releaseFetch.content) {
    const match = releaseFetch.content.match(SALESFORCE_RELEASE_LABEL_PATTERN);
    detectedRelease = match ? `${match[1]} '${match[2]}` : undefined;
    const releaseSource = buildSalesforceDocEvidenceSource({
      topic: {
        id: 'salesforce-release-context',
        label: 'Salesforce release context',
        query: 'Salesforce release cycle current releases',
        category: 'release',
        reasons: ['Runtime release context is derived from the official Salesforce releases page.'],
        componentTypes: [],
        apiVersions: [],
        riskSignalIds: [],
      },
      title: 'Salesforce Releases',
      url: SALESFORCE_RELEASES_URL,
      snippet: 'Official Salesforce releases page used to derive release context.',
      content: releaseFetch.content,
      retrievedAt: generatedAt,
      sourceIndex: 1,
    });
    sources.push(releaseSource);
    seenSourceKeys.add(sourceKey(releaseSource.topicId, releaseSource.url));
  } else {
    releaseContextWarnings.push(`Could not derive Salesforce release context from ${SALESFORCE_RELEASES_URL}: ${releaseFetch.error || 'no content returned'}`);
  }

  if (topics.length === 0) {
    warnings.push('No documentation topics were provided; Salesforce docs lookup could not ground audit claims.');
  }

  warnings.push(...indexLookup.warnings);
  docsIndexSummary = indexLookup.indexSummary;
  // Only alias-routed hits (topics the index genuinely curates) may suppress
  // live lookup. Token-scavenged matches keep their index sources as
  // supplementary evidence, but the topic still goes to live fallback —
  // otherwise a tangential "bulk"/"limits" overlap blocks real coverage.
  const aliasRoutedTopicIds = new Set(indexLookup.aliasRoutedTopicIds || []);
  const cachedTopicIds = new Set(
    indexLookup.indexSummary?.status === 'hit'
      ? indexLookup.sources
        .filter((source) => source.confidenceImpact !== 'stale-risk')
        .map((source) => source.topicId)
        .filter((topicId) => aliasRoutedTopicIds.has(topicId))
      : []
  );
  for (const source of indexLookup.sources) {
    const key = sourceKey(source.topicId, source.url);
    if (seenSourceKeys.has(key)) continue;
    seenSourceKeys.add(key);
    sources.push({
      ...source,
      id: `sf-doc-${sources.length + 1}`,
    });
  }

  // Live fallback for topics the cached index could not satisfy, fetched via
  // the same official-doc extraction the indexer uses (raw fetch_url gets JS
  // shells/403s from Salesforce domains). Topics run through a small pool, but
  // the deadline check before each network call is what actually bounds this
  // handler under the client's 90s tool timeout — worst-case pool math alone
  // (4 waves x (search + 2 fetches)) would exceed it.
  const fallbackTopics = topics.slice(0, 12).filter((topic) => !cachedTopicIds.has(topic.id));
  const seenSourceKeySnapshot: ReadonlySet<string> = new Set(seenSourceKeys);
  const fallbackResolutions = await runWithConcurrency(
    fallbackTopics.map((topic) => () => resolveSalesforceDocsFallbackTopic({
      topic,
      uid,
      encryptionKeyValue,
      releaseContext: args.releaseContext || detectedRelease,
      maxResultsPerTopic,
      seenSourceKeys: seenSourceKeySnapshot,
      deadlineAt,
    })),
    SALESFORCE_DOCS_FALLBACK_CONCURRENCY,
  );

  for (const resolution of fallbackResolutions) {
    warnings.push(...resolution.warnings);
    resolution.rejectedUrls.forEach((rejectedUrl) => rejectedUrls.add(rejectedUrl));
    for (const candidate of resolution.candidates) {
      const key = sourceKey(resolution.topic.id, candidate.url);
      if (seenSourceKeys.has(key)) continue;
      seenSourceKeys.add(key);
      sources.push(buildSalesforceDocEvidenceSource({
        topic: resolution.topic,
        title: candidate.title,
        url: candidate.url,
        snippet: candidate.snippet,
        content: candidate.content,
        retrievedAt: generatedAt,
        sourceIndex: sources.length + 1,
        contentQuality: candidate.contentQuality,
        apiVersion: candidate.apiVersion,
        releaseLabel: candidate.releaseLabel,
        documentationVersion: candidate.documentationVersion,
        extraWarnings: candidate.warnings,
      }));
    }
  }

  const evidence = {
    version: 1,
    generatedAt,
    releaseContext: {
      requested: args.releaseContext,
      detected: detectedRelease,
      sourceUrl: sources.find((source) => source.topicId === 'salesforce-release-context')?.url,
      warnings: releaseContextWarnings,
    },
    officialDomainPolicy: {
      allowedHostPattern: '*.salesforce.com',
      rejectedUrls: Array.from(rejectedUrls).sort(),
    },
    documentationIndex: buildSalesforceDocumentationIndexHealth(
      docsIndexSummary,
      topics,
      sources,
      warnings,
    ),
    topics,
    sources: sources.sort((a, b) => a.topicId.localeCompare(b.topicId) || a.title.localeCompare(b.title)),
    warnings,
  };

  return {
    toolCallId: '',
    success: true,
    content: JSON.stringify(evidence),
    metadata: {
      executionTime: Date.now() - startTime,
      originalLength: JSON.stringify(evidence).length,
    },
  };
}

function buildSalesforceDocumentationIndexHealth(
  indexSummary: Record<string, unknown> | undefined,
  topics: SalesforceDocsTopic[],
  sources: SalesforceDocEvidenceSource[],
  warnings: string[],
): Record<string, unknown> | undefined {
  const sourceCountByTopic = sources.reduce((acc, source) => {
    if (source.topicId === 'salesforce-release-context') return acc;
    acc[source.topicId] = (acc[source.topicId] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const indexedMisses = new Map<string, { reason?: string; label?: string }>();
  const rawMisses = Array.isArray(indexSummary?.missedTopics) ? indexSummary!.missedTopics as Array<Record<string, unknown>> : [];
  rawMisses.forEach((miss) => {
    if (typeof miss.topicId === 'string') {
      indexedMisses.set(miss.topicId, {
        reason: typeof miss.reason === 'string' ? miss.reason : undefined,
        label: typeof miss.label === 'string' ? miss.label : undefined,
      });
    }
  });
  const indexedCoverage = new Map<string, { status?: string; sourceCount?: number }>();
  const rawCoverage = Array.isArray(indexSummary?.topicCoverage) ? indexSummary!.topicCoverage as Array<Record<string, unknown>> : [];
  rawCoverage.forEach((coverage) => {
    if (typeof coverage.topicId === 'string') {
      indexedCoverage.set(coverage.topicId, {
        status: typeof coverage.status === 'string' ? coverage.status : undefined,
        sourceCount: typeof coverage.sourceCount === 'number' ? coverage.sourceCount : undefined,
      });
    }
  });

  const topicCoverage = topics.map((topic) => {
    const sourceCount = sourceCountByTopic[topic.id] || 0;
    if (sourceCount > 0) {
      const sourceWarnings = sources
        .filter((source) => source.topicId === topic.id)
        .flatMap((source) => source.warnings);
      const stale = sources
        .filter((source) => source.topicId === topic.id)
        .some((source) => source.confidenceImpact === 'stale-risk')
        || sourceWarnings.some((warning) => /older than|stale|due|overdue/i.test(warning));
      return {
        topicId: topic.id,
        status: stale ? 'stale' : 'hit',
        sourceCount,
      };
    }

    const indexedTopicCoverage = indexedCoverage.get(topic.id);
    if (indexedTopicCoverage?.sourceCount && indexedTopicCoverage.sourceCount > 0) {
      return {
        topicId: topic.id,
        status: indexedTopicCoverage.status === 'stale' ? 'stale' : 'hit',
        sourceCount: indexedTopicCoverage.sourceCount,
        reason: 'Official Salesforce documentation source(s) matched this topic in the cached index.',
      };
    }

    const relatedWarnings = warnings.filter((warning) =>
      warning.toLowerCase().includes(topic.label.toLowerCase())
      || warning.toLowerCase().includes(topic.id.toLowerCase())
    );
    const joined = relatedWarnings.join(' ');
    let status = indexedMisses.get(topic.id)?.reason || 'no_official_source';
    if (/403|permission|blocked|rate limit|rate-limit|too many requests/i.test(joined)) status = 'blocked';
    if (/too short|loading|empty|no content/i.test(joined)) status = 'empty_shell';
    if (!indexSummary || indexSummary.status === 'unavailable') status = 'unavailable';

    return {
      topicId: topic.id,
      status,
      sourceCount,
      reason: relatedWarnings[0] || indexedMisses.get(topic.id)?.reason || 'No official Salesforce documentation source was fetched for this topic.',
    };
  });

  const missedTopics = topicCoverage
    .filter((coverage) => coverage.sourceCount === 0)
    .map((coverage) => ({
      topicId: coverage.topicId,
      label: topics.find((topic) => topic.id === coverage.topicId)?.label,
      reason: coverage.status,
    }));
  const hasTopicSources = topicCoverage.some((coverage) => coverage.sourceCount > 0);
  const hasStaleTopic = topicCoverage.some((coverage) => coverage.status === 'stale');

  return {
    ...(indexSummary || {
      status: sources.length > 0 ? 'hit' : 'unavailable',
      storagePath: 'live-official-lookup',
      recordCount: 0,
    }),
    status: hasTopicSources ? (hasStaleTopic ? 'stale' : 'hit') : (indexSummary?.status || 'unavailable'),
    topicCoverage,
    missedTopics,
    stalenessWarnings: warnings.filter((warning) => /older than|stale|previous|preview|beta|pilot|due|overdue/i.test(warning)),
  };
}

function normalizeSalesforceDocsTopics(
  rawTopics: SalesforceDocsLookupArgs['topics'],
  componentTypes: string[],
  apiVersions: string[],
  riskSignalIds: string[]
): SalesforceDocsTopic[] {
  if (!Array.isArray(rawTopics)) return [];
  return rawTopics.flatMap((topic, index): SalesforceDocsTopic[] => {
    if (typeof topic === 'string' && topic.trim()) {
      const label = topic.trim();
      return [{
        id: slugify(label) || `topic-${index + 1}`,
        label,
        query: label,
        category: 'general',
        reasons: ['User/model supplied documentation topic.'],
        componentTypes,
        apiVersions,
        riskSignalIds,
      }];
    }
    if (!topic || typeof topic !== 'object' || Array.isArray(topic)) return [];
    const label = typeof topic.label === 'string' && topic.label.trim()
      ? topic.label.trim()
      : typeof topic.query === 'string' && topic.query.trim()
        ? topic.query.trim()
        : `Salesforce documentation topic ${index + 1}`;
    return [{
      id: typeof topic.id === 'string' && topic.id.trim() ? slugify(topic.id) : slugify(label) || `topic-${index + 1}`,
      label,
      query: typeof topic.query === 'string' && topic.query.trim() ? topic.query.trim() : label,
      category: typeof topic.category === 'string' && topic.category.trim() ? topic.category.trim() : 'general',
      reasons: normalizeStringArray(topic.reasons),
      componentTypes: normalizeStringArray(topic.componentTypes).length > 0 ? normalizeStringArray(topic.componentTypes) : componentTypes,
      apiVersions: normalizeStringArray(topic.apiVersions).length > 0 ? normalizeStringArray(topic.apiVersions) : apiVersions,
      riskSignalIds: normalizeStringArray(topic.riskSignalIds).length > 0 ? normalizeStringArray(topic.riskSignalIds) : riskSignalIds,
    }];
  });
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(
    value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean)
  ));
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

function buildSalesforceDocsSearchQuery(topic: SalesforceDocsTopic, releaseContext?: string): string {
  const query = [
    'Salesforce official documentation',
    topic.query,
    topic.componentTypes.length > 0 ? topic.componentTypes.join(' ') : '',
    topic.apiVersions.length > 0 ? `API version ${topic.apiVersions.join(' ')}` : '',
    releaseContext ? `release ${releaseContext}` : '',
    'site:help.salesforce.com OR site:developer.salesforce.com OR site:architect.salesforce.com OR site:salesforce.com',
  ].filter(Boolean).join(' ');
  return query.length > 480 ? query.slice(0, 480).trim() : query;
}

function buildSalesforceDocsChunkTokens(query: string): string[] {
  return Array.from(new Set(
    query
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((term) => term.length >= 3)
  ));
}

function scoreSalesforceDocsChunk(text: string, tokens: string[]): number {
  const haystack = text.toLowerCase();
  return tokens.reduce((score, token) => {
    if (!haystack.includes(token)) return score;
    return score + (token.length >= 8 ? 4 : 2);
  }, 0);
}

function buildSalesforceDocsMatchedChunks(
  content: string,
  query: string,
  sourceId: string,
): NonNullable<SalesforceDocEvidenceSource['matchedChunks']> {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (normalized.length < 80) return [];
  const targetChars = 3500;
  const overlapChars = 350;
  const step = targetChars - overlapChars;
  const tokens = buildSalesforceDocsChunkTokens(query);
  const chunks: NonNullable<SalesforceDocEvidenceSource['matchedChunks']> = [];
  for (let start = 0; start < normalized.length; start += step) {
    const text = normalized.slice(start, start + targetChars).trim();
    if (text.length < 80) continue;
    chunks.push({
      id: `${sourceId}-chunk-${chunks.length + 1}`,
      ordinal: chunks.length + 1,
      text,
      score: scoreSalesforceDocsChunk(text, tokens),
      contentLength: text.length,
    });
  }
  const scored = chunks
    .filter((chunk) => chunk.score > 0)
    .sort((a, b) => b.score - a.score || a.ordinal - b.ordinal)
    .slice(0, 5);
  return scored.length > 0 ? scored : chunks.slice(0, 2);
}

function canonicalizeSalesforceDocsUrl(urlValue: string): string | null {
  try {
    const url = new URL(urlValue);
    if (url.protocol !== 'https:' || !SALESFORCE_OFFICIAL_HOST_PATTERN.test(url.hostname)) {
      return null;
    }
    url.hash = '';
    for (const key of Array.from(url.searchParams.keys())) {
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

function buildSalesforceDocEvidenceSource(input: {
  topic: SalesforceDocsTopic;
  title: string;
  url: string;
  snippet?: string;
  content: string;
  retrievedAt: string;
  sourceIndex: number;
  contentQuality?: 'full_text' | 'metadata_only';
  apiVersion?: string;
  releaseLabel?: string;
  documentationVersion?: string;
  extraWarnings?: string[];
}): SalesforceDocEvidenceSource {
  const sourceId = `sf-doc-${input.sourceIndex}`;
  const status = inferSalesforceDocumentationStatus(input.content);
  const warnings = [...inferSalesforceDocWarnings(input.content, status), ...(input.extraWarnings || [])];
  const matchedChunks = buildSalesforceDocsMatchedChunks(input.content, input.topic.query, sourceId);
  return {
    id: sourceId,
    topicId: input.topic.id,
    title: input.title,
    url: input.url,
    domain: new URL(input.url).hostname,
    sourceType: inferSalesforceDocSourceType(input.url),
    status,
    retrievedAt: input.retrievedAt,
    responseHash: crypto.createHash('sha256').update(input.content).digest('hex'),
    contentQuality: input.contentQuality || 'full_text',
    contentLength: input.content.length,
    excerpt: buildSalesforceDocExcerpt(input.content, input.topic.query),
    matchedChunks: matchedChunks.length > 0 ? matchedChunks : undefined,
    searchSnippet: input.snippet,
    warnings,
    apiVersion: input.apiVersion,
    releaseLabel: input.releaseLabel,
    documentationVersion: input.documentationVersion,
    confidenceImpact: confidenceImpactForSalesforceEvidence(status, warnings),
  };
}

function confidenceImpactForSalesforceEvidence(
  status: SalesforceDocEvidenceSource['status'],
  warnings: string[],
): SalesforceDocEvidenceSource['confidenceImpact'] {
  if (warnings.some((warning) => /older than|stale|due|overdue/i.test(warning))) return 'stale-risk';
  if (status === 'preview' || warnings.some((warning) => /preview|beta|pilot|not-yet-GA|not yet GA/i.test(warning))) {
    return 'preview-risk';
  }
  if (warnings.some((warning) => /previous-release|previous release|previous/i.test(warning))) {
    return 'release-link-risk';
  }
  return 'supports';
}

function inferSalesforceDocSourceType(urlValue: string): SalesforceDocEvidenceSource['sourceType'] {
  const url = new URL(urlValue);
  if (url.pathname.endsWith('.pdf')) {
    return /release[-_]?notes/i.test(url.pathname) ? 'release_notes_pdf' : 'pdf_guide';
  }
  if (url.hostname === 'www.salesforce.com' || url.pathname.includes('/releases')) return 'release_page';
  if (url.hostname === 'help.salesforce.com' && (
    url.pathname.includes('release-notes')
    || /^release-notes\./i.test(url.searchParams.get('id') || '')
  )) return 'release_notes';
  if (url.hostname === 'developer.salesforce.com') return 'developer_doc';
  if (url.hostname === 'help.salesforce.com') return 'help_doc';
  if (url.hostname === 'architect.salesforce.com') return 'architect_doc';
  return 'official_doc';
}

function inferSalesforceDocWarnings(content: string, status: SalesforceDocEvidenceSource['status']): string[] {
  const warnings: string[] = [];
  if (status === 'preview') {
    warnings.push('Source contains preview, beta, pilot, or not-yet-GA language; recommendations must be confidence-downgraded.');
  }
  if (/links point to material from the previous release|previous-release documentation|previous release/i.test(content)) {
    warnings.push('Source warns that linked documentation may point to previous-release material.');
  }
  return warnings;
}

function buildSalesforceDocExcerpt(content: string, query: string): string {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (normalized.length <= 500) return normalized;
  const terms = query.toLowerCase().split(/[^a-z0-9]+/).filter((term) => term.length >= 4);
  const lower = normalized.toLowerCase();
  const index = terms
    .map((term) => lower.indexOf(term))
    .filter((position) => position >= 0)
    .sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, index - 180);
  return `${start > 0 ? '...' : ''}${normalized.slice(start, start + 500)}${start + 500 < normalized.length ? '...' : ''}`;
}

// ============================================================================
// fetch_api Handler
// ============================================================================

interface FetchApiArgs {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, unknown>;
  query_params?: Record<string, unknown>;
  body?: string | Record<string, unknown>;
  response_format?: 'json' | 'text' | 'csv';
  api_key_ref?: string;
  timeout?: number;
}

/**
 * Normalize FBI CDE month-year query params.
 * API expects MM-YYYY for from/to; accept YYYY as shorthand.
 */
function normalizeFbiDateParam(value: unknown, fallbackMonth: '01' | '12'): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^\d{4}$/.test(trimmed)) {
    return `${fallbackMonth}-${trimmed}`;
  }

  const monthYearMatch = trimmed.match(/^(\d{1,2})-(\d{4})$/);
  if (monthYearMatch) {
    const month = monthYearMatch[1].padStart(2, '0');
    return `${month}-${monthYearMatch[2]}`;
  }

  return null;
}

async function handleFetchApi(
  args: FetchApiArgs,
  uid: string,
  encryptionKeyValue: string,
  maxBytes: number = MAX_FETCH_API_RESPONSE_BYTES,
): Promise<ToolResult> {
  const startTime = Date.now();
  let { url } = args;
  const {
    method = 'GET',
    headers: customHeaders,
    query_params: rawQueryParams,
    body,
    response_format = 'json',
    api_key_ref,
    timeout,
  } = args;
  const clampedTimeout = clampTimeoutMs(timeout);

  // Validate URL
  if (!url || typeof url !== 'string') {
    return {
      toolCallId: '',
      success: false,
      error: 'URL is required',
      metadata: { executionTime: Date.now() - startTime },
    };
  }

  // Add https:// if no protocol specified
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return {
      toolCallId: '',
      success: false,
      error: `Invalid URL: ${url}`,
      metadata: { executionTime: Date.now() - startTime },
    };
  }

  // Block private/internal URLs
  if (isBlockedUrl(url)) {
    return {
      toolCallId: '',
      success: false,
      error: 'URL is not allowed (internal or invalid)',
      metadata: { executionTime: Date.now() - startTime },
    };
  }

  const socrataDownloadError = getSocrataBulkDownloadError(parsedUrl);
  if (socrataDownloadError) {
    return {
      toolCallId: '',
      success: false,
      error: socrataDownloadError,
      metadata: { executionTime: Date.now() - startTime },
    };
  }

  const requestHeaders: Record<string, string> = {
    'User-Agent': 'SymposiumAI/1.0 (Analyze Tool)',
    'Accept': 'application/json, text/plain, */*',
    ...toSafeHeaderMap(customHeaders),
  };
  const queryParams = toSafeQueryParamMap(rawQueryParams);

  let connectorRef = api_key_ref;
  if (!connectorRef) {
    const inferred = inferConnectorIdFromUrl(parsedUrl);
    if (inferred && !hasExplicitConnectorAuth(inferred, queryParams, requestHeaders)) {
      connectorRef = inferred;
      console.log('[handleFetchApi] Inferred api_key_ref from URL', { host: parsedUrl.host + parsedUrl.pathname, connectorRef });
    }
  }

  // Log host+path only — query string may carry inline credentials.
  console.log('[handleFetchApi] Request:', { host: parsedUrl.host + parsedUrl.pathname, method, api_key_ref: connectorRef, uid });

  // Resolve api_key_ref if provided
  if (connectorRef) {
    if (!VALID_CONNECTOR_IDS.includes(connectorRef)) {
      return {
        toolCallId: '',
        success: false,
        error: `Unknown data connector: ${connectorRef}`,
        metadata: { executionTime: Date.now() - startTime },
      };
    }

    const authConfig = CONNECTOR_AUTH_CONFIG[connectorRef];
    if (!authConfig) {
      return {
        toolCallId: '',
        success: false,
        error: `No auth configuration for connector: ${connectorRef}`,
        metadata: { executionTime: Date.now() - startTime },
      };
    }

    // Only resolve key if connector requires authentication
    if (authConfig.authType !== 'none' && authConfig.authKeyName) {
      // Try user's stored key first, then fall back to Symposium-managed key
      const rawApiKey = await getDecryptedDataServiceKey(uid, connectorRef, encryptionKeyValue)
        || authConfig.getManagedKey?.()
        || null;
      const apiKey = typeof rawApiKey === 'string' ? rawApiKey.trim() : '';
      if (!apiKey) {
        return {
          toolCallId: '',
          success: false,
          error: `API key not configured for ${connectorRef}. Add your key in Settings > Data Sources.`,
          metadata: { executionTime: Date.now() - startTime },
        };
      }

      // Inject auth based on connector type
      switch (authConfig.authType) {
        case 'query_param':
          queryParams[authConfig.authKeyName] = apiKey;
          break;
        case 'header':
          requestHeaders[authConfig.authKeyName] = apiKey;
          break;
        case 'bearer':
          requestHeaders['Authorization'] = `Bearer ${apiKey}`;
          break;
      }
    }
  }

  // Connector-specific param normalization
  if (connectorRef === 'fbi_crime') {
    const normalizedFrom = normalizeFbiDateParam(queryParams.from, '01');
    const normalizedTo = normalizeFbiDateParam(queryParams.to, '12');
    if (normalizedFrom) queryParams.from = normalizedFrom;
    if (normalizedTo) queryParams.to = normalizedTo;
  }

  // Build URL with query params
  for (const [key, value] of Object.entries(queryParams)) {
    parsedUrl.searchParams.set(key, String(value));
  }
  url = parsedUrl.toString();

  // Build request options
  const fetchOptions: RequestInit = {
    method,
    headers: requestHeaders,
  };

  // Add body for POST/PUT
  if (body && (method === 'POST' || method === 'PUT')) {
    if (typeof body === 'object') {
      fetchOptions.body = JSON.stringify(body);
      requestHeaders['Content-Type'] = requestHeaders['Content-Type'] || 'application/json';
    } else {
      fetchOptions.body = body;
    }
  }

  // Execute request with timeout
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), clampedTimeout);
    fetchOptions.signal = controller.signal;

    const response = await safeFetch(url, fetchOptions);
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      const truncatedBody = errorBody.slice(0, 500);

      // Provide helpful error messages for common status codes
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      if (response.status === 401 || response.status === 403) {
        errorMessage += '. API key may be invalid or expired. Check your key in Settings > Data Sources.';
      } else if (response.status === 429) {
        errorMessage += '. Rate limited - try again later.';
      }
      if (truncatedBody) {
        errorMessage += `\n${truncatedBody}`;
      }

      return {
        toolCallId: '',
        success: false,
        error: errorMessage,
        metadata: { executionTime: Date.now() - startTime },
      };
    }

    const contentLengthHeader = parseInt(response.headers.get('content-length') || '', 10);
    if (Number.isFinite(contentLengthHeader) && contentLengthHeader > maxBytes) {
      return {
        toolCallId: '',
        success: false,
        error: `Response too large (${contentLengthHeader} bytes). Reduce payload size with API-side filters/pagination (for example: $limit, per_page, page, date range).`,
        metadata: {
          executionTime: Date.now() - startTime,
          originalLength: contentLengthHeader,
          truncated: true,
        },
      };
    }

    const { text: rawBody, bytesRead, exceeded } = await readResponseTextWithLimit(response, maxBytes);
    if (exceeded) {
      return {
        toolCallId: '',
        success: false,
        error: `Response exceeded ${maxBytes} bytes (${bytesRead} bytes read). Narrow the query and paginate to keep each response small.`,
        metadata: {
          executionTime: Date.now() - startTime,
          originalLength: bytesRead,
          truncated: true,
        },
      };
    }

    // Parse response based on format
    let content = rawBody;
    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    const shouldTreatAsJson = response_format === 'json' || contentType.includes('application/json') || contentType.includes('+json');

    if (shouldTreatAsJson) {
      try {
        const data = JSON.parse(rawBody);
        content = JSON.stringify(data);
      } catch (jsonError: any) {
        return {
          toolCallId: '',
          success: false,
          error: `Failed to parse JSON response. ${jsonError?.message || 'Malformed JSON received from API.'}`,
          metadata: {
            executionTime: Date.now() - startTime,
            originalLength: contentLengthHeader || bytesRead,
          },
        };
      }
    }

    return {
      toolCallId: '',
      success: true,
      content,
      metadata: {
        executionTime: Date.now() - startTime,
        originalLength: contentLengthHeader || bytesRead,
        contentType: contentType || undefined,
      },
    };
  } catch (error: any) {
    console.error('[handleFetchApi] Error:', {
      url,
      errorName: error.name,
      errorMessage: error.message,
    });

    const errorMessage = error.name === 'AbortError'
      ? `Request timed out after ${Math.round(clampedTimeout / 1000)}s`
      : error.message || 'Failed to fetch API';

    return {
      toolCallId: '',
      success: false,
      error: `fetch_api failed: ${errorMessage}`,
      metadata: { executionTime: Date.now() - startTime },
    };
  }
}

// ============================================================================
// Execute Tool Function
// ============================================================================

interface ExecuteToolRequest {
  toolName: string;
  toolCallId: string;
  arguments: Record<string, unknown>;
  /** Analyze: save the fetch_api response into this session's sandbox instead of returning it. */
  sandbox?: unknown;
}

/**
 * fetch_api into the sandbox: the body is written to /data in the caller's own
 * sandbox (uid-bound) and only a summary goes back. Errors pass through.
 */
async function runSandboxFetch(
  uid: string,
  target: SandboxFetchTarget,
  fetch: (maxBytes: number) => Promise<ToolResult>,
): Promise<ToolResult> {
  const result = await fetch(MAX_SANDBOX_FETCH_BYTES);
  if (!result.success || typeof result.content !== 'string') return result;
  try {
    const summary = await saveFetchToSandbox(target, result.content, result.metadata?.contentType, async (sessionKey, path, base64) => {
      await getSandboxService().writeFile(uid, sessionKey, { path, base64 });
    });
    return {
      ...result,
      content: summary.preview,
      metadata: {
        ...result.metadata,
        sandboxPath: summary.path,
        bytes: summary.bytes,
        responseHash: summary.responseHash,
        previewTruncated: summary.previewTruncated,
      },
    };
  } catch (error) {
    console.error('[executeTool] Failed to save fetch_api response to the sandbox', { uid, sessionKey: target.sessionKey, error });
    return {
      toolCallId: result.toolCallId,
      success: false,
      error: `Fetched ${Buffer.byteLength(result.content, 'utf8')} bytes but could not save them to the sandbox: ${error instanceof Error ? error.message : String(error)}`,
      metadata: result.metadata,
    };
  }
}

/**
 * Firebase callable function to execute tools
 * Tools are executed server-side for security (API keys, network access)
 */
export const executeTool = onCall(
  {
    timeoutSeconds: 120,
    memory: '2GiB',
    concurrency: 40,
    secrets: [
      encryptionKey,
      e2bApiKey,
      fredApiKey,
      socrataAppToken,
      nasaApiKey,
      usCensusApiKey,
      blsRegistrationKey,
      fbiCrimeApiKey,
      stackExchangeApiKey,
      librariesIoApiKey,
    ],
  },
  async (request): Promise<ToolResult> => {
    // Verify authentication
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be authenticated to execute tools');
    }

    const { toolName, toolCallId, arguments: args, sandbox } = request.data as ExecuteToolRequest;
    const sandboxTarget = parseSandboxFetchTarget(sandbox);

    if (!toolName) {
      throw new HttpsError('invalid-argument', 'Tool name is required');
    }

    try {
      let result: ToolResult;

      switch (toolName) {
        case 'fetch_url': {
          const fetchUrlArgs = args as unknown as FetchUrlArgs;
          const rerouteToApi = typeof fetchUrlArgs.url === 'string' && shouldRouteFetchUrlToApi(fetchUrlArgs.url);

          if (rerouteToApi) {
            const keyValue = encryptionKey.value();
            if (!keyValue) {
              throw new Error('Encryption not configured');
            }

            const convertedArgs = convertFetchUrlArgsToFetchApiArgs(fetchUrlArgs);
            console.log('[executeTool] Routing fetch_url call to fetch_api for API endpoint', {
              originalUrl: fetchUrlArgs.url,
              responseFormat: convertedArgs.response_format,
            });
            result = sandboxTarget
              ? await runSandboxFetch(request.auth!.uid, sandboxTarget, (maxBytes) => handleFetchApi(convertedArgs, request.auth!.uid, keyValue, maxBytes))
              : await handleFetchApi(convertedArgs, request.auth!.uid, keyValue);
          } else {
            result = await handleFetchUrl(fetchUrlArgs);
          }

          break;
        }

        case 'fetch_api': {
          const keyValue = encryptionKey.value();
          if (!keyValue) {
            throw new Error('Encryption not configured');
          }
          const fetchArgs = args as unknown as FetchApiArgs;
          result = sandboxTarget
            ? await runSandboxFetch(request.auth!.uid, sandboxTarget, (maxBytes) => handleFetchApi(fetchArgs, request.auth!.uid, keyValue, maxBytes))
            : await handleFetchApi(fetchArgs, request.auth!.uid, keyValue);
          break;
        }

        case 'web_search': {
          const keyValue = encryptionKey.value();
          if (!keyValue) {
            throw new Error('Encryption not configured');
          }
          const searchResponse = await executeWebSearch(
            request.auth!.uid,
            args as { query: string; num_results?: number },
            keyValue
          );
          result = {
            toolCallId,
            success: true,
            content: JSON.stringify(searchResponse),
          };
          break;
        }

        case 'salesforce_docs_lookup': {
          const keyValue = encryptionKey.value();
          if (!keyValue) {
            throw new Error('Encryption not configured');
          }
          result = await handleSalesforceDocsLookup(
            args as unknown as SalesforceDocsLookupArgs,
            request.auth!.uid,
            keyValue
          );
          break;
        }

        default:
          result = {
            toolCallId,
            success: false,
            error: `Unknown tool: ${toolName}`,
          };
      }

      // Set the tool call ID
      result.toolCallId = toolCallId;
      return result;

    } catch (error: any) {
      console.error(`Error executing tool ${toolName}:`, error);
      return {
        toolCallId,
        success: false,
        error: error.message || 'Tool execution failed',
      };
    }
  }
);
