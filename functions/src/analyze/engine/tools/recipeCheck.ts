/**
 * A Model the app can't read must not pass silently (the same rule as
 * reportSpecCheck). After execute_python / write_output_file:
 *  - each saved `<name>.recipe.py` gets a note: its parameters as the Model
 *    view will show them, or why PARAMS / PARAM_SPECS couldn't be read;
 *  - each saved `<folder>/model.json` that doesn't match the results format
 *    gets a "results NOT readable" note with the reason.
 */
import type { ToolResult } from '../../contract/lib/ai/tools/types';
import { isModelResultsFilename, modelResultsProblem } from '../../contract/services/analyze/models/modelResults';
import { isRecipeFilename, parseRecipeParams } from '../../recipes/recipeParams';
import { outputPath, withNotes } from './toolResultNotes';

export function checkRecipes(result: ToolResult): ToolResult {
  const notes: string[] = [];
  for (const output of result.dataOutputs ?? []) {
    if (isModelResultsFilename(output.filename)) {
      const problem = modelResultsProblem(Buffer.from(output.base64, 'base64').toString('utf8'));
      if (problem) {
        notes.push(`Model results NOT readable: ${outputPath(output.filename)}: ${problem}. Don't write model.json by hand: call show_metric / show_chart / show_table / show_note in the recipe and run it with run_recipe, which writes the file.`);
      }
      continue;
    }
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
