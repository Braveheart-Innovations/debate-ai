import type { ToolResult } from '../../../contract/lib/ai/tools/types';
import {
  attributesToSalesforce,
  checkSalesforceGrounding,
  salesforcePageKey,
  splitSentences,
} from '../salesforceGroundingCheck';

const READ_HELP_URL = 'https://help.salesforce.com/s/articleView?id=xcloud.overview_storage.htm&language=en_US&type=5';
const DEV_URL = 'https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/resources_limits.htm';

function fakeFiles(fileMap: Record<string, unknown>) {
  const listFiles = jest.fn(async (dir?: string) => Object.keys(fileMap)
    .filter((path) => path.slice(0, path.lastIndexOf('/')) === dir)
    .map((path) => ({ name: path.slice(path.lastIndexOf('/') + 1), path })));
  const readFile = jest.fn(async (path: string) => {
    const bytes = new TextEncoder().encode(JSON.stringify(fileMap[path]));
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  });
  return { listFiles, readFile };
}

const sessionFiles = {
  '/data/salesforce/docs/lookup_call_1.provenance.json': {
    version: 1,
    tool: 'salesforce_docs_lookup',
    lookup: 'lookup_call_1',
    lookedUpAt: '2026-10-17T10:00:00.000Z',
    releaseContext: { url: 'https://www.salesforce.com/releases', detected: "Winter '27" },
    pages: [
      { citationId: 'SF-DABCDE', title: 'Data and File Storage Allocations', url: READ_HELP_URL, passages: ['Storage is divided into two categories.'] },
    ],
    notRead: [],
  },
  '/data/fetch_call_2.provenance.json': { tool: 'fetch_url', endpoint: DEV_URL },
  '/data/fetch_call_3.json': { not: 'provenance' },
};

function specResult(spec: Record<string, unknown>): ToolResult {
  return {
    toolCallId: 'call-report',
    success: true,
    content: 'Saved report.',
    dataOutputs: [
      { filename: 'report.json', base64: Buffer.from(JSON.stringify(spec)).toString('base64'), size: 1 },
      { filename: 'chart.png', base64: '', size: 0 },
    ],
  };
}

function spec(markdown: string, sources: Array<Record<string, unknown>>) {
  return {
    version: 1,
    kind: 'analysis_artifact_spec',
    title: 'Org storage review',
    summary: 'Storage review for the QA sandbox.',
    pages: [{ slug: 'findings', title: 'Findings', blocks: [{ kind: 'markdown', markdown }] }],
    sources,
  };
}

describe('salesforcePageKey', () => {
  it('matches Help articles across namespaces and ignores query noise elsewhere', () => {
    expect(salesforcePageKey('https://help.salesforce.com/s/articleView?id=sf.overview_storage.htm')).toBe(salesforcePageKey(READ_HELP_URL));
    expect(salesforcePageKey(`${DEV_URL}#anchor`)).toBe(salesforcePageKey(DEV_URL));
    expect(salesforcePageKey('https://example.com/salesforce.com')).toBeNull();
  });
});

describe('attributesToSalesforce', () => {
  it('finds sentences that put words in Salesforce\'s mouth', () => {
    expect(attributesToSalesforce('Per Salesforce Help, file storage includes attachments.')).toBe(true);
    expect(attributesToSalesforce('Salesforce recommends one record-triggered flow per object.')).toBe(true);
    expect(attributesToSalesforce('According to the official Salesforce documentation, X.')).toBe(true);
    expect(attributesToSalesforce('The org has 14 record-triggered flows on Account.')).toBe(false);
  });

  it('finds speech verbs with modifiers, and "According to Salesforce,"', () => {
    expect(attributesToSalesforce('Salesforce commonly cites about 2 KB per record.')).toBe(true);
    expect(attributesToSalesforce('Salesforce says each record uses 2 KB.')).toBe(true);
    expect(attributesToSalesforce('Salesforce advises archiving old cases.')).toBe(true);
    expect(attributesToSalesforce('Salesforce no longer recommends workflow rules.')).toBe(true);
    expect(attributesToSalesforce('Salesforce notes that big objects are not counted.')).toBe(true);
    expect(attributesToSalesforce('As Salesforce notes, file storage is separate.')).toBe(true);
    expect(attributesToSalesforce('According to Salesforce, file storage is separate.')).toBe(true);
    expect(attributesToSalesforce('Per Salesforce, file storage is separate.')).toBe(true);
  });

  it('leaves the same words alone where they are nouns or a rate', () => {
    expect(attributesToSalesforce('Salesforce documents stored in Files count toward file storage.')).toBe(false);
    expect(attributesToSalesforce('Salesforce Notes attach to records.')).toBe(false);
    expect(attributesToSalesforce('Salesforce states and countries picklists are enabled.')).toBe(false);
    expect(attributesToSalesforce('The org gets 10 GB per Salesforce org plus 20 MB per license.')).toBe(false);
    expect(attributesToSalesforce('According to Salesforce Optimizer, the org has 40 unused fields.')).toBe(false);
  });

  it('lets a sentence that says it is unverified stand', () => {
    expect(attributesToSalesforce('Not verified against Salesforce documentation: Salesforce recommends one flow per object.')).toBe(false);
    expect(attributesToSalesforce('Salesforce commonly cites about 2 KB per record, but that figure is not in the pages read.')).toBe(false);
  });

  it('keeps citation markers with the sentence they follow', () => {
    expect(splitSentences('Per Salesforce Help, storage has two kinds. [S1] The org uses 80%.')).toEqual([
      'Per Salesforce Help, storage has two kinds. [S1]',
      'The org uses 80%.',
    ]);
  });
});

describe('checkSalesforceGrounding', () => {
  it('saves a report whose Salesforce claims cite pages the session read', async () => {
    const files = fakeFiles(sessionFiles);
    const result = specResult(spec(
      'Per Salesforce Help, storage is divided into two categories [S1]. Salesforce documents the limits resource [S2].',
      [
        { id: 'S1', label: 'Storage allocations', url: 'https://help.salesforce.com/s/articleView?id=sf.overview_storage.htm&type=5' },
        { id: 'S2', label: 'Limits', url: DEV_URL },
      ],
    ));
    expect(await checkSalesforceGrounding(result, files)).toBe(result);
  });

  it('does not save a report citing a Salesforce page no lookup read', async () => {
    const files = fakeFiles(sessionFiles);
    const unreadUrl = 'https://help.salesforce.com/s/articleView?id=platform.flow_task_trigger_run_order.htm&type=5';
    const checked = await checkSalesforceGrounding(specResult(spec(
      'Per Salesforce Help, trigger order values run lowest first [S1].',
      [{ id: 'S1', label: 'Run order', url: unreadUrl }],
    )), files);

    expect(checked.dataOutputs?.map((output) => output.filename)).toEqual(['chart.png']);
    expect(checked.content).toContain('Report NOT saved: /output/report.json presents Salesforce documentation that was not read');
    expect(checked.content).toContain(`Source S1 (${unreadUrl}) is a Salesforce page this session never read`);
    expect(checked.content).toContain('"Per Salesforce Help, trigger order values run lowest first [S1]." attributes this to Salesforce');
  });

  it('does not save an uncited attribution, and accepts it reworded as unverified', async () => {
    const files = fakeFiles(sessionFiles);
    const blocked = await checkSalesforceGrounding(specResult(spec(
      'Salesforce recommends one record-triggered flow per object.',
      [],
    )), files);
    expect(blocked.content).toContain('Page "Findings": "Salesforce recommends one record-triggered flow per object." attributes this to Salesforce but cites no Salesforce documentation that was read');

    const reworded = specResult(spec('Not verified against Salesforce documentation: Salesforce recommends one record-triggered flow per object.', []));
    expect(await checkSalesforceGrounding(reworded, files)).toBe(reworded);
  });

  it('does not accept a non-Salesforce source for a Salesforce attribution', async () => {
    const checked = await checkSalesforceGrounding(specResult(spec(
      'According to Salesforce documentation, muting sets apply only inside the group [S1].',
      [{ id: 'S1', label: 'A blog', url: 'https://example.com/muting' }],
    )), fakeFiles(sessionFiles));
    expect(checked.content).toContain('cites no Salesforce documentation that was read');
  });

  it('accepts the release page the lookup read, and leaves org links alone', async () => {
    const result = specResult(spec(
      'The current release is Winter \'27 [S1]. See the org setup page [S2].',
      [
        { id: 'S1', label: 'Salesforce releases', url: 'https://www.salesforce.com/releases' },
        { id: 'S2', label: 'QA org', url: 'https://kindercare--qa.sandbox.my.salesforce.com/lightning/setup' },
      ],
    ));
    expect(await checkSalesforceGrounding(result, fakeFiles(sessionFiles))).toBe(result);
  });

  it('skips reports that say nothing about Salesforce, without touching the sandbox', async () => {
    const files = fakeFiles(sessionFiles);
    const result = specResult(spec('GDP grew 2% [S1].', [{ id: 'S1', label: 'World Bank', url: 'https://data.worldbank.org' }]));
    expect(await checkSalesforceGrounding(result, files)).toBe(result);
    expect(files.listFiles).not.toHaveBeenCalled();
  });
});
