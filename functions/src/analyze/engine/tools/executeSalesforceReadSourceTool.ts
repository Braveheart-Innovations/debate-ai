/** Moved from symposium-ai-web src/services/analyze/orchestrator/tools/executeSalesforceReadSourceTool.ts (Phase 3 Step 5), logic unchanged; the sandbox filesystem is injected. */
import type { ToolResult } from '../../contract/lib/ai/tools/types';
import type { SalesforceReadSourceArgs } from '../../contract/lib/ai/tools/built-in/salesforce-read-source';
import {
  loadSalesforceWorkspaceInputs,
  type SalesforceSourceFile,
} from '../../salesforce/SalesforceMetadataService';
import type { SandboxFiles } from './sandboxFiles';

/** Lines per read: a page, with the next page one call away. */
export const SOURCE_PAGE_LINES = 400;
/** Matches per search; the result says how many more there were. */
export const SOURCE_SEARCH_MATCHES = 200;
const MAX_LINE_CHARS = 1000;

export async function executeSalesforceReadSourceTool(
  files: SandboxFiles,
  toolCallId: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  try {
    const { sourceFiles } = await loadSalesforceWorkspaceInputs(files);
    const result = readSalesforceSource(sourceFiles, normalizeArgs(args));
    return result.ok
      ? { toolCallId, success: true, content: result.content }
      : { toolCallId, success: false, error: result.error };
  } catch (error) {
    return {
      toolCallId,
      success: false,
      error: error instanceof Error ? error.message : 'Reading the Salesforce source failed',
    };
  }
}

function normalizeArgs(args: Record<string, unknown>): SalesforceReadSourceArgs {
  const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : undefined);
  const line = (value: unknown) => {
    const parsed = typeof value === 'string' ? Number(value) : value;
    return typeof parsed === 'number' && Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : undefined;
  };
  return {
    component: text(args.component),
    path: text(args.path),
    pattern: text(args.pattern),
    start_line: line(args.start_line),
    end_line: line(args.end_line),
  };
}

type ReadResult = { ok: true; content: string } | { ok: false; error: string };

/** Pure: read or search the workspace's source files. */
export function readSalesforceSource(files: SalesforceSourceFile[], args: SalesforceReadSourceArgs): ReadResult {
  if (files.length === 0) {
    return {
      ok: false,
      error: 'No Salesforce source files were found in the uploads. Upload a Salesforce DX project ZIP, metadata ZIP, or source files.',
    };
  }
  if (!args.component && !args.path && !args.pattern) {
    return { ok: false, error: 'Give `component` or `path` to read a file, or `pattern` to search the source.' };
  }

  const scoped = args.component || args.path ? findFiles(files, args) : files;
  if (scoped.length === 0) {
    return { ok: false, error: `No source file matches ${describeTarget(args)}. Search with \`pattern\` to find it.` };
  }
  if (args.pattern) return searchFiles(scoped, args.pattern, files.length === scoped.length ? 'the workspace' : describeTarget(args));

  const code = scoped.filter((file) => !isMetaXml(file.path));
  const primary = code.length > 0 ? code : scoped;
  if (args.path && primary.length > 1) {
    return {
      ok: false,
      error: `${primary.length} files match ${describeTarget(args)}; give the full path of one:\n${primary.map((file) => `- ${file.path}`).join('\n')}`,
    };
  }

  const [file] = primary;
  const others = scoped.filter((candidate) => candidate !== file);
  const content = [
    readFile(file, args.start_line, args.end_line),
    others.length > 0 ? `\nOther files for ${describeTarget(args)}:\n${others.map((other) => `- ${other.path}`).join('\n')}` : '',
  ].join('');
  return { ok: true, content };
}

function readFile(file: SalesforceSourceFile, startLine = 1, endLine?: number): string {
  const lines = splitLines(file.content);
  const start = Math.min(startLine, Math.max(lines.length, 1));
  const end = Math.min(endLine ?? start + SOURCE_PAGE_LINES - 1, start + SOURCE_PAGE_LINES - 1, lines.length);
  const body = lines.slice(start - 1, end).map((line, index) => formatLine(start + index, line, end)).join('\n');
  const header = `${file.path} — lines ${start}-${end} of ${lines.length}`;
  const next = end < lines.length ? `\n\n(More: call again with path="${file.path}", start_line=${end + 1}.)` : '';
  return `${header}\n${body}${next}`;
}

function searchFiles(files: SalesforceSourceFile[], pattern: string, scope: string): ReadResult {
  const regex = toRegex(pattern);
  const matches: string[] = [];
  let total = 0;
  for (const file of files) {
    splitLines(file.content).forEach((line, index) => {
      if (!regex.test(line)) return;
      total += 1;
      if (matches.length < SOURCE_SEARCH_MATCHES) matches.push(`${file.path}:${index + 1}: ${clip(line.trim())}`);
    });
  }
  if (total === 0) return { ok: true, content: `No lines match /${pattern}/i in ${scope} (${files.length} files searched).` };
  const more = total > matches.length
    ? `\n\n(${total - matches.length} more matches not shown: narrow the pattern, or scope it with component/path.)`
    : '';
  return { ok: true, content: `${total} matching lines for /${pattern}/i in ${scope}:\n${matches.join('\n')}${more}` };
}

function findFiles(files: SalesforceSourceFile[], args: SalesforceReadSourceArgs): SalesforceSourceFile[] {
  if (args.path) {
    const wanted = normalizePath(args.path).toLowerCase();
    const exact = files.filter((file) => file.path.toLowerCase() === wanted);
    if (exact.length > 0) return exact;
    return files.filter((file) => {
      const path = file.path.toLowerCase();
      return path.endsWith(`/${wanted}`) || baseName(path) === wanted;
    });
  }
  const name = (args.component ?? '').toLowerCase();
  // "Account.Email__c" names a field: objects/Account/fields/Email__c.field-meta.xml.
  const [objectName, fieldName] = name.includes('.') ? name.split('.', 2) : [null, null];
  return files.filter((file) => {
    const path = file.path.toLowerCase();
    if (objectName && fieldName) return path.includes(`/objects/${objectName}/`) && componentName(path) === fieldName;
    return componentName(path) === name;
  });
}

function toRegex(pattern: string): RegExp {
  try {
    return new RegExp(pattern, 'i');
  } catch {
    return new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  }
}

function formatLine(lineNumber: number, line: string, lastLine: number): string {
  return `${String(lineNumber).padStart(String(lastLine).length, ' ')} | ${clip(line)}`;
}

function clip(line: string): string {
  return line.length > MAX_LINE_CHARS ? `${line.slice(0, MAX_LINE_CHARS)}… [${line.length - MAX_LINE_CHARS} more chars]` : line;
}

function splitLines(content: string): string[] {
  return content.replace(/\r\n?/g, '\n').split('\n');
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+/, '');
}

function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** "classes/LeadReparentingInvocable.cls-meta.xml" → "leadreparentinginvocable". */
function componentName(path: string): string {
  const base = baseName(path);
  const dot = base.indexOf('.');
  return dot === -1 ? base : base.slice(0, dot);
}

/** A code file's companion metadata (API version, status), read after the code itself. */
function isMetaXml(path: string): boolean {
  return /\.(cls|trigger|page|component|js)-meta\.xml$/i.test(path);
}

function describeTarget(args: SalesforceReadSourceArgs): string {
  return args.path ? `path "${args.path}"` : `component "${args.component}"`;
}
