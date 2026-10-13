import type { Artifact } from '../../contract/types/notebook';
import { buildRecipeRunArtifacts } from '../runRecipe';

const b64 = (text: string) => Buffer.from(text).toString('base64');

const recipe = {
  id: 'artifact-data-msg1-0-0',
  cellId: 'msg1',
  sessionId: 's1',
  name: 'staffing.recipe.py',
  type: 'recipe',
  mimeType: 'text/x-python',
  data: 'PARAMS = {"staff": 3}',
  createdAt: 1,
  provenance: { generator: 'python' },
} as unknown as Artifact;

const chartV1 = {
  id: 'artifact-data-msg1-0-1',
  cellId: 'msg1',
  sessionId: 's1',
  name: 'staffing/wait.png',
  type: 'image',
  mimeType: 'image/png',
  data: b64('png-v1'),
  createdAt: 1,
  metadata: { artifactDisposition: 'report_material', reportMaterialRole: 'visual', artifactGroupId: 'rich-report-msg1' },
  provenance: { generator: 'python', sources: [] },
} as unknown as Artifact;

function build(outputs: Parameters<typeof buildRecipeRunArtifacts>[0]['outputs'], existing: Artifact[] = [chartV1]) {
  return buildRecipeRunArtifacts({ sessionId: 's1', recipe, runId: 'recipe_9', values: { staff: 4 }, ranAt: 50, existing, outputs });
}

describe('buildRecipeRunArtifacts', () => {
  it('saves a changed file as the next version of the same-name artifact, where the prior sat', () => {
    const [chart] = build([{ filename: 'staffing/wait.png', data: b64('png-v2'), kind: 'data' }]);
    expect(chart).toMatchObject({
      id: 'artifact-recipe-recipe_9-0',
      cellId: 'recipe-recipe_9',
      name: 'staffing/wait.png',
      type: 'image',
      mimeType: 'image/png',
      data: b64('png-v2'),
      createdAt: 50,
      provenance: chartV1.provenance,
      metadata: {
        artifactDisposition: 'report_material',
        reportMaterialRole: 'visual',
        artifactGroupId: 'rich-report-msg1',
        lineageRootId: chartV1.id,
        versionNumber: 2,
        previousArtifactId: chartV1.id,
        recipeRun: { recipeName: 'staffing.recipe.py', runId: 'recipe_9', values: { staff: 4 }, ranAt: 50 },
      },
    });
  });

  it('makes no version for an unchanged file or for the recipe itself', () => {
    expect(build([
      { filename: 'staffing/wait.png', data: b64('png-v1'), kind: 'data' },
      { filename: 'staffing.recipe.py', data: b64('PARAMS = {}'), kind: 'data' },
    ])).toEqual([]);
  });

  it('types a new file by its extension, reading a CSV as a dataset', () => {
    const [table] = build([{ filename: 'staffing/summary.csv', data: b64('hour,wait\n9,4.5\n10,6.1\n'), kind: 'data' }], []);
    expect(table).toMatchObject({
      name: 'staffing/summary.csv',
      type: 'dataset',
      mimeType: 'text/csv',
      provenance: recipe.provenance,
      metadata: { rowCount: 2, columnCount: 2, recipeRun: { runId: 'recipe_9' } },
    });
    expect(table.metadata?.versionNumber).toBeUndefined();
  });
});
