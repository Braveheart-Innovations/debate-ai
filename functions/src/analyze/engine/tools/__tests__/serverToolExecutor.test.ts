// Ported from symposium-ai-web src/services/analyze/orchestrator/tools/__tests__/serverToolExecutor.test.ts (imports + injected packager only).
import { ServerToolExecutor, withInferredManagedApiKeyRef } from '../serverToolExecutor';
import { buildFetchProvenance } from '../provenance';
import { DatasetRegistry, type SessionFetchCacheEntry } from '../../dataset/DatasetRegistry';

describe('withInferredManagedApiKeyRef', () => {
  it('does not infer api_key_ref for public Semantic Scholar fetch_api calls', () => {
    const inputArgs = {
      url: 'https://api.semanticscholar.org/graph/v1/paper/search',
      query_params: { query: 'transformers', limit: '10' },
    };

    const result = withInferredManagedApiKeyRef('fetch_api', inputArgs);

    expect(result).toEqual(inputArgs);
    expect((result as { api_key_ref?: string }).api_key_ref).toBeUndefined();
  });

  it('does not override an explicit api_key_ref', () => {
    const inputArgs = {
      url: 'https://api.semanticscholar.org/graph/v1/paper/search',
      api_key_ref: 'custom_key',
    };

    const result = withInferredManagedApiKeyRef('fetch_api', inputArgs);

    expect(result).toEqual(inputArgs);
  });

  it('does not inject api_key_ref for connectors without auth requirements', () => {
    const inputArgs = {
      url: 'https://api.openalex.org/works',
      query_params: { search: 'transformer architecture' },
    };

    const result = withInferredManagedApiKeyRef('fetch_api', inputArgs);

    expect(result).toEqual(inputArgs);
    expect((result as { api_key_ref?: string }).api_key_ref).toBeUndefined();
  });

  it('does not inject api_key_ref for non-fetch_api tools', () => {
    const inputArgs = {
      url: 'https://api.semanticscholar.org/graph/v1/paper/search',
    };

    const result = withInferredManagedApiKeyRef('fetch_url', inputArgs);

    expect(result).toEqual(inputArgs);
  });
});

describe('repeated fetch failures', () => {
  // 2026-10-04: a "[CIRCUIT BREAKER: … Stop retrying this endpoint and inform
  // the user.]" suffix after three failures (oversized responses included) made
  // the operator give up instead of requesting smaller pages. The model sees
  // each real error and decides; the app adds nothing.
  it('passes every error through unchanged, however often a host fails', async () => {
    const error = 'Response exceeded 750000 bytes (753411 bytes read). Narrow the query and paginate to keep each response small.';
    const executor = new ServerToolExecutor({
      sandbox: { mountFile: jest.fn(async () => '/data/x.json'), getSessionKey: () => 'session_1' },
      datasetRegistry: new DatasetRegistry(),
      buildFetchProvenance,
      packageSalesforceDocsLookupEvidence: jest.fn(),
      executeToolCallable: jest.fn(async () => ({ success: false, error })),
      logger: { warn: jest.fn(), error: jest.fn() },
    });

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const result = await executor.executeServerTool(`call_${attempt}`, 'fetch_api', {
        url: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi',
        query_params: { db: 'pubmed', retmax: '893' },
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe(error);
    }
  });
});

describe('fetches saved into the sandbox server-side', () => {
  function setup(response: Record<string, unknown>) {
    const mountFile = jest.fn(async (_filename: string, _data: ArrayBuffer, path?: string) => path ?? '');
    const executeToolCallable = jest.fn(async () => response as { success: boolean });
    const registry = new DatasetRegistry();
    const executor = new ServerToolExecutor({
      sandbox: { mountFile, getSessionKey: () => 'session_1791174072325' },
      datasetRegistry: registry,
      buildFetchProvenance,
      packageSalesforceDocsLookupEvidence: jest.fn(),
      executeToolCallable,
      logger: { warn: jest.fn(), error: jest.fn() },
    });
    return { executor, mountFile, executeToolCallable, registry };
  }
  const args = { url: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi', query_params: { db: 'pubmed' } };

  it('asks the server to save into this session\'s sandbox and keeps only a preview', async () => {
    const preview = `<?xml version="1.0"?>${'p'.repeat(1990)}`;
    const { executor, mountFile, executeToolCallable, registry } = setup({
      success: true,
      content: preview,
      metadata: { sandboxPath: '/data/fetch_call_1.xml', bytes: 4_200_000, responseHash: 'abc123', previewTruncated: true },
    });

    const result = await executor.executeServerTool('call-1', 'fetch_api', args);

    expect(executeToolCallable).toHaveBeenCalledWith('fetch_api', 'call-1', expect.anything(), {
      sessionKey: 'session_1791174072325',
      pathBase: '/data/fetch_call_1',
    });
    // The server wrote the data file; the browser writes only the provenance sidecar.
    expect(mountFile.mock.calls.map((call) => call[2])).toEqual(['/data/fetch_call_1.provenance.json']);
    expect(result.provenance?.responseHash).toBe('abc123');
    expect(result.content).toMatch(/^Fetched 4\.0MB → saved to \/data\/fetch_call_1\.xml \(provenance: \/data\/fetch_call_1\.provenance\.json\)/);
    expect(result.content).toContain('open("/data/fetch_call_1.xml")');
    expect(result.metadata?.fetchedBytes).toBe(4_200_000);
    expect(result.metadata?.fullStdout).toBe(preview.slice(0, 500));
    const entries = Array.from((registry as unknown as { fetchCache: Map<string, SessionFetchCacheEntry> }).fetchCache.values());
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ path: '/data/fetch_call_1.xml', fetchedBytes: 4_200_000, previewTruncated: true });
    expect(entries[0].preview).toHaveLength(500);
    expect(entries[0]).not.toHaveProperty('content');
  });

  it('still saves an inline response (fetch_url page text) from the browser', async () => {
    const { executor, mountFile } = setup({ success: true, content: 'Title: Example\n\nSome page text' });

    const result = await executor.executeServerTool('call-2', 'fetch_url', { url: 'https://example.com/about' });

    expect(mountFile.mock.calls.map((call) => call[2])).toEqual(['/data/fetch_call_2.txt', '/data/fetch_call_2.provenance.json']);
    expect(result.content).toMatch(/saved to \/data\/fetch_call_2\.txt/);
  });
});
