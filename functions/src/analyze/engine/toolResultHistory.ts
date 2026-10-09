/**
 * Tool result content shown to the model on its next turn.
 * Ported from symposium-ai-web src/services/analyze/orchestrator/toolResultHistory.ts
 * (Phase 3), logic unchanged.
 */
import type { ToolResult } from '../contract/lib/ai/tools/types';

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 10 || unitIndex === 0 ? Math.round(value) : value.toFixed(1)} ${units[unitIndex]}`;
}

function buildDataOutputSummary(result: ToolResult): string[] {
  const summaries: string[] = [];

  if (result.dataOutputs && result.dataOutputs.length > 0) {
    summaries.push(
      'Durable generated files retained for this run:',
      ...result.dataOutputs.slice(0, 12).map((output) => `- /output/${output.filename} (${formatBytes(output.size)})`),
      result.dataOutputs.length > 12 ? `- ${result.dataOutputs.length - 12} more artifact(s) omitted from this summary` : '',
    );
  }

  if (result.bundleOutputs && result.bundleOutputs.length > 0) {
    if (summaries.length === 0) summaries.push('Durable generated files retained for this run:');
    summaries.push(
      ...result.bundleOutputs.slice(0, 12).map((output) => {
        const fileCount = Object.keys(output.manifest.files).length;
        return `- bundle: ${output.name || output.manifest.entryPoint} (${fileCount} bundled file${fileCount === 1 ? '' : 's'}; entry /output/${output.manifest.entryPoint})`;
      }),
      result.bundleOutputs.length > 12 ? `- ${result.bundleOutputs.length - 12} more bundle(s) omitted from this summary` : '',
    );
  }

  return summaries.filter(Boolean);
}

/**
 * Content shown to the model for a completed tool result on its next turn.
 *
 * We deliberately preserve the FULL output and do NOT truncate it to an arbitrary
 * character budget. Aggressive per-result truncation (and code omission on the
 * paired tool call) made the model believe its dataframes/charts were gone, so it
 * rebuilt them — slightly differently each time — in an endless loop. Total
 * context pressure is governed instead by `pruneHistoryIfNeeded`, which knows the
 * model's real context window and drops whole oldest tool exchanges only when
 * genuinely needed. The retained /output + bundle files are always summarised so
 * the model knows the durable artifacts exist and can reuse them.
 */
export function buildToolResultContentForFollowUp(result: ToolResult): string {
  if (result.success) {
    const rawContent = result.content || 'Executed successfully';
    const summary = buildDataOutputSummary(result);
    return summary.length > 0 ? [rawContent, '', ...summary].join('\n') : rawContent;
  }

  const rawFailure = (result.error || result.content || 'Tool execution failed').trim();
  return `Tool execution failed: ${rawFailure}\nContinue with remaining successful tool outputs and explain the limitation from this failure.`;
}
