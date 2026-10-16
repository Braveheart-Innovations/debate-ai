import {
  lookupFileBase,
  packageSalesforceDocsLookupEvidence,
  parseDocsLookupResult,
  salesforceDocCitationId,
} from '../executeSalesforceDocsLookupTool';

const mountFile = jest.fn(async (_filename: string, _data: ArrayBuffer, path?: string) => path || _filename);

function decodeBuffer(data: ArrayBuffer): string {
  return new TextDecoder().decode(data);
}

function written(path: string): string {
  const call = mountFile.mock.calls.find((candidate) => candidate[2] === path);
  expect(call).toBeDefined();
  return decodeBuffer(call![1]);
}

const STORAGE_URL = 'https://help.salesforce.com/s/articleView?id=xcloud.overview_storage.htm&language=en_US&type=5';
const LIMITS_URL = 'https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/resources_limits.htm';

function topic(id: string, label: string) {
  return { id, label, query: label, category: 'general', reasons: [], componentTypes: [], apiVersions: [], riskSignalIds: [] };
}

function source(overrides: Record<string, unknown>) {
  return {
    id: 'sf-doc-1',
    topicId: 'storage',
    title: 'Data and File Storage Allocations',
    url: STORAGE_URL,
    domain: 'help.salesforce.com',
    sourceType: 'help_doc',
    status: 'unknown',
    retrievedAt: '2026-10-16T19:32:28.783Z',
    responseHash: 'hash',
    contentQuality: 'full_text',
    contentLength: 4119,
    excerpt: 'Storage is divided into two categories.',
    matchedChunks: [{ id: 'c1', ordinal: 1, text: 'Storage is divided into two categories. File storage includes files in attachments.', score: 40, contentLength: 84 }],
    warnings: [],
    confidenceImpact: 'supports',
    ...overrides,
  };
}

function bundle(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    generatedAt: '2026-10-17T10:00:00.000Z',
    releaseContext: { detected: "Winter '27", warnings: [] },
    officialDomainPolicy: { allowedHostPattern: '*.salesforce.com', rejectedUrls: [] },
    documentationIndex: { status: 'hit', generatedAt: '2026-10-16T19:32:28.783Z', missedTopics: [] },
    topics: [topic('storage', 'Org storage limits'), topic('limits', 'Org limits')],
    sources: [],
    unreadSources: [],
    warnings: [],
    ...overrides,
  };
}

describe('salesforceDocCitationId', () => {
  it('derives one stable id per page', () => {
    expect(salesforceDocCitationId(STORAGE_URL)).toBe(salesforceDocCitationId(STORAGE_URL));
    expect(salesforceDocCitationId(STORAGE_URL)).not.toBe(salesforceDocCitationId(LIMITS_URL));
    expect(salesforceDocCitationId(STORAGE_URL)).toMatch(/^SF-D[2-9A-HJKMNP-Z]{5}$/);
  });
});

describe('packageSalesforceDocsLookupEvidence', () => {
  beforeEach(() => {
    mountFile.mockClear();
  });

  it('quotes the passages read, once per page, under the page id', async () => {
    const raw = JSON.stringify(bundle({
      sources: [
        source({ topicId: 'storage' }),
        source({ id: 'sf-doc-2', topicId: 'limits' }),
        source({
          id: 'sf-doc-3',
          topicId: 'limits',
          title: 'Limits',
          url: LIMITS_URL,
          domain: 'developer.salesforce.com',
          sourceType: 'developer_doc',
          releaseLabel: "Winter '27 (API version 68.0)",
          matchedChunks: [{ id: 'c9', ordinal: 9, text: 'Lists information about limits in your org. DataStorageMB and FileStorageMB report allocations.', score: 30, contentLength: 96 }],
        }),
        source({ id: 'sf-doc-4', topicId: 'salesforce-release-context', title: 'Salesforce Releases', url: 'https://www.salesforce.com/releases' }),
      ],
    }));

    const result = await packageSalesforceDocsLookupEvidence('call:docs/1', raw, { mountFile });
    const storageId = salesforceDocCitationId(STORAGE_URL);

    expect(result.success).toBe(true);
    expect(result.content).toContain('read 2 official page(s) for 2 topic(s)');
    expect(result.content).toContain(`[${storageId}] Data and File Storage Allocations - ${STORAGE_URL}`);
    expect(result.content!.split(`[${storageId}]`)).toHaveLength(2);
    expect(result.content).toContain('topics: Org storage limits, Org limits');
    expect(result.content).toContain('    Storage is divided into two categories.');
    expect(result.content).toContain('DataStorageMB and FileStorageMB');
    expect(result.content).toContain("Current Salesforce release (from salesforce.com/releases): Winter '27.");
    expect(result.content).not.toContain('Salesforce Releases - https://www.salesforce.com/releases');

    const base = lookupFileBase('call:docs/1');
    expect(base).toBe('lookup_call_docs_1');
    const provenance = JSON.parse(written(`/data/salesforce/docs/${base}.provenance.json`));
    expect(provenance.pages.map((page: { citationId: string }) => page.citationId)).toEqual([storageId, salesforceDocCitationId(LIMITS_URL)]);
    expect(provenance.pages[0].passages).toEqual(['Storage is divided into two categories. File storage includes files in attachments.']);
    expect(provenance.pages[0].topicIds).toEqual(['storage', 'limits']);
    expect(written(`/data/salesforce/docs/${base}.md`)).toContain('Passages read: 1');
    expect(JSON.parse(written(`/data/salesforce/docs/${base}.json`)).sources[0].id).toBe(storageId);
    expect(result.content).toContain(`set its sourceArtifactId to "/data/salesforce/docs/${base}.provenance.json"`);

    expect(result.provenance).toMatchObject({
      tool: 'salesforce_docs_lookup',
      fetchedAt: '2026-10-17T10:00:00.000Z',
      cacheStatus: 'cached',
      parameters: { pagesRead: '2', provenanceFile: `/data/salesforce/docs/${base}.provenance.json` },
    });
    expect(result.dataOutputs?.map((output) => output.filename)).toEqual([
      'salesforce-doc-evidence-call_docs_1.json',
      'salesforce-doc-evidence-call_docs_1.md',
    ]);
    expect(mountFile.mock.calls.map((call) => call[2])).not.toContain('/data/salesforce/salesforce-doc-evidence.json');
  });

  it('lists pages it did not read apart, and says which topics have no documentation', async () => {
    const raw = JSON.stringify(bundle({
      documentationIndex: {
        status: 'miss',
        missedTopics: [{ topicId: 'storage', label: 'Org storage limits', reason: 'not_read' }],
      },
      unreadSources: [
        { topicId: 'storage', title: 'Data and File Storage Allocations', url: STORAGE_URL, reason: 'not_rendered' },
      ],
    }));

    const result = await packageSalesforceDocsLookupEvidence('call-unread', raw, { mountFile });

    expect(result.content).toContain('read 0 official page(s) for 2 topic(s); 1 more found but not read');
    expect(result.content).toContain('No official Salesforce documentation was read for these topics');
    expect(result.content).toContain('Found but not read. These are not evidence');
    expect(result.content).toContain(`- Data and File Storage Allocations - ${STORAGE_URL} (Org storage limits: a Help article not in the docs index yet`);
    expect(result.content).toContain('No documentation read for: Org storage limits (not read).');
    expect(result.content).toContain('mark any claim about them unverified');
    expect(result.content).not.toContain(`[${salesforceDocCitationId(STORAGE_URL)}]`);
    expect(result.provenance?.cacheStatus).toBe('fresh');
    const provenance = JSON.parse(written('/data/salesforce/docs/lookup_call_unread.provenance.json'));
    expect(provenance.pages).toEqual([]);
    expect(provenance.notRead).toHaveLength(1);
    expect(written('/data/salesforce/docs/lookup_call_unread.md')).toContain('## Found but not read');
  });

  it('keeps the inline quote within budget and points to the file for the rest', async () => {
    const longText = 'Storage allocations per edition. '.repeat(400);
    const sources = Array.from({ length: 4 }, (_, index) => source({
      id: `sf-doc-${index}`,
      url: `https://help.salesforce.com/s/articleView?id=xcloud.page_${index}.htm&language=en_US&type=5`,
      title: `Page ${index}`,
      matchedChunks: [{ id: `c${index}`, ordinal: 1, text: longText, score: 10, contentLength: longText.length }],
    }));

    const result = await packageSalesforceDocsLookupEvidence('call-budget', JSON.stringify(bundle({ sources })), { mountFile });

    expect(result.content).toContain('read 4 official page(s)');
    expect(result.content).toContain('Also read; their passages are in /data/salesforce/docs/lookup_call_budget.md');
    expect(result.content).toContain('Page 3 - https://help.salesforce.com/s/articleView?id=xcloud.page_3.htm');
  });

  it('reads its own result back: each quoted page with its passages, overflow pages without', async () => {
    const longText = 'Storage allocations per edition. '.repeat(400);
    const sources = [
      source({ matchedChunks: [{ id: 'a', ordinal: 1, text: 'Line one.\nLine two.', score: 9, contentLength: 19 }] }),
      ...Array.from({ length: 4 }, (_, index) => source({
        id: `sf-doc-${index}`,
        url: `https://help.salesforce.com/s/articleView?id=xcloud.page_${index}.htm&language=en_US&type=5`,
        title: `Page ${index}`,
        matchedChunks: [{ id: `c${index}`, ordinal: 1, text: longText, score: 1, contentLength: longText.length }],
      })),
    ];
    const result = await packageSalesforceDocsLookupEvidence('call-parse', JSON.stringify(bundle({ sources })), { mountFile });
    const pages = parseDocsLookupResult(result.content!);

    expect(pages).toHaveLength(5);
    expect(pages[0]).toEqual({
      citationId: salesforceDocCitationId(STORAGE_URL),
      title: 'Data and File Storage Allocations',
      url: STORAGE_URL,
      passages: ['Line one.\nLine two.'],
    });
    expect(pages[pages.length - 1].passages).toEqual([]);
  });

  it('leaves confidence as the server judged it', async () => {
    const raw = JSON.stringify(bundle({ sources: [source({ confidenceImpact: 'unclear' })] }));
    await packageSalesforceDocsLookupEvidence('call-unclear', raw, { mountFile });
    expect(JSON.parse(written('/data/salesforce/docs/lookup_call_unclear.json')).sources[0].confidenceImpact).toBe('unclear');
  });

  it('notes preview pages', async () => {
    const raw = JSON.stringify(bundle({ sources: [source({ status: 'preview', confidenceImpact: 'preview-risk' })] }));
    const result = await packageSalesforceDocsLookupEvidence('call-preview', raw, { mountFile });
    expect(result.content).toContain('preview/beta/pilot: downgrade confidence');
    expect(result.content).toContain('Some pages describe preview, beta or pilot features');
  });
});
