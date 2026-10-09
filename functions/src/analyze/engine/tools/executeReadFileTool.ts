/** Moved from symposium-ai-web src/services/analyze/orchestrator/tools/executeReadFileTool.ts (Phase 3 Step 5), logic unchanged; the sandbox filesystem is injected. */
import type { ToolResult } from '../../contract/lib/ai/tools/types';
import type { SandboxFiles } from './sandboxFiles';

const ALLOWED_FILE_PREFIXES = ['/uploads/', '/output/', '/data/'];

function isAllowedSessionPath(path: string): boolean {
  return ALLOWED_FILE_PREFIXES.some((prefix) => path.startsWith(prefix))
    && !path.split('/').some((segment) => segment === '..');
}

function toOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export async function executeReadFileTool(
  files: SandboxFiles,
  toolCallId: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const path = typeof args.path === 'string' ? args.path : '';
  if (!path) {
    return { toolCallId, success: false, error: 'No file path provided' };
  }

  if (!isAllowedSessionPath(path)) {
    return {
      toolCallId,
      success: false,
      error: 'read_file can only read paths under /uploads/, /output/, or /data/ and cannot contain traversal segments.',
    };
  }

  try {
    const { parseFile } = await import('./fileParser');
    const offset = toOptionalNumber(args.offset);
    const maxChars = toOptionalNumber(args.max_chars);
    const result = await parseFile(files, path, {
      format: args.format as 'auto' | 'csv' | 'json' | 'excel' | 'text' | undefined,
      sheet: args.sheet as string | undefined,
      maxRows: args.max_rows as number | undefined,
      sample: args.sample as boolean | undefined,
      offset,
      maxChars,
    });

    let summary: string;
    if (result.columns && result.data) {
      summary = `File: ${result.filename} (${result.format})\n`;
      summary += `Total rows: ${result.totalRows}, Showing: ${result.returnedRows}\n`;
      summary += `Columns (${result.columns.length}): ${result.columns.join(', ')}\n`;
      if (result.columnTypes) {
        summary += `Types: ${Object.entries(result.columnTypes).map(([k, v]) => `${k}=${v}`).join(', ')}\n`;
      }
      if (result.sheets) {
        summary += `Sheets: ${result.sheets.join(', ')} (active: ${result.activeSheet})\n`;
      }
      if (result.format === 'json' && result.content) {
        const start = result.contentOffset ?? 0;
        const end = result.contentEnd ?? (start + result.content.length);
        const total = result.totalChars ?? end;
        summary += `\nJSON content slice (chars ${start}-${end} of ${total}):\n`;
        summary += result.content;
      } else {
        const previewRows = result.data.slice(0, 5);
        summary += `\nPreview (first ${previewRows.length} rows):\n`;
        summary += JSON.stringify(previewRows, null, 2);
      }
      if (result.truncated) {
        const nextOffset = result.contentEnd && result.totalChars && result.contentEnd < result.totalChars
          ? `; next offset: ${result.contentEnd}`
          : '';
        summary += `\n\n[Data/content truncated - showing ${result.returnedRows} of ${result.totalRows} rows${nextOffset}]`;
      }
    } else if (result.content) {
      summary = `File: ${result.filename} (${result.format})\n`;
      if (result.jsonType) {
        summary += `JSON type: ${result.jsonType}`;
        if (result.jsonArrayLength) summary += ` (${result.jsonArrayLength} items)`;
        if (result.jsonKeys) summary += `\nKeys: ${result.jsonKeys.join(', ')}`;
        summary += '\n';
      }
      if (result.lineCount) {
        summary += `Lines: ${result.lineCount}\n`;
      }
      const start = result.contentOffset ?? 0;
      const end = result.contentEnd ?? (start + result.content.length);
      const total = result.totalChars ?? end;
      summary += `Content slice: chars ${start}-${end} of ${total}\n`;
      summary += `\n${result.content}`;
      if (result.truncated) {
        summary += result.contentEnd && result.totalChars && result.contentEnd < result.totalChars
          ? `\n\n[Content truncated - next offset: ${result.contentEnd}]`
          : '\n\n[Content truncated]';
      }
    } else {
      summary = `File: ${result.filename} (${result.format}) - empty or unreadable`;
    }

    return {
      toolCallId,
      success: true,
      content: summary,
      metadata: {
        fullStdout: JSON.stringify(result, null, 2),
      },
    };
  } catch (error) {
    return {
      toolCallId,
      success: false,
      error: error instanceof Error ? error.message : 'Failed to read file',
    };
  }
}
