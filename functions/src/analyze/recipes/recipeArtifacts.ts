/**
 * What capture needs to know about recipes: the recipe artifact's metadata,
 * and which output files belong to a recipe (they version on every run,
 * including a report round that would otherwise replace them).
 */
import type { Artifact } from '../contract/types/notebook';
import { isRecipeFilename, parseRecipeDocstring, parseRecipeParams, recipeOutputDir } from './recipeParams';

export const RECIPE_MIME_TYPE = 'text/x-python';

/** metadata.recipe for a recipe's source: its parameters (or why they couldn't be read), name and description. */
export function recipeMetadata(name: string, source: string): NonNullable<NonNullable<Artifact['metadata']>['recipe']> {
  const outputDir = recipeOutputDir(name);
  const docstring = parseRecipeDocstring(source);
  try {
    return { params: parseRecipeParams(source), outputDir, ...docstring };
  } catch (error) {
    return { params: [], outputDir, paramsError: error instanceof Error ? error.message : String(error), ...docstring };
  }
}

/** The output folders (relative to /output) of the session's recipes and this round's. */
export function recipeOutputDirs(existing: Artifact[], roundFilenames: string[]): string[] {
  const names = [
    ...existing.filter((artifact) => artifact.type === 'recipe').map((artifact) => artifact.name),
    ...roundFilenames.filter(isRecipeFilename),
  ];
  return [...new Set(names.map(recipeOutputDir))];
}

/** A file a recipe writes: inside its output folder. */
export function isRecipeOutputFilename(filename: string, outputDirs: string[]): boolean {
  const normalized = filename.replace(/^\/?output\//, '');
  return outputDirs.some((dir) => normalized.startsWith(`${dir}/`));
}
