import type { Message } from '../../contract/types';
import type { Artifact } from '../../contract/types/notebook';
import { packageSalesforceDocsLookupEvidence } from '../../engine/tools/executeSalesforceDocsLookupTool';
import { buildAnalyzeReviewerPrompt, buildVerificationTask } from '../reviewService';
import { buildSalesforceReviewEvidence, docsPagesReadInTurn } from '../salesforceReviewEvidence';

const STORAGE_URL = 'https://help.salesforce.com/s/articleView?id=xcloud.overview_storage.htm&language=en_US&type=5';
const mountFile = jest.fn(async (_filename: string, _data: ArrayBuffer, path?: string) => path || _filename);

async function lookupResultContent(): Promise<string> {
  const result = await packageSalesforceDocsLookupEvidence('call-docs', JSON.stringify({
    version: 1,
    generatedAt: '2026-10-17T10:00:00.000Z',
    releaseContext: { warnings: [] },
    officialDomainPolicy: { allowedHostPattern: '*.salesforce.com', rejectedUrls: [] },
    topics: [{ id: 'storage', label: 'Org storage limits', query: 'org storage limits', category: 'general', reasons: [], componentTypes: [], apiVersions: [], riskSignalIds: [] }],
    sources: [{
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
      matchedChunks: [{ id: 'c1', ordinal: 1, text: 'Storage is divided into two categories: data storage and file storage.', score: 40, contentLength: 70 }],
      warnings: [],
      confidenceImpact: 'supports',
    }],
    warnings: [],
  }), { mountFile });
  return result.content!;
}

function message(overrides: Partial<Message>): Message {
  return { id: 'm', sender: 'x', senderType: 'ai', content: '', timestamp: 0, ...overrides } as Message;
}

function reportArtifact(spec: Record<string, unknown>, createdAt: number): Artifact {
  return { id: 'report-1', cellId: 'c', sessionId: 's', name: 'Report', type: 'analysis_artifact_spec', mimeType: 'application/json', data: JSON.stringify(spec), createdAt } as Artifact;
}

async function session(): Promise<Message[]> {
  return [
    message({ id: 'u1', senderType: 'user', content: 'Review storage', timestamp: 1000 }),
    message({ id: 'toolresult_call-docs', senderType: 'tool', content: await lookupResultContent(), timestamp: 1100, metadata: { toolName: 'salesforce_docs_lookup', success: true } as Message['metadata'] }),
    message({ id: 'a1', senderType: 'ai', content: 'The report is ready.', timestamp: 1200 }),
  ];
}

const reportSpec = {
  version: 1,
  kind: 'analysis_artifact_spec',
  title: 'Storage review',
  summary: 'Storage review.',
  pages: [{
    slug: 'findings',
    title: 'Findings',
    blocks: [{
      kind: 'markdown',
      markdown: 'Per Salesforce Help, storage has two categories [S1]. Salesforce recommends archiving old cases. Muting sets only apply inside the group [S2]. The org uses 80% of data storage.',
    }],
  }],
  sources: [
    { id: 'S1', label: 'Storage', url: STORAGE_URL },
    { id: 'S2', label: 'Muting', url: 'https://help.salesforce.com/s/articleView?id=platform.perm_set_groups_muting.htm&type=5' },
  ],
};

describe('buildSalesforceReviewEvidence', () => {
  it('puts each Salesforce claim beside the passage its citation points to', async () => {
    const messages = await session();
    const evidence = buildSalesforceReviewEvidence(messages, [reportArtifact(reportSpec, 1150)], 2);

    expect(evidence).toContain('Salesforce documentation claims in the report "Storage review"');
    expect(evidence).toContain('- Findings: "Per Salesforce Help, storage has two categories [S1]."');
    expect(evidence).toContain('Storage is divided into two categories: data storage and file storage.');
    expect(evidence).toContain('- Findings: "Salesforce recommends archiving old cases."\n  Cites no Salesforce documentation.');
    expect(evidence).toContain('S2 https://help.salesforce.com/s/articleView?id=platform.perm_set_groups_muting.htm&type=5: no docs lookup in this session read this page.');
    expect(evidence).not.toContain('The org uses 80%');
  });

  it('is empty for a report from an earlier turn, or one with no Salesforce claims', async () => {
    const messages = await session();
    expect(buildSalesforceReviewEvidence(messages, [reportArtifact(reportSpec, 500)], 2)).toBe('');
    const plain = { ...reportSpec, pages: [{ slug: 'p', title: 'P', blocks: [{ kind: 'markdown', markdown: 'The org uses 80% of data storage.' }] }], sources: [] };
    expect(buildSalesforceReviewEvidence(messages, [reportArtifact(plain, 1150)], 2)).toBe('');
  });

  it('reaches the Reviewer prompt and the verifier brief', async () => {
    const messages = await session();
    const salesforceEvidence = buildSalesforceReviewEvidence(messages, [reportArtifact(reportSpec, 1150)], 2);
    const prompt = buildAnalyzeReviewerPrompt({ reviewerName: 'R', userPrompt: 'Review storage', operatorName: 'Op', operatorResponse: 'Ready.', artifacts: [], salesforceEvidence });
    expect(prompt).toContain('check the passage says what the report says');

    const docsRead = docsPagesReadInTurn(messages, 2);
    expect(docsRead).toEqual([expect.stringMatching(/^\[SF-D[2-9A-HJKMNP-Z]{5}\] Data and File Storage Allocations - https:\/\/help\.salesforce\.com/)]);
    const { task } = buildVerificationTask({
      item: { reviewerName: 'R', title: 'Check storage', details: 'Check it.', expectedOutcome: '', artifactRefs: [] } as never,
      userPrompt: 'Review storage',
      operatorName: 'Op',
      operatorResponse: 'Ready.',
      evidence: { code: [], sources: [], docsRead },
    });
    expect(task).toContain('## Salesforce documentation Op read');
    expect(task).toContain('run salesforce_docs_lookup yourself');
  });
});
