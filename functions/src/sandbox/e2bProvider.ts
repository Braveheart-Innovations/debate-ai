import { Sandbox } from '@e2b/code-interpreter';
import { NotFoundError, TimeoutError } from 'e2b';
import { KERNEL_PID_FILE } from './runtime';
import type { RawRunResult, SandboxFileEntry, SandboxProvider } from './types';

/**
 * E2B implementation of SandboxProvider. Validated in the 2026-10-03 Phase 0
 * spike: Firecracker isolation, memory-preserving pause/resume, deny-all egress.
 *
 * Sandboxes are created with internet access disabled — Analyze Python has never
 * had network access; data arrives through server tools that write into /data.
 */
export class E2BSandboxProvider implements SandboxProvider {
  readonly name = 'e2b';
  private readonly connected = new Map<string, Sandbox>();

  constructor(private readonly apiKey: string) {}

  async create(options: { template: string; idleTimeoutMs: number; metadata: Record<string, string> }): Promise<string> {
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
    this.connected.delete(sandboxId);
    try {
      await Sandbox.kill(sandboxId, { apiKey: this.apiKey });
    } catch (error) {
      if (!(error instanceof NotFoundError)) throw error;
    }
  }

  async runCode(sandboxId: string, code: string, timeoutMs: number): Promise<RawRunResult> {
    const sandbox = this.get(sandboxId);
    try {
      const execution = await sandbox.runCode(code, { timeoutMs, requestTimeoutMs: timeoutMs + 15_000 });
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

  async interruptKernel(sandboxId: string): Promise<void> {
    await this.get(sandboxId).commands.run(
      `test -s ${KERNEL_PID_FILE} && kill -INT "$(cat ${KERNEL_PID_FILE})"`,
      { user: 'root', timeoutMs: 15_000 },
    );
  }

  /**
   * Restarting a busy kernel returns before the old process has died; callers
   * must wait for the kernel to answer again (see SandboxSessionService).
   */
  async restartKernel(sandboxId: string): Promise<void> {
    const sandbox = this.get(sandboxId);
    const contexts = await sandbox.listCodeContexts();
    const python = contexts.find((c) => c.language === 'python') ?? contexts[0];
    if (python) await sandbox.restartCodeContext(python);
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
