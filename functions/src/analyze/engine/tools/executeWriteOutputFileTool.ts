/** Moved from symposium-ai-web src/services/analyze/orchestrator/tools/executeWriteOutputFileTool.ts (Phase 3 Step 5), unchanged. */
import type { ToolResult } from '../../contract/lib/ai/tools/types';

interface SandboxFileBridge {
  mountFile: (filename: string, data: ArrayBuffer, path?: string) => Promise<string>;
  readFile: (path: string) => Promise<ArrayBuffer>;
}

const OUTPUT_PREFIX = '/output/';

function normalizeOutputPath(path: unknown): string {
  if (typeof path !== 'string' || !path.trim()) {
    throw new Error('path is required.');
  }

  const trimmed = path.trim();
  if (!trimmed.startsWith(OUTPUT_PREFIX)) {
    throw new Error('write_output_file can only write under /output/.');
  }

  const parts = trimmed.slice(OUTPUT_PREFIX.length).split('/').filter(Boolean);
  if (parts.length === 0 || parts.some((part) => part === '.' || part === '..')) {
    throw new Error('path must point to a file under /output/ and cannot contain traversal segments.');
  }

  return `${OUTPUT_PREFIX}${parts.join('/')}`;
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const result = new Uint8Array(a.length + b.length);
  result.set(a, 0);
  result.set(b, a.length);
  return result;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 10 || unitIndex === 0 ? Math.round(value) : value.toFixed(1)} ${units[unitIndex]}`;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function inferMimeType(path: string, isBase64: boolean): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  if (ext === 'html' || ext === 'htm') return 'text/html';
  if (ext === 'css') return 'text/css';
  if (ext === 'js') return 'application/javascript';
  if (ext === 'json') return 'application/json';
  if (ext === 'md') return 'text/markdown';
  if (ext === 'txt' || ext === 'log') return 'text/plain';
  if (ext === 'csv') return 'text/csv';
  if (ext === 'tsv') return 'text/tab-separated-values';
  if (ext === 'svg') return 'image/svg+xml';
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (ext === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  return isBase64 ? 'application/octet-stream' : 'text/plain';
}

function isHistoryCompactionPlaceholder(content: string): boolean {
  return /write_output_file content omitted from history/i.test(content)
    || /execute_python code omitted from history/i.test(content);
}

export async function executeWriteOutputFileTool(
  sandbox: SandboxFileBridge,
  toolCallId: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  try {
    const path = normalizeOutputPath(args.path);
    const content = typeof args.content === 'string' ? args.content : '';
    const append = args.append === true;
    const isBase64 = args.is_base64 === true;

    if (isHistoryCompactionPlaceholder(content)) {
      let existingSize: number | null = null;
      try {
        existingSize = (await sandbox.readFile(path)).byteLength;
      } catch {
        existingSize = null;
      }

      const existingMessage = existingSize === null
        ? 'No existing file was inspected.'
        : `Existing file size remains ${formatBytes(existingSize)}.`;

      return {
        toolCallId,
        success: false,
        content: `Refused to write a history-compaction placeholder to ${path}. ${existingMessage} Use read_file(path="${path}", format="text", offset=0, max_chars=4000) to inspect the saved file, or provide the real file content if it must be regenerated.`,
        error: 'Refused to write history-compaction placeholder content.',
      };
    }

    if (!content && !append) {
      return {
        toolCallId,
        success: false,
        error: 'content is required unless appending an empty chunk intentionally.',
      };
    }

    const newBytes = isBase64
      ? base64ToBytes(content)
      : new TextEncoder().encode(content);

    let bytes = newBytes;
    if (append) {
      try {
        const existing = await sandbox.readFile(path);
        bytes = concatBytes(new Uint8Array(existing), newBytes);
      } catch {
        bytes = newBytes;
      }
    }

    const filename = path.split('/').pop() || 'output';
    await sandbox.mountFile(filename, bytesToArrayBuffer(bytes), path);
    const outputFilename = path.slice(OUTPUT_PREFIX.length);
    const mimeType = inferMimeType(path, isBase64);

    return {
      toolCallId,
      success: true,
      content: `${append ? 'Appended' : 'Wrote'} ${formatBytes(newBytes.byteLength)} to ${path}. File size is now ${formatBytes(bytes.byteLength)}.`,
      htmlOutputs: mimeType === 'text/html'
        ? [{ filename: outputFilename, content: new TextDecoder().decode(bytes) }]
        : undefined,
      dataOutputs: mimeType === 'text/html'
        ? undefined
        : [{ filename: outputFilename, base64: bytesToBase64(bytes), size: bytes.byteLength }],
    };
  } catch (error) {
    return {
      toolCallId,
      success: false,
      error: error instanceof Error ? error.message : 'Failed to write output file.',
    };
  }
}
