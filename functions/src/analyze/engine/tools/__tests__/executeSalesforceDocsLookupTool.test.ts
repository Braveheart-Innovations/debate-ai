import { packageSalesforceDocsLookupEvidence } from '../executeSalesforceDocsLookupTool';

const mountFile = jest.fn(async (_filename: string, _data: ArrayBuffer, path?: string) => path || _filename);

function decodeBuffer(data: ArrayBuffer): string {
  return new TextDecoder().decode(data);
}

describe('packageSalesforceDocsLookupEvidence', () => {
  beforeEach(() => {
    mountFile.mockClear();
  });

  it('persists matched source chunks into the Markdown evidence artifact', async () => {
    const rawJson = JSON.stringify({
      version: 1,
      generatedAt: '2026-05-13T12:00:00.000Z',
      releaseContext: {
        requested: "Summer '25",
        detected: "Summer '26",
        warnings: [],
      },
      officialDomainPolicy: {
        allowedHostPattern: '*.salesforce.com',
        rejectedUrls: [],
      },
      documentationIndex: {
        status: 'hit',
        generatedAt: '2026-05-13T11:00:00.000Z',
        storagePath: 'salesforce-docs/index-v1.json',
        recordCount: 1,
      },
      topics: [
        {
          id: 'emailmessage-reply-threading',
          label: 'EmailMessage reply threading',
          query: 'EmailMessage ReplyToEmailMessageId ThreadIdentifier Headers',
          category: 'object_reference',
          reasons: [],
          componentTypes: [],
          apiVersions: [],
          riskSignalIds: [],
        },
      ],
      sources: [
        {
          id: 'sf-doc-cache-1',
          topicId: 'emailmessage-reply-threading',
          title: 'EmailMessage Object Reference',
          url: 'https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_emailmessage.htm',
          domain: 'developer.salesforce.com',
          sourceType: 'developer_doc',
          status: 'unknown',
          retrievedAt: '2026-05-13T11:00:00.000Z',
          responseHash: 'hash',
          contentQuality: 'full_text',
          contentLength: 24350,
          excerpt: 'EmailMessage object overview preamble.',
          matchedChunks: [
            {
              id: 'sf-doc-index-1-chunk-7',
              ordinal: 7,
              text: 'ReplyToEmailMessageId, ThreadIdentifier, RelatedToId, Headers, Incoming, and MessageIdentifier field definitions from the EmailMessage object reference.',
              score: 18,
              contentLength: 141,
            },
          ],
          warnings: [],
          confidenceImpact: 'unclear',
        },
      ],
      warnings: [],
    });

    const result = await packageSalesforceDocsLookupEvidence('call-docs-package', rawJson, { mountFile });

    expect(result.success).toBe(true);
    expect(result.content).toContain('Matched source chunks: 1');
    expect(result.content).toContain('chunks=1');
    expect(result.content).toContain('availability=official');
    expect(result.content).not.toContain('status=unknown');
    expect(result.content).toContain('confidence=supports');
    expect(result.content).not.toContain('confidence=unclear');
    expect(result.content).toContain('ReplyToEmailMessageId');

    const jsonWrite = mountFile.mock.calls.find((call) =>
      call[2] === '/data/salesforce/salesforce-doc-evidence.json'
    );
    expect(jsonWrite).toBeDefined();
    const normalizedEvidence = JSON.parse(decodeBuffer(jsonWrite![1]));
    expect(normalizedEvidence.sources[0].availability).toBe('official');
    expect(normalizedEvidence.sources[0].confidenceImpact).toBe('supports');

    const markdownWrite = mountFile.mock.calls.find((call) =>
      call[2] === '/data/salesforce/salesforce-doc-evidence.md'
    );
    expect(markdownWrite).toBeDefined();
    const markdown = decodeBuffer(markdownWrite![1]);
    expect(markdown).toContain('Matched chunks: 1 chunk(s)');
    expect(markdown).toContain('availability: official');
    expect(markdown).not.toContain('status: unknown');
    expect(markdown).toContain('ReplyToEmailMessageId, ThreadIdentifier, RelatedToId');
    expect(markdown).not.toContain('Limitation: this source was identified as full-text');
  });

  it('reports preview availability and missed topics from server evidence', async () => {
    const rawJson = JSON.stringify({
      version: 1,
      generatedAt: '2026-08-14T12:00:00.000Z',
      releaseContext: { detected: "Summer '26", warnings: [] },
      officialDomainPolicy: { allowedHostPattern: '*.salesforce.com', rejectedUrls: ['https://example.com/blog'] },
      documentationIndex: {
        status: 'hit',
        recordCount: 156,
        missedTopics: [
          { topicId: 'omnistudio-dataraptor-limits', label: 'OmniStudio DataRaptor bulk limits', reason: 'no_official_source' },
        ],
      },
      topics: [
        {
          id: 'flow-fault-paths',
          label: 'Flow fault paths',
          query: 'Salesforce Flow fault paths',
          category: 'flow',
          reasons: [],
          componentTypes: [],
          apiVersions: [],
          riskSignalIds: [],
        },
      ],
      sources: [
        {
          id: 'sf-doc-1',
          topicId: 'flow-fault-paths',
          title: 'Flow Release Notes',
          url: 'https://help.salesforce.com/s/articleView?id=release-notes.rn_automate.htm',
          domain: 'help.salesforce.com',
          sourceType: 'release_notes',
          status: 'preview',
          retrievedAt: '2026-08-14T11:00:00.000Z',
          responseHash: 'hash',
          contentQuality: 'full_text',
          contentLength: 5000,
          excerpt: 'This release is in preview.',
          warnings: ['Source contains preview, beta, pilot, or not-yet-GA language; recommendations must be confidence-downgraded.'],
          confidenceImpact: 'preview-risk',
        },
      ],
      warnings: [],
    });

    const result = await packageSalesforceDocsLookupEvidence('call-docs-preview', rawJson, { mountFile });

    expect(result.success).toBe(true);
    expect(result.content).toContain('Preview/beta/pilot documentation was found');
    expect(result.content).toContain('availability=preview/beta/pilot');
    expect(result.content).not.toContain('status=preview');
    expect(result.content).toContain('Missed documentation topics: omnistudio-dataraptor-limits:no_official_source');
    expect(result.content).toContain('Citation map for final synthesis:');
    expect(result.content).toContain('[SF-D');
    expect(result.dataOutputs?.map((output) => output.filename)).toEqual([
      'salesforce-doc-evidence.json',
      'salesforce-doc-evidence.md',
    ]);
  });
});
