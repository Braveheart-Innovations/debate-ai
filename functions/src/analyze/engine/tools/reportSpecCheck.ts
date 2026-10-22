/**
 * A report the model saved that the app can't read must not pass as saved
 * (Step 8 re-run R1). Capture keeps such a file as plain data, out of Reports,
 * and the model was never told, so it went on to say the report was ready.
 *
 * After execute_python / write_output_file, each JSON output that declares
 * itself an `analysis_artifact_spec` is read exactly as capture reads it; one
 * that doesn't read gets a "Report NOT saved" note with the reason.
 */
import type { ToolResult } from '../../contract/lib/ai/tools/types';
import { parseJsonLenient } from '../../contract/lib/encoding/utf8Base64';
import {
  normalizeAnalysisArtifactSpecCandidate,
  tryParseAnalysisArtifactSpecText,
  validateAnalysisArtifactSpec,
} from '../../contract/services/analyze/artifacts/AnalysisArtifactSpecService';
import { withNotes } from './toolResultNotes';
import { guideHint } from '../guides';

const DECLARES_SPEC = /"kind"\s*:\s*"analysis_artifact_spec"/;

function outputRelativePath(path: string): string {
  return path.trim().replace(/^\/?output\//, '').replace(/^\/+/, '');
}

/** Why a declared report spec can't be read, or null when it reads (or isn't one). */
export function reportSpecProblem(text: string): string | null {
  if (!DECLARES_SPEC.test(text)) return null;
  if (tryParseAnalysisArtifactSpecText(text)) return null;
  let candidate: unknown;
  try {
    candidate = parseJsonLenient(text);
  } catch (error) {
    return `it isn't valid JSON (${error instanceof Error ? error.message : String(error)})`;
  }
  const validation = validateAnalysisArtifactSpec(normalizeAnalysisArtifactSpecCandidate(candidate));
  if (validation.success) {
    return 'it must have "version": 1 and "kind": "analysis_artifact_spec" at the top level';
  }
  return `it doesn't match the report format:\n- ${validation.errors.join('\n- ')}`;
}

export function checkReportSpecs(result: ToolResult, guides?: Record<string, string>): ToolResult {
  const notes: string[] = [];
  for (const output of result.dataOutputs ?? []) {
    if (!output.filename.toLowerCase().endsWith('.json')) continue;
    const problem = reportSpecProblem(Buffer.from(output.base64, 'base64').toString('utf8'));
    if (!problem) continue;
    notes.push(`Report NOT saved: /output/${outputRelativePath(output.filename)} declares itself a report (analysis_artifact_spec), but ${problem}\nIt is kept only as a data file and will not appear in Reports. Fix it and save the report again before saying it is ready.${guideHint(guides, 'report')}`);
  }
  return notes.length > 0 ? withNotes(result, notes) : result;
}
