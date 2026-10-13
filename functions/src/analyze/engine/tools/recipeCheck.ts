/**
 * A recipe the Model panel can't read must not pass silently (the same rule
 * as reportSpecCheck). After execute_python / write_output_file, each saved
 * `<name>.recipe.py` gets a note: its parameters as the app will show them,
 * or why PARAMS / PARAM_SPECS couldn't be read.
 */
import type { ToolResult } from '../../contract/lib/ai/tools/types';
import { isRecipeFilename, parseRecipeParams } from '../../recipes/recipeParams';
import { withNotes } from './toolResultNotes';

function outputPath(filename: string): string {
  return `/output/${filename.trim().replace(/^\/?output\//, '').replace(/^\/+/, '')}`;
}

export function checkRecipes(result: ToolResult): ToolResult {
  const notes: string[] = [];
  for (const output of result.dataOutputs ?? []) {
    if (!isRecipeFilename(output.filename)) continue;
    const path = outputPath(output.filename);
    try {
      const params = parseRecipeParams(Buffer.from(output.base64, 'base64').toString('utf8'));
      const names = params.map((param) => param.name).join(', ');
      notes.push(params.length > 0
        ? `Model saved: ${path} with parameters ${names}. The user can change them and run it again without you.`
        : `Model saved: ${path}, with no PARAMS, so the user can only run it again as it is.`);
    } catch (error) {
      notes.push(`Model saved WITHOUT controls: ${path}: ${error instanceof Error ? error.message : String(error)}. Fix PARAMS / PARAM_SPECS (plain literals only) and save it again.`);
    }
  }
  return notes.length > 0 ? withNotes(result, notes) : result;
}
