/**
 * The loop's view of the session sandbox: the same `execute(code, {timeout,
 * signal})` bridge the browser loop used (web SandboxService.execute), backed
 * by the server sandbox service directly instead of the sandboxExecute
 * callable. Abort interrupts the running cell (variables are kept).
 */
import { getSandboxService } from '../../sandbox/callables';
import type { ExecutionResult as ServiceExecutionResult } from '../../sandbox/types';

/**
 * The bridge's result, hydrated like the browser's (web SandboxService
 * hydrate): every HTML output carries its content and every data output its
 * base64, fetched from the sandbox when it was past the inline budget.
 */
export interface ExecutionResult {
  success: boolean;
  stdout: string;
  result?: string;
  images?: string[];
  htmlOutputs?: Array<{ filename: string; content: string }>;
  dataOutputs?: Array<{ filename: string; size: number; base64: string }>;
  error?: string;
}

export async function readWholeFile(uid: string, sessionKey: string, path: string): Promise<Buffer> {
  const service = getSandboxService();
  const chunks: Buffer[] = [];
  let offset = 0;
  for (;;) {
    const chunk = await service.readFile(uid, sessionKey, { path, offset });
    const bytes = Buffer.from(chunk.base64, 'base64');
    chunks.push(bytes);
    offset += bytes.byteLength;
    if (chunk.eof || bytes.byteLength === 0) break;
  }
  return Buffer.concat(chunks);
}

async function hydrate(uid: string, sessionKey: string, remote: ServiceExecutionResult): Promise<ExecutionResult> {
  const htmlOutputs = await Promise.all(remote.htmlOutputs.map(async (file) => ({
    filename: file.filename,
    content: file.content ?? (await readWholeFile(uid, sessionKey, file.path)).toString('utf8'),
  })));
  const dataOutputs = await Promise.all(remote.dataOutputs.map(async (file) => ({
    filename: file.filename,
    size: file.size,
    base64: file.base64 ?? (await readWholeFile(uid, sessionKey, file.path)).toString('base64'),
  })));
  return {
    success: remote.success,
    stdout: remote.stdout,
    result: remote.result,
    images: remote.images,
    htmlOutputs,
    dataOutputs,
    error: remote.error,
  };
}

export interface SandboxBridge {
  execute: (code: string, options?: { timeout?: number; signal?: AbortSignal }) => Promise<ExecutionResult>;
}

export class SandboxCancelledError extends Error {
  constructor() {
    super('Execution cancelled');
  }
}

export function createSandboxBridge(uid: string, sessionKey: string, kernelKey?: string): SandboxBridge {
  return {
    async execute(code, options = {}) {
      if (options.signal?.aborted) throw new SandboxCancelledError();
      const service = getSandboxService();
      const onAbort = () => { void service.interrupt(uid, sessionKey, kernelKey); };
      options.signal?.addEventListener('abort', onAbort, { once: true });
      try {
        const result = await service.execute(uid, sessionKey, code, options.timeout ?? 30000, kernelKey);
        if (result.environmentReset) {
          // Same note the browser bridge added (web SandboxService.execute).
          result.stdout = `[The Python environment was restarted: variables and files from earlier steps are gone.]\n${result.stdout}`;
        }
        return await hydrate(uid, sessionKey, result);
      } finally {
        options.signal?.removeEventListener('abort', onAbort);
      }
    },
  };
}
