/**
 * A diagram the app can't open must not pass silently (the same rule as
 * reportSpecCheck and recipeCheck). After execute_python / write_output_file,
 * each saved `<name>.diagram.json` gets a note from the shared review: saved
 * (with any warnings the user will see), or NOT readable and why.
 */
import type { ToolResult } from '../../contract/lib/ai/tools/types';
import { isDiagramFilename, reviewDiagramText } from '../../contract/services/analyze/diagrams/diagramFile';
import { outputPath, withNotes } from './toolResultNotes';

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function checkDiagrams(result: ToolResult): ToolResult {
  const notes: string[] = [];
  for (const output of result.dataOutputs ?? []) {
    if (!isDiagramFilename(output.filename)) continue;
    const path = outputPath(output.filename);
    const review = reviewDiagramText(Buffer.from(output.base64, 'base64').toString('utf8'));
    if (!review.diagram) {
      notes.push(`Diagram NOT readable: ${path}: ${review.problems.join('; ')}. The user can't open it in Outputs; fix these and save it again.`);
      continue;
    }
    const diagram = review.diagram;
    const size = diagram.kind === 'data_model'
      ? `${plural(diagram.entities.length, 'entity', 'entities')}, ${plural(diagram.relationships.length, 'relationship', 'relationships')}`
      : `${plural(diagram.nodes.length, 'node', 'nodes')}, ${plural(diagram.flows.length, 'flow', 'flows')}`;
    notes.push(review.warnings.length > 0
      ? `Diagram saved: ${path} (${size}), with warnings the user sees in the editor: ${review.warnings.join('; ')}. Fix them unless they're intended, and save it again.`
      : `Diagram saved: ${path} (${size}). The user can open it in Outputs and edit it.`);
  }
  return notes.length > 0 ? withNotes(result, notes) : result;
}
