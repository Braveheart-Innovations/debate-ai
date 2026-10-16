import type { AnalysisArtifactSpecV1 } from '../../contract/types/analysis-artifact-spec';
import { injectDocsRead } from '../docsReadInjection';

const READ_URL = 'https://help.salesforce.com/s/articleView?id=xcloud.overview_storage.htm&language=en_US&type=5';

function spec(sources: AnalysisArtifactSpecV1['sources']): AnalysisArtifactSpecV1 {
  return { version: 1, kind: 'analysis_artifact_spec', title: 'T', summary: 'S', pages: [{ slug: 'p', title: 'P', blocks: [] }], sources };
}

const pagesRead = new Map([
  ['help:overview_storage.htm', { citationId: 'SF-DABCDE', title: 'Data and File Storage Allocations', url: READ_URL, releaseLabel: "Winter '27", passages: ['Storage is divided into two categories.'] }],
]);

describe('injectDocsRead', () => {
  it('bakes the passages read onto the source for that page, across Help namespaces', () => {
    const result = injectDocsRead(spec([{ id: 'S1', label: 'Storage', url: 'https://help.salesforce.com/s/articleView?id=sf.overview_storage.htm' }]), pagesRead);
    expect(result.sources?.[0].docsRead).toEqual({
      citationId: 'SF-DABCDE',
      title: 'Data and File Storage Allocations',
      releaseLabel: "Winter '27",
      passages: ['Storage is divided into two categories.'],
    });
  });

  it('drops a docsRead the model wrote for a page no lookup read, and leaves other sources alone', () => {
    const input = spec([
      { id: 'S1', label: 'Made up', url: 'https://help.salesforce.com/s/articleView?id=platform.unread.htm', docsRead: { citationId: 'SF-DZZZZZ', title: 'x', passages: ['invented'] } },
      { id: 'S2', label: 'World Bank', url: 'https://data.worldbank.org' },
    ]);
    const result = injectDocsRead(input, pagesRead);
    expect(result.sources?.[0].docsRead).toBeUndefined();
    expect(result.sources?.[1]).toBe(input.sources?.[1]);
    const untouched = spec([{ id: 'S1', label: 'World Bank', url: 'https://data.worldbank.org' }]);
    expect(injectDocsRead(untouched, pagesRead)).toBe(untouched);
  });
});
