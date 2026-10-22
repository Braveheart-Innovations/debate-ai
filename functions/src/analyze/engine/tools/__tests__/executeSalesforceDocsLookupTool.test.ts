import { SandboxLimitError } from '../../../../sandbox/service';
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
    expect(result.content).toContain(`Provenance for those sources: /data/salesforce/docs/${base}.provenance.json.`);
    expect(result.content).toContain('Passages read, each page under its id:');

    expect(result.provenance).toMatchObject({
      tool: 'salesforce_docs_lookup',
      fetchedAt: '2026-10-17T10:00:00.000Z',
      cacheStatus: 'cached',
      parameters: { pagesRead: '2', provenanceFile: `/data/salesforce/docs/${base}.provenance.json` },
    });
    expect(result.dataOutputs?.map((output) => output.filename)).toEqual([
      expect.stringMatching(/^salesforce-doc-evidence-[0-9a-f]{8}\.json$/),
      expect.stringMatching(/^salesforce-doc-evidence-[0-9a-f]{8}\.md$/),
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
    expect(result.content).toContain('Found but not read (not evidence):');
    expect(result.content).toContain(`- Data and File Storage Allocations - ${STORAGE_URL} (Org storage limits: a Help article not in the docs index yet`);
    expect(result.content).toContain('No documentation read for: Org storage limits (not read).');
    expect(result.content).not.toContain('mark any claim');
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

  it('quotes the most relevant passages first, whatever topic id or title they sort under', async () => {
    // The Flow redesign live test: sources come sorted by topic id, and a loosely
    // matching release-notes page under an early topic took the budget from the
    // decision guide a later topic asked for.
    // 9,000 characters each: three fit the 28,000-character inline budget.
    const passage = (word: string) => `${word} `.repeat(2000).slice(0, 9000);
    const page = (key: string, topicId: string, chunk: Record<string, unknown>) => source({
      id: `sf-doc-${key}`,
      topicId,
      url: `https://help.salesforce.com/s/articleView?id=xcloud.${key}.htm&language=en_US&type=5`,
      title: `Page ${key}`,
      matchedChunks: [{ id: key, ordinal: 1, contentLength: 9000, ...chunk }],
    });
    const sources = [
      page('overview', 'a-automation', { text: passage('overview'), score: 80, relevance: 2 }),
      page('guide', 'z-decision-guide', { text: passage('guide'), score: 80, relevance: 30 }),
      page('considerations', 'm-considerations', { text: passage('considerations'), score: 80, relevance: 10 }),
      // Read live: no index relevance, its keyword score on the index's scale (÷8).
      page('live', 'm-live', { text: passage('live'), score: 120 }),
    ];
    const topics = ['a-automation', 'z-decision-guide', 'm-considerations', 'm-live'].map((id) => topic(id, id));

    const result = await packageSalesforceDocsLookupEvidence('call-rank', JSON.stringify(bundle({ topics, sources })), { mountFile });
    const quoted = parseDocsLookupResult(result.content!).filter((entry) => entry.passages.length > 0).map((entry) => entry.title);

    expect(quoted).toEqual(['Page guide', 'Page live', 'Page considerations']);
    expect(result.content!.slice(result.content!.indexOf('Also read;'))).toContain('Page overview');
  });

  it('ranks a passage that answers several topics by the topic it answers best, two at most from a page', async () => {
    const text = (word: string) => `${word} `.repeat(1000);
    const shared = text('density');
    const guideUrl = 'https://architect.salesforce.com/docs/architect/decision-guides/guide/record-triggered.html';
    const sources = [
      source({ topicId: 'a-lock-contention', url: guideUrl, title: 'Decision guide', matchedChunks: [{ id: 'g1', ordinal: 1, text: shared, score: 67, relevance: 3, contentLength: 5000 }] }),
      source({ topicId: 'b-other', title: 'Other page', matchedChunks: [{ id: 'o1', ordinal: 1, text: text('other'), score: 80, relevance: 20, contentLength: 5000 }] }),
      source({
        topicId: 'r-density',
        url: guideUrl,
        title: 'Decision guide',
        matchedChunks: [
          { id: 'g1', ordinal: 1, text: shared, score: 80, relevance: 60, contentLength: 5000 },
          { id: 'g2', ordinal: 2, text: text('second'), score: 80, relevance: 50, contentLength: 5000 },
          { id: 'g3', ordinal: 3, text: text('third'), score: 80, relevance: 40, contentLength: 5000 },
        ],
      }),
    ];
    const topics = ['a-lock-contention', 'b-other', 'r-density'].map((id) => topic(id, id));

    const result = await packageSalesforceDocsLookupEvidence('call-shared', JSON.stringify(bundle({ topics, sources })), { mountFile });
    const pages = parseDocsLookupResult(result.content!);

    expect(pages[0]).toMatchObject({ title: 'Decision guide', passages: [shared.trim(), text('second').trim()] });
    expect(pages[1]).toMatchObject({ title: 'Other page' });
    expect(result.content).toContain('(1 more passage(s) from this page in /data/salesforce/docs/lookup_call_shared.md)');
  });

  it('reads its own result back: each quoted page with its passages, overflow pages without', async () => {
    const longText = 'Storage allocations per edition. '.repeat(400);
    const sources = [
      source({ releaseLabel: "Winter '27", matchedChunks: [{ id: 'a', ordinal: 1, text: 'Line one.\nLine two.', score: 9, contentLength: 19 }] }),
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
      description: "Salesforce Help · release Winter '27 · topics: Org storage limits",
      releaseLabel: "Winter '27",
      passages: ['Line one.\nLine two.'],
    });
    expect(pages[pages.length - 1]).toMatchObject({ passages: [], description: 'Salesforce Help · topics: Org storage limits' });
  });

  it('at the sandbox limit, still quotes what it read, and says nothing was saved for a report', async () => {
    const atLimit = jest.fn(async (): Promise<string> => {
      throw new SandboxLimitError(3, 5 * 60_000, 15 * 60_000);
    });
    const longText = 'Storage allocations per edition. '.repeat(400);
    const sources = [
      source({}),
      ...Array.from({ length: 4 }, (_, index) => source({
        id: `sf-doc-${index}`,
        url: `https://help.salesforce.com/s/articleView?id=xcloud.page_${index}.htm&language=en_US&type=5`,
        title: `Page ${index}`,
        matchedChunks: [{ id: `c${index}`, ordinal: 1, text: longText, score: 1, contentLength: longText.length }],
      })),
    ];
    const result = await packageSalesforceDocsLookupEvidence('call-limit', JSON.stringify(bundle({ sources })), { mountFile: atLimit });

    expect(result.success).toBe(true);
    expect(result.content).toContain('Storage is divided into two categories.');
    expect(result.content).toContain('Files: none saved.');
    expect(result.content).not.toContain('/data/salesforce/docs/lookup_call_limit');
    expect(result.content).not.toContain('sourceArtifactId');
    expect(result.provenance?.parameters).not.toHaveProperty('provenanceFile');
    expect(result.dataOutputs).toHaveLength(2);
    // Pages past the inline budget had only the file to be read from: listed, but not as evidence.
    expect(result.content).toContain('- Page 3 - https://help.salesforce.com/s/articleView?id=xcloud.page_3.htm');
    expect(parseDocsLookupResult(result.content!).map((page) => page.title)).toEqual(['Data and File Storage Allocations', 'Page 0', 'Page 1']);
  });

  it('fails on any other sandbox error', async () => {
    const broken = jest.fn(async (): Promise<string> => {
      throw new Error('disk full');
    });
    await expect(packageSalesforceDocsLookupEvidence('call-broken', JSON.stringify(bundle({ sources: [source({})] })), { mountFile: broken }))
      .rejects.toThrow('disk full');
  });

  it('leaves confidence as the server judged it', async () => {
    const raw = JSON.stringify(bundle({ sources: [source({ confidenceImpact: 'unclear' })] }));
    await packageSalesforceDocsLookupEvidence('call-unclear', raw, { mountFile });
    expect(JSON.parse(written('/data/salesforce/docs/lookup_call_unclear.json')).sources[0].confidenceImpact).toBe('unclear');
  });

  it('notes preview pages', async () => {
    const raw = JSON.stringify(bundle({ sources: [source({ status: 'preview', confidenceImpact: 'preview-risk' })] }));
    const result = await packageSalesforceDocsLookupEvidence('call-preview', raw, { mountFile });
    expect(result.content).toContain('preview/beta/pilot');
    expect(result.content).not.toContain('downgrade confidence');
    expect(result.content).toContain('Some pages describe preview, beta or pilot features');
  });
});
