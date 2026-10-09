/**
 * Server tools (fetch_api, fetch_url, web_search, salesforce_docs_lookup) for the loop.
 * Ported from symposium-ai-web src/services/analyze/orchestrator/tools/serverToolExecutor.ts
 * (Phase 3), logic unchanged, with one structural change: the Salesforce docs
 * evidence packager is injected (deps.packageSalesforceDocsLookupEvidence) instead of
 * imported, until the Salesforce services are ported (Step 5).
 */
import type { ToolResult } from '../../contract/lib/ai/tools/types';
import { DATA_CONNECTORS } from '../../contract/config/data-connectors';
import { buildFetchReuseFingerprint, type DatasetRegistry } from '../dataset/DatasetRegistry';
import type { buildFetchProvenance as buildFetchProvenanceFn } from './provenance';

interface SandboxFileBridge {
  mountFile: (filename: string, data: ArrayBuffer, path?: string) => Promise<string>;
  /** The Analyze session's sandbox key: fetch_api writes its response there server-side. */
  getSessionKey: () => string;
}

/** Where the server should save a fetch_api response (path without extension). */
export interface SandboxFetchTarget {
  sessionKey: string;
  pathBase: string;
}

interface ExecuteToolResponse {
  success: boolean;
  content?: string;
  error?: string;
  metadata?: {
    cached?: boolean;
    /** Set when the server saved the response into the sandbox; `content` is then a preview. */
    sandboxPath?: string;
    bytes?: number;
    responseHash?: string;
    previewTruncated?: boolean;
  };
}

/** Model-facing preview length for a fetched file. */
const FETCH_PREVIEW_CHARS = 500;

function formatBytes(bytes: number): string {
  return bytes < 1024
    ? `${bytes}B`
    : bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)}KB`
      : `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function readHint(path: string): string {
  if (path.endsWith('.json')) return `Use pd.read_json("${path}") or open("${path}") in Python to access the full data.`;
  if (path.endsWith('.csv')) return `Use pd.read_csv("${path}") in Python to access the full data.`;
  return `Use open("${path}") in Python to access the full data.`;
}

function provenancePathFor(path: string): string {
  return path.replace(/\.[a-z]+$/, '.provenance.json');
}

export interface ServerToolExecutorDeps {
  sandbox: SandboxFileBridge;
  datasetRegistry: DatasetRegistry;
  logger?: Pick<typeof console, 'warn' | 'error'>;
  buildFetchProvenance: typeof buildFetchProvenanceFn;
  packageSalesforceDocsLookupEvidence: (
    toolCallId: string,
    content: string,
    sandbox: SandboxFileBridge,
  ) => Promise<ToolResult>;
  /** Runs a server tool; on the server this wraps dispatchServerTool. */
  executeToolCallable: (
    toolName: string,
    toolCallId: string,
    args: Record<string, unknown>,
    sandbox?: SandboxFetchTarget,
  ) => Promise<ExecuteToolResponse>;
}

export class ServerToolExecutor {
  private readonly logger: Pick<typeof console, 'warn' | 'error'>;

  constructor(private readonly deps: ServerToolExecutorDeps) {
    this.logger = deps.logger || console;
  }

  async executeServerTool(
    toolCallId: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    const normalizedArgs = withInferredManagedApiKeyRef(toolName, args);
    if (normalizedArgs !== args && toolName === 'fetch_api') {
      this.logger.warn('[AnalyzeOrchestrator] Auto-inferred managed api_key_ref for fetch_api', {
        inferredApiKeyRef: normalizedArgs.api_key_ref,
        host: extractHostFromArgs(normalizedArgs),
      });
    }
    const isFetchTool = toolName === 'fetch_api' || toolName === 'fetch_url';
    const fetchFingerprint = isFetchTool
      ? buildFetchReuseFingerprint(toolName as 'fetch_api' | 'fetch_url', normalizedArgs)
      : null;

    if (toolName === 'salesforce_docs_lookup') {
      try {
        const backendResult = await this.deps.executeToolCallable(toolName, toolCallId, normalizedArgs);
        if (backendResult.success && backendResult.content) {
          return this.deps.packageSalesforceDocsLookupEvidence(toolCallId, backendResult.content, this.deps.sandbox);
        }
        return {
          toolCallId,
          success: false,
          error: backendResult.error || 'salesforce_docs_lookup returned no documentation evidence.',
        };
      } catch (error) {
        this.logger.error('[AnalyzeOrchestrator] Salesforce docs lookup failed:', error);
        return {
          toolCallId,
          success: false,
          error: error instanceof Error ? error.message : 'salesforce_docs_lookup execution failed',
        };
      }
    }

    if (isFetchTool && fetchFingerprint) {
      const cachedEntry = this.deps.datasetRegistry.getFetchCache(fetchFingerprint);
      if (cachedEntry) {
        const truncatedMarker = cachedEntry.previewTruncated ? '...  (truncated)' : '';
        return {
          toolCallId,
          success: true,
          content: `Reused session dataset ${formatBytes(cachedEntry.fetchedBytes)} from ${cachedEntry.path} (provenance: ${provenancePathFor(cachedEntry.path)})\n\nPreview:\n${cachedEntry.preview}${truncatedMarker}\n\n${readHint(cachedEntry.path)}`,
          provenance: cachedEntry.provenance,
          metadata: {
            cached: true,
            fetchedBytes: cachedEntry.fetchedBytes,
            fullStdout: cachedEntry.preview,
          },
        };
      }
    }

    try {
      const sanitizedId = toolCallId.replace(/[^a-zA-Z0-9]/g, '_');
      // fetch_api (and fetch_url routed to it) saves its response straight into
      // the sandbox server-side; only a preview comes back. Page-text fetch_url
      // responses still come back inline and are saved from here.
      const sandboxTarget: SandboxFetchTarget | undefined = isFetchTool
        ? { sessionKey: this.deps.sandbox.getSessionKey(), pathBase: `/data/fetch_${sanitizedId}` }
        : undefined;
      const data = await this.deps.executeToolCallable(toolName, toolCallId, normalizedArgs, sandboxTarget);

      const serverCached = typeof data.metadata?.cached === 'boolean' ? data.metadata.cached : undefined;
      const result: ToolResult = {
        toolCallId,
        success: data.success,
        content: data.content,
        error: data.error,
        metadata: serverCached === undefined ? undefined : { cached: serverCached },
      };

      if (isFetchTool && result.success && result.content !== undefined) {
        const serverSaved = data.metadata?.sandboxPath
          ? {
            path: data.metadata.sandboxPath,
            bytes: data.metadata.bytes ?? 0,
            responseHash: data.metadata.responseHash,
            previewTruncated: data.metadata.previewTruncated === true,
          }
          : null;
        const preview = result.content.slice(0, FETCH_PREVIEW_CHARS);
        const previewTruncated = serverSaved ? serverSaved.previewTruncated || result.content.length > FETCH_PREVIEW_CHARS : result.content.length > FETCH_PREVIEW_CHARS;
        const inlineIsJson = /^\s*[[{]/.test(result.content);
        const path = serverSaved?.path ?? `/data/fetch_${sanitizedId}${inlineIsJson ? '.json' : '.txt'}`;
        const bytes = serverSaved?.bytes ?? new TextEncoder().encode(result.content).length;
        let savedToFs = Boolean(serverSaved);

        if (!serverSaved) {
          try {
            const encoded = new TextEncoder().encode(result.content);
            await this.deps.sandbox.mountFile(path.slice('/data/'.length), encoded.buffer, path);
            savedToFs = true;
          } catch (error) {
            this.logger.warn('[AnalyzeOrchestrator] Failed to persist fetch result to the sandbox filesystem:', error);
          }
        }

        result.metadata = {
          ...result.metadata,
          fetchedBytes: bytes,
          fullStdout: preview,
        };

        try {
          result.provenance = await this.deps.buildFetchProvenance({
            toolName: toolName as 'fetch_api' | 'fetch_url',
            args: normalizedArgs,
            rawContent: result.content,
            responseHash: serverSaved?.responseHash,
            cacheStatus: result.metadata?.cached ? 'cached' : 'fresh',
          });
        } catch (provenanceError) {
          this.logger.warn('[AnalyzeOrchestrator] Failed to build fetch provenance:', provenanceError);
        }

        const provPath = provenancePathFor(path);
        if (result.provenance && savedToFs) {
          try {
            const provenanceJson = JSON.stringify(result.provenance, null, 2);
            const provenanceEncoded = new TextEncoder().encode(provenanceJson);
            await this.deps.sandbox.mountFile(provPath.slice('/data/'.length), provenanceEncoded.buffer, provPath);
          } catch (error) {
            this.logger.warn('[AnalyzeOrchestrator] Failed to save provenance to the sandbox filesystem:', error);
          }
        }

        const truncatedMarker = previewTruncated ? '...  (truncated)' : '';
        if (savedToFs) {
          result.content = `Fetched ${formatBytes(bytes)} → saved to ${path} (provenance: ${provPath})\n\nPreview:\n${preview}${truncatedMarker}\n\n${readHint(path)}`;
          if (fetchFingerprint) {
            this.deps.datasetRegistry.registerFetchCache({
              fingerprint: fetchFingerprint,
              tool: toolName as 'fetch_api' | 'fetch_url',
              endpoint: result.provenance?.endpoint || '',
              method: result.provenance?.method || (toolName === 'fetch_api' ? String(normalizedArgs.method || 'GET').toUpperCase() : 'GET'),
              path,
              preview,
              previewTruncated,
              fetchedBytes: bytes,
              provenance: result.provenance,
              createdAt: Date.now(),
            });
          }
        } else {
          const fallbackPreview = result.content.slice(0, 2000);
          const fallbackTruncated = result.content.length > 2000 ? '... (truncated — full data unavailable, fetch again if needed)' : '';
          result.content = `Fetched ${formatBytes(bytes)} (failed to save to filesystem)\n\nData:\n${fallbackPreview}${fallbackTruncated}`;
        }
      }

      return result;
    } catch (error) {
      this.logger.error(`[AnalyzeOrchestrator] Server tool ${toolName} failed:`, error);
      const errorMessage = error instanceof Error ? error.message : `${toolName} execution failed`;

      return {
        toolCallId,
        success: false,
        error: errorMessage,
      };
    }
  }
}

const CONNECTORS_WITH_MANAGED_AUTH = DATA_CONNECTORS.filter((connector) =>
  connector.managedBySymposium
  && !connector.requiresUserKey
  && connector.authType !== 'none'
);

function inferManagedApiKeyRefFromUrl(urlValue: string): string | undefined {
  const normalizedUrl = urlValue.toLowerCase();

  const matchingConnectors = CONNECTORS_WITH_MANAGED_AUTH
    .filter((connector) => normalizedUrl.startsWith(connector.baseUrl.toLowerCase()))
    .sort((a, b) => b.baseUrl.length - a.baseUrl.length);

  return matchingConnectors[0]?.id;
}

export function withInferredManagedApiKeyRef(
  toolName: string,
  args: Record<string, unknown>,
): Record<string, unknown> {
  if (toolName !== 'fetch_api') {
    return args;
  }

  if (typeof args.api_key_ref === 'string' && args.api_key_ref.trim().length > 0) {
    return args;
  }

  const url = typeof args.url === 'string' ? args.url : undefined;
  if (!url) {
    return args;
  }

  const inferredApiKeyRef = inferManagedApiKeyRefFromUrl(url);
  if (!inferredApiKeyRef) {
    return args;
  }

  return {
    ...args,
    api_key_ref: inferredApiKeyRef,
  };
}

export function extractHostFromArgs(args: Record<string, unknown>): string | undefined {
  const url = typeof args.url === 'string' ? args.url : undefined;
  if (!url) return undefined;

  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
}
