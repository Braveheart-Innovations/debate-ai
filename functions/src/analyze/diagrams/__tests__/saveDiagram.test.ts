import type { Artifact } from '../../contract/types/notebook';
import { buildDiagramSave, DiagramNotFoundError, DiagramReviewError, DiagramStaleError } from '../saveDiagram';

const model = {
  version: 1, kind: 'data_model', platform: 'generic', title: 'Families', summary: 'Families and children.',
  entities: [{ id: 'family', name: 'Family', fields: [] }, { id: 'child', name: 'Child', fields: [] }],
  relationships: [],
};

function version(id: string, versionNumber: number, extra: Partial<Artifact> = {}): Artifact {
  return {
    id,
    cellId: 'c',
    sessionId: 's',
    name: 'families.diagram.json',
    type: 'diagram',
    mimeType: 'application/json',
    data: JSON.stringify(model),
    createdAt: versionNumber,
    metadata: { versionNumber, lineageRootId: 'v1', artifactDisposition: 'output' },
    provenance: { sources: [] } as unknown as Artifact['provenance'],
    ...extra,
  };
}

const v1 = version('v1', 1, { metadata: { artifactDisposition: 'output' } });
const v2 = version('v2', 2, { metadata: { versionNumber: 2, lineageRootId: 'v1', previousArtifactId: 'v1', artifactDisposition: 'output' } });

function save(base: Artifact, text: string, overwrite = false) {
  return buildDiagramSave({ sessionId: 's', base, versions: [v1, v2], text, overwrite, savedAt: 100, newId: 'saved-1' });
}

describe('buildDiagramSave', () => {
  it('saves the edit as the next version, marked as the user\'s, as an indented file', () => {
    const edited = { ...model, entities: [...model.entities, { id: 'center', name: 'Center', source: 'user', fields: [] }], layout: { positions: { family: { x: 10, y: 20 } } } };
    const { artifact, warnings } = save(v2, JSON.stringify(edited));
    expect(warnings).toEqual([]);
    expect(artifact).toMatchObject({
      id: 'saved-1',
      name: 'families.diagram.json',
      type: 'diagram',
      mimeType: 'application/json',
      createdAt: 100,
      provenance: v2.provenance,
    });
    expect(artifact.data).toBe(`${JSON.stringify(edited, null, 2)}\n`);
    expect(artifact.metadata).toMatchObject({
      lineageRootId: 'v1',
      versionNumber: 3,
      previousArtifactId: 'v2',
      artifactDisposition: 'output',
      diagram: { kind: 'data_model', title: 'Families', entityCount: 3, relationshipCount: 0, savedByUser: true },
    });
    expect(artifact.metadata?.preview).toBeDefined();
  });

  it('refuses a file the review refuses', () => {
    expect(() => save(v2, JSON.stringify({ ...model, kind: 'process_flow' }))).toThrow(DiagramReviewError);
    try {
      save(v2, 'not json');
    } catch (error) {
      expect((error as DiagramReviewError).problems[0]).toMatch(/^it isn't valid JSON/);
    }
  });

  it('refuses to save over a newer version unless asked to', () => {
    expect(() => save(v1, JSON.stringify(model))).toThrow(DiagramStaleError);
    try {
      save(v1, JSON.stringify(model));
    } catch (error) {
      expect(error).toMatchObject({ latestArtifactId: 'v2', latestVersion: 2 });
    }
    expect(save(v1, JSON.stringify(model), true).artifact.metadata).toMatchObject({ versionNumber: 3, previousArtifactId: 'v2' });
  });

  it('saves only over a diagram', () => {
    expect(() => save({ ...v2, type: 'data' }, JSON.stringify(model))).toThrow(DiagramNotFoundError);
  });
});
