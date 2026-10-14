import type { ToolResult } from '../../contract/lib/ai/tools/types';

/** Appends notes for the model to a tool result (and to its error, when it failed). */
export function withNotes(result: ToolResult, notes: string[]): ToolResult {
  const text = notes.join('\n\n');
  return {
    ...result,
    content: result.content ? `${result.content}\n\n${text}` : text,
    ...(result.success ? {} : { error: result.error ? `${result.error}\n\n${text}` : text }),
  };
}

/** A sandbox output's path as the model wrote it: `/output/<name>`. */
export function outputPath(filename: string): string {
  return `/output/${filename.trim().replace(/^\/?output\//, '').replace(/^\/+/, '')}`;
}
