/**
 * What a report version was written from (metadata.writtenFrom): the models
 * its turn used, with when their data was fetched. The app compares it with a
 * model's newer-data scenarios (Refresh data, a watch) to say a report is
 * behind, with Update report (web docs/analyze-beyond-reports-plan.md,
 * "Reports: the notice and Update report").
 *
 * A turn used a model when its code named the recipe or a file in the model's
 * folder (run_recipe, reading model.json, writing the model), or it saved a
 * version of the model's results. The code is what counts: a run with the
 * same results saves no new version. A report version from a turn that used
 * no model keeps its previous version's list, so a wording fix doesn't make a
 * report's numbers newer.
 */
import type { ToolCall, ToolResult } from '../contract/lib/ai/tools/types';
import type { Artifact } from '../contract/types/notebook';
import { MODEL_RESULTS_FILENAME } from '../contract/services/analyze/models/modelResults';
import { modelOutputDir } from './recipeParams';

export type WrittenFrom = NonNullable<NonNullable<Artifact['metadata']>['writtenFrom']>;

function versionOf(artifact: Artifact): number {
  return artifact.metadata?.versionNumber ?? 1;
}

/** The latest version of each artifact the filter keeps, by name. */
function latestByName(artifacts: Artifact[], keep: (artifact: Artifact) => boolean): Artifact[] {
  const latest = new Map<string, Artifact>();
  for (const artifact of artifacts) {
    if (!keep(artifact)) continue;
    const current = latest.get(artifact.name);
    if (!current || versionOf(artifact) > versionOf(current)
      || (versionOf(artifact) === versionOf(current) && artifact.createdAt > current.createdAt)) {
      latest.set(artifact.name, artifact);
    }
  }
  return [...latest.values()];
}

function isReport(artifact: Artifact): boolean {
  return artifact.type === 'analysis_artifact_spec';
}

/** The session's models (their recipes' latest versions). */
function sessionRecipes(artifacts: Artifact[]): Artifact[] {
  return latestByName(artifacts, (artifact) => artifact.type === 'recipe');
}

/** The code of a round's calls that ran. */
function roundCode(toolCalls: ToolCall[], results: ToolResult[]): string[] {
  return toolCalls.flatMap((call, index) => {
    if (call.function.name !== 'execute_python' || !results[index]?.success) return [];
    try {
      const code = (JSON.parse(call.function.arguments || '{}') as { code?: unknown }).code;
      return typeof code === 'string' ? [code] : [];
    } catch {
      return [];
    }
  });
}

/** The models (recipe names) whose recipe or folder a round's code names. */
export function modelsNamedInRound(toolCalls: ToolCall[], results: ToolResult[], artifacts: Artifact[]): string[] {
  const code = roundCode(toolCalls, results);
  if (code.length === 0) return [];
  return sessionRecipes(artifacts)
    .filter((recipe) => {
      // The folder with its /output prefix: a bare "data/" would match the sandbox's /data.
      const folder = `/output/${modelOutputDir(recipe)}/`;
      const name = recipe.name.replace(/^\/?output\//, '');
      return code.some((text) => text.includes(name) || text.includes(folder));
    })
    .map((recipe) => recipe.name);
}

/** When the model's data was fetched: the newest mark on its folder's files; undefined when none is marked. */
export function modelDataFetchedAt(outputDir: string, artifacts: Artifact[]): number | undefined {
  const results = `${outputDir}/${MODEL_RESULTS_FILENAME}`;
  const times = latestByName(artifacts, (artifact) => artifact.name.startsWith(`${outputDir}/`) && artifact.name !== results)
    .flatMap((file) => (file.metadata?.fetchedFrom ? [file.metadata.fetchedFrom.fetchedAt] : []));
  return times.length > 0 ? Math.max(...times) : undefined;
}

/**
 * Mark the report versions a round saves with what they were written from.
 * `session`: the session after the round (marks included); `named`: the
 * models the turn's code named so far.
 */
export function stampWrittenFrom(saved: Artifact[], session: Artifact[], turnId: string, named: string[], now: number): Artifact[] {
  if (!saved.some(isReport)) return saved;
  const used = sessionRecipes(session).filter((recipe) => {
    const results = `${modelOutputDir(recipe)}/${MODEL_RESULTS_FILENAME}`;
    return named.includes(recipe.name)
      || session.some((artifact) => artifact.name === results && artifact.metadata?.turnId === turnId);
  });
  const entries: WrittenFrom = used.map((recipe) => {
    const fetchedAt = modelDataFetchedAt(modelOutputDir(recipe), session);
    return { recipeName: recipe.name, ...(fetchedAt !== undefined ? { fetchedAt } : {}), writtenAt: now };
  });
  const usedNames = new Set(entries.map((entry) => entry.recipeName));
  return saved.map((artifact) => {
    if (!isReport(artifact)) return artifact;
    const previousId = artifact.metadata?.previousArtifactId;
    const previous = previousId ? session.find((candidate) => candidate.id === previousId) : undefined;
    const inherited = previous?.metadata?.writtenFrom;
    const writtenFrom = entries.length > 0
      ? [...(inherited ?? []).filter((entry) => !usedNames.has(entry.recipeName)), ...entries]
      // A first version on no model rests on none; a later one keeps what it had (or, saved before the lists, stays unknown).
      : inherited ?? (previousId ? undefined : []);
    return writtenFrom ? { ...artifact, metadata: { ...artifact.metadata, writtenFrom } } : artifact;
  });
}
