import type { Context, Sandbox } from '@e2b/code-interpreter';
import { kernelPidFile } from './runtime';
import type { RawRunResult, SandboxFileEntry, SandboxProvider } from './types';

/**
 * E2B implementation of SandboxProvider. Validated in the 2026-10-03 Phase 0
 * spike: Firecracker isolation, memory-preserving pause/resume, deny-all egress.
 *
 * Sandboxes are created with internet access disabled — Analyze Python has never
 * had network access; data arrives through server tools that write into /data.
 */
const CONTEXT_DIR = '/tmp/symposium_contexts';

/**
 * The E2B SDK is loaded on first use, not at import time. Every function in this
 * codebase loads the whole index at startup; a top-level import put the SDK in
 * every container and pushed 256 MiB functions over their memory limit.
 */
type E2BModules = {
  Sandbox: typeof import('@e2b/code-interpreter').Sandbox;
  NotFoundError: typeof import('e2b').NotFoundError;
  TimeoutError: typeof import('e2b').TimeoutError;
};
let e2bModules: Promise<E2BModules> | null = null;
function loadE2B(): Promise<E2BModules> {
  if (!e2bModules) {
    e2bModules = Promise.all([import('@e2b/code-interpreter'), import('e2b')]).then(([ci, core]) => ({
      Sandbox: ci.Sandbox,
      NotFoundError: core.NotFoundError,
      TimeoutError: core.TimeoutError,
    }));
  }
  return e2bModules;
}

export class E2BSandboxProvider implements SandboxProvider {
  readonly name = 'e2b';
  private readonly connected = new Map<string, Sandbox>();
  /** sandboxId|kernelKey → E2B context id (cache of the in-sandbox record). */
  private readonly contexts = new Map<string, string>();

  constructor(private readonly apiKey: string) {}

  async create(options: { template: string; idleTimeoutMs: number; metadata: Record<string, string> }): Promise<string> {
    const { Sandbox } = await loadE2B();
    const sandbox = await Sandbox.create(options.template, {
      apiKey: this.apiKey,
      allowInternetAccess: false,
      timeoutMs: options.idleTimeoutMs,
      lifecycle: { onTimeout: 'pause', autoResume: true },
      metadata: options.metadata,
    });
    this.connected.set(sandbox.sandboxId, sandbox);
    return sandbox.sandboxId;
  }

  async connect(sandboxId: string, idleTimeoutMs: number): Promise<boolean> {
    const { Sandbox, NotFoundError } = await loadE2B();
    try {
      const sandbox = await Sandbox.connect(sandboxId, { apiKey: this.apiKey, timeoutMs: idleTimeoutMs });
      this.connected.set(sandboxId, sandbox);
      return true;
    } catch (error) {
      if (error instanceof NotFoundError) {
        this.connected.delete(sandboxId);
        return false;
      }
      throw error;
    }
  }

  async destroy(sandboxId: string): Promise<void> {
    const { Sandbox, NotFoundError } = await loadE2B();
    this.connected.delete(sandboxId);
    this.forgetContexts(sandboxId);
    try {
      await Sandbox.kill(sandboxId, { apiKey: this.apiKey });
    } catch (error) {
      if (!(error instanceof NotFoundError)) throw error;
    }
  }

  async runCode(sandboxId: string, code: string, timeoutMs: number, kernelKey: string): Promise<RawRunResult> {
    const { TimeoutError } = await loadE2B();
    const sandbox = this.get(sandboxId);
    const context = await this.context(sandboxId, kernelKey);
    try {
      const execution = await sandbox.runCode(code, { context, timeoutMs, requestTimeoutMs: timeoutMs + 15_000 });
      const pngs = execution.results.map((r) => r.png).filter((png): png is string => Boolean(png));
      const main = execution.results.find((r) => r.isMainResult);
      return {
        stdout: execution.logs.stdout.join(''),
        stderr: execution.logs.stderr.join(''),
        text: main?.text,
        pngs,
        error: execution.error
          ? { name: execution.error.name, value: execution.error.value, traceback: execution.error.traceback }
          : undefined,
        timedOut: false,
      };
    } catch (error) {
      if (error instanceof TimeoutError) {
        return { stdout: '', stderr: '', pngs: [], timedOut: true };
      }
      throw error;
    }
  }

  async interruptKernel(sandboxId: string, kernelKey: string): Promise<void> {
    const pidFile = kernelPidFile(kernelKey);
    await this.get(sandboxId).commands.run(
      `test -s ${pidFile} && kill -INT "$(cat ${pidFile})"`,
      { user: 'root', timeoutMs: 15_000 },
    );
  }

  /**
   * Restarting a busy kernel returns before the old process has died; callers
   * must wait for the kernel to answer again (see SandboxSessionService).
   */
  async restartKernel(sandboxId: string, kernelKey: string): Promise<void> {
    const context = await this.context(sandboxId, kernelKey);
    await this.get(sandboxId).restartCodeContext(context);
  }

  async releaseKernel(sandboxId: string, kernelKey: string): Promise<void> {
    const { NotFoundError } = await loadE2B();
    const sandbox = this.get(sandboxId);
    const contextId = await this.storedContextId(sandboxId, kernelKey);
    if (!contextId) return;
    try {
      await sandbox.removeCodeContext(contextId);
    } catch (error) {
      if (!(error instanceof NotFoundError)) throw error;
    }
    await sandbox.files.remove(`${CONTEXT_DIR}/${kernelKey}`);
    this.contexts.delete(`${sandboxId}|${kernelKey}`);
  }

  /**
   * Kernel key → Jupyter context. The mapping lives inside the sandbox (so it
   * survives pause/resume and is shared by every function instance) and is
   * cached here. Each key's context is created on first use.
   */
  private async context(sandboxId: string, kernelKey: string): Promise<Context> {
    const existing = await this.storedContextId(sandboxId, kernelKey);
    if (existing) return { id: existing, language: 'python', cwd: '/home/user' };
    const sandbox = this.get(sandboxId);
    const created = await sandbox.createCodeContext({ language: 'python', cwd: '/home/user' });
    await sandbox.files.write(`${CONTEXT_DIR}/${kernelKey}`, created.id);
    this.contexts.set(`${sandboxId}|${kernelKey}`, created.id);
    return created;
  }

  private async storedContextId(sandboxId: string, kernelKey: string): Promise<string | null> {
    const { NotFoundError } = await loadE2B();
    const cacheKey = `${sandboxId}|${kernelKey}`;
    const cached = this.contexts.get(cacheKey);
    if (cached) return cached;
    try {
      const stored = (await this.get(sandboxId).files.read(`${CONTEXT_DIR}/${kernelKey}`)).trim();
      if (!stored) return null;
      this.contexts.set(cacheKey, stored);
      return stored;
    } catch (error) {
      if (error instanceof NotFoundError) return null;
      throw error;
    }
  }

  private forgetContexts(sandboxId: string): void {
    for (const key of this.contexts.keys()) {
      if (key.startsWith(`${sandboxId}|`)) this.contexts.delete(key);
    }
  }

  async runCommand(sandboxId: string, command: string, timeoutMs: number): Promise<{ stdout: string; exitCode: number }> {
    const result = await this.get(sandboxId).commands.run(command, { timeoutMs });
    return { stdout: result.stdout, exitCode: result.exitCode };
  }

  async writeFile(sandboxId: string, path: string, data: Uint8Array): Promise<void> {
    const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
    await this.get(sandboxId).files.write(path, buffer);
  }

  async readFile(sandboxId: string, path: string): Promise<Uint8Array> {
    return this.get(sandboxId).files.read(path, { format: 'bytes' });
  }

  async listDir(sandboxId: string, path: string): Promise<SandboxFileEntry[]> {
    const entries = await this.get(sandboxId).files.list(path);
    return entries.map((e) => ({ name: e.name, path: e.path, size: e.size, isDirectory: e.type === 'dir' }));
  }

  async stat(sandboxId: string, path: string): Promise<SandboxFileEntry | null> {
    const { NotFoundError } = await loadE2B();
    try {
      const e = await this.get(sandboxId).files.getInfo(path);
      return { name: e.name, path: e.path, size: e.size, isDirectory: e.type === 'dir' };
    } catch (error) {
      if (error instanceof NotFoundError) return null;
      throw error;
    }
  }

  async remove(sandboxId: string, path: string): Promise<void> {
    await this.get(sandboxId).files.remove(path);
  }

  private get(sandboxId: string): Sandbox {
    const sandbox = this.connected.get(sandboxId);
    if (!sandbox) throw new Error(`Sandbox ${sandboxId} is not connected`);
    return sandbox;
  }
}
