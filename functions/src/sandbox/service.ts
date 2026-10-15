import {
  DEFAULT_KERNEL,
  filterStderr,
  formatTraceback,
  parsePostScan,
  postCode,
  preCode,
} from './runtime';
import type {
  ExecutionResult,
  OutputFile,
  SandboxFileEntry,
  SandboxProvider,
  SandboxRecordRef,
  SandboxStore,
  SandboxUsage,
} from './types';

/** Inline base64/HTML in one execute response up to this many bytes; the rest is deferred. */
export const INLINE_OUTPUT_BUDGET_BYTES = 6 * 1024 * 1024;
/** Chunk size for file transfer; keeps callable payloads well under platform limits. */
export const FILE_CHUNK_BYTES = 4 * 1024 * 1024;
const BOOTSTRAP_TIMEOUT_MS = 120_000;
const POST_TIMEOUT_MS = 60_000;
const COMMAND_TIMEOUT_MS = 60_000;
const PROBE_TIMEOUT_MS = 5_000;
const RESTART_READY_DEADLINE_MS = 30_000;

export class SandboxInputError extends Error {}

/**
 * The user already has `limit` sessions with a sandbox awake. A sandbox stays
 * awake until the idle timeout after its last use, so a slot frees up then.
 */
export class SandboxLimitError extends Error {
  constructor(readonly limit: number, readonly waitMs: number, idleTimeoutMs: number) {
    const minutes = (ms: number) => {
      const count = Math.max(1, Math.ceil(ms / 60_000));
      return `${count} minute${count === 1 ? '' : 's'}`;
    };
    super(
      `You already have ${limit} Analyze sessions using Python right now, the most at once. `
      + `A session's Python environment frees up ${minutes(idleTimeoutMs)} after its last use; `
      + `the next one frees up in about ${minutes(waitMs)}. `
      + 'Try again then, or keep working in one of those sessions.',
    );
  }
}

/**
 * Added to the limit message where a model reads it (a tool result): retrying
 * can't succeed until a slot frees up, so it shouldn't spend the turn trying.
 */
export const SANDBOX_LIMIT_MODEL_NOTE = 'Nothing ran. Don\'t retry Python, file, or data-fetch tools in this turn: answer from what you already have, or tell the user they can reply once a slot frees up.';

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export interface WriteFileInput {
  path: string;
  base64: string;
  chunkIndex?: number;
  totalChunks?: number;
  /** Skip the write when the existing file has exactly this size and SHA-256. */
  skipIfUnchanged?: { size: number; sha256: string };
}

export interface SandboxServiceDeps {
  provider: SandboxProvider;
  store: SandboxStore;
  /** The template a new sandbox for this user is created from. Existing sandboxes keep theirs. */
  templateFor: (uid: string) => string;
  idleTimeoutMs: number;
  now: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Records each call's sandbox time (usage tracking). A failure here never fails the call. */
  meter?: (uid: string, usage: SandboxUsage) => Promise<void>;
  /** How many of a user's sessions may have a sandbox awake at once. */
  maxAwakePerUser?: number;
}

export class SandboxSessionService {
  private readonly deps: Required<SandboxServiceDeps>;

  constructor(deps: SandboxServiceDeps) {
    this.deps = {
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      meter: async () => undefined,
      maxAwakePerUser: Number.POSITIVE_INFINITY,
      ...deps,
    };
  }

  /** Runs one service call and records its sandbox time. */
  private async metered<T>(uid: string, call: (usage: SandboxUsage) => Promise<T>): Promise<T> {
    const usage: SandboxUsage = { calls: 1, executeMs: 0 };
    const startedAt = this.deps.now();
    try {
      return await call(usage);
    } finally {
      usage.executeMs = Math.max(0, this.deps.now() - startedAt);
      await this.deps.meter(uid, usage).catch((error) => console.warn('[sandbox] usage not recorded', error));
    }
  }

  /**
   * Claim this session's awake slot (as ensure does) without waking the
   * sandbox: a call about to need it learns first whether it can have one.
   */
  async claimSlot(uid: string, sessionKey: string): Promise<void> {
    const { store, now, idleTimeoutMs, maxAwakePerUser } = this.deps;
    const claimedAt = now();
    const claim = await store.claimAwake(uid, sessionKey, claimedAt, idleTimeoutMs, maxAwakePerUser);
    if (!claim.ok) throw new SandboxLimitError(maxAwakePerUser, claim.freesAt - claimedAt, idleTimeoutMs);
  }

  /** Connect to (resuming if paused) or create the sandbox owned by uid for this session. */
  async ensure(uid: string, sessionKey: string, usage?: SandboxUsage): Promise<{ sandboxId: string; environmentReset: boolean }> {
    const { provider, store, now, idleTimeoutMs, maxAwakePerUser } = this.deps;
    // Every use keeps the sandbox up for the idle timeout, so it holds a slot until then.
    const claimedAt = now();
    const claim = await store.claimAwake(uid, sessionKey, claimedAt, idleTimeoutMs, maxAwakePerUser);
    if (!claim.ok) throw new SandboxLimitError(maxAwakePerUser, claim.freesAt - claimedAt, idleTimeoutMs);
    const record = await store.get(uid, sessionKey);
    // The sandbox stayed up after its last use until it paused (idle timeout) or was used again.
    const idleGap = record ? Math.max(0, now() - record.lastUsedAt) : 0;
    if (usage && record) usage.awakeMs = Math.min(idleGap, idleTimeoutMs);
    if (record && await provider.connect(record.sandboxId, idleTimeoutMs)) {
      await store.touch(uid, sessionKey, now());
      if (usage && idleGap > idleTimeoutMs) usage.resumes = 1;
      return { sandboxId: record.sandboxId, environmentReset: false };
    }
    const template = this.deps.templateFor(uid);
    const sandboxId = await provider.create({
      template,
      idleTimeoutMs: this.deps.idleTimeoutMs,
      metadata: { uid, sessionKey },
    });
    const at = now();
    await store.put(uid, sessionKey, {
      sandboxId,
      provider: provider.name,
      template,
      createdAt: at,
      lastUsedAt: at,
    });
    if (usage) usage.creates = 1;
    return { sandboxId, environmentReset: Boolean(record) };
  }

  async execute(
    uid: string,
    sessionKey: string,
    code: string,
    timeoutMs: number,
    kernelKey: string = DEFAULT_KERNEL,
  ): Promise<ExecutionResult> {
    return this.metered(uid, (usage) => this.executeCall(usage, uid, sessionKey, code, timeoutMs, kernelKey));
  }

  private async executeCall(
    usage: SandboxUsage,
    uid: string,
    sessionKey: string,
    code: string,
    timeoutMs: number,
    kernelKey: string,
  ): Promise<ExecutionResult> {
    const { provider } = this.deps;
    const { sandboxId, environmentReset } = await this.ensure(uid, sessionKey, usage);
    const empty = { images: [], htmlOutputs: [], dataOutputs: [], environmentReset };

    const pre = await provider.runCode(sandboxId, preCode(kernelKey), BOOTSTRAP_TIMEOUT_MS, kernelKey);
    if (pre.timedOut || pre.error) {
      if (pre.timedOut) await provider.restartKernel(sandboxId, kernelKey);
      return {
        ...empty,
        success: false,
        stdout: '',
        error: `Python environment failed to start: ${pre.error ? formatError(pre.error) : 'timed out'}`,
      };
    }

    const main = await provider.runCode(sandboxId, code, timeoutMs, kernelKey);
    if (main.timedOut) {
      const outcome = await this.stopRunningCode(sandboxId, kernelKey);
      return {
        ...empty,
        success: false,
        stdout: '',
        error: `Execution timed out after ${Math.round(timeoutMs / 1000)}s and was stopped. `
          + (outcome === 'interrupted'
            ? 'Variables and files are kept.'
            : 'The Python session was restarted, so variables were cleared; files in /uploads, /output and /data are kept.'),
        errorCode: 'TIMEOUT',
      };
    }

    const failed = Boolean(main.error);
    const post = await provider.runCode(sandboxId, postCode(!failed, kernelKey), POST_TIMEOUT_MS, kernelKey);
    const scan = parsePostScan(post.stdout) ?? { images: [], html: [], data: [] };

    const stdoutParts: string[] = [];
    if (main.stdout.trim()) stdoutParts.push(main.stdout.replace(/\s+$/, ''));
    for (const line of filterStderr(main.stderr)) stdoutParts.push(`[stderr] ${line}`);
    if (!failed && main.text && main.text.trim() && main.text !== 'None') stdoutParts.push(main.text);
    const stdout = stdoutParts.join('\n');

    const budget = { remaining: INLINE_OUTPUT_BUDGET_BYTES };
    const images = failed ? [] : [...scan.images, ...main.pngs];
    const htmlOutputs = [];
    for (const file of scan.html) {
      const content = await this.readInline(sandboxId, file, budget);
      htmlOutputs.push(content ? { ...file, content: Buffer.from(content).toString('utf8') } : file);
    }
    const dataOutputs: OutputFile[] = [];
    for (const file of scan.data) {
      const bytes = await this.readInline(sandboxId, file, budget);
      dataOutputs.push(bytes ? { ...file, base64: Buffer.from(bytes).toString('base64') } : file);
    }

    if (failed) {
      return {
        success: false,
        stdout,
        images: [],
        htmlOutputs: [],
        dataOutputs,
        error: formatError(main.error!),
        environmentReset,
      };
    }

    return {
      success: true,
      stdout,
      images,
      htmlOutputs,
      dataOutputs,
      result: stdout || (images.length > 0
        ? 'Generated visualization'
        : htmlOutputs.length > 0
          ? 'Generated interactive visualization'
          : dataOutputs.length > 0 ? 'Generated data file(s)' : 'Done'),
      environmentReset,
    };
  }

  /**
   * Write a file, optionally in chunks. Chunks land as part files and are joined
   * when the last one arrives. `skipIfUnchanged` makes re-mounts after a page reload free.
   */
  async writeFile(
    uid: string,
    sessionKey: string,
    input: WriteFileInput,
  ): Promise<{ written: boolean; environmentReset: boolean }> {
    return this.metered(uid, (usage) => this.writeFileCall(usage, uid, sessionKey, input));
  }

  private async writeFileCall(
    usage: SandboxUsage,
    uid: string,
    sessionKey: string,
    input: WriteFileInput,
  ): Promise<{ written: boolean; environmentReset: boolean }> {
    const { provider } = this.deps;
    const { sandboxId, environmentReset } = await this.ensure(uid, sessionKey, usage);
    const totalChunks = input.totalChunks ?? 1;
    const chunkIndex = input.chunkIndex ?? 0;
    if (!Number.isInteger(totalChunks) || totalChunks < 1 || !Number.isInteger(chunkIndex)
      || chunkIndex < 0 || chunkIndex >= totalChunks) {
      throw new SandboxInputError('Invalid chunk index');
    }

    if (chunkIndex === 0 && input.skipIfUnchanged && await this.isUnchanged(sandboxId, input.path, input.skipIfUnchanged)) {
      return { written: false, environmentReset };
    }

    const bytes = Buffer.from(input.base64, 'base64');
    if (totalChunks === 1) {
      await provider.writeFile(sandboxId, input.path, bytes);
      return { written: true, environmentReset };
    }

    await provider.writeFile(sandboxId, partPath(input.path, chunkIndex), bytes);
    if (chunkIndex === totalChunks - 1) {
      const parts = Array.from({ length: totalChunks }, (_, i) => shellQuote(partPath(input.path, i))).join(' ');
      const joined = await provider.runCommand(
        sandboxId,
        `cat ${parts} > ${shellQuote(input.path)} && rm -f ${parts}`,
        COMMAND_TIMEOUT_MS,
      );
      if (joined.exitCode !== 0) throw new Error(`Failed to assemble ${input.path}`);
    }
    return { written: true, environmentReset };
  }

  /** Write bytes the server already holds (no base64 round trip). */
  async writeBytes(uid: string, sessionKey: string, path: string, bytes: Uint8Array): Promise<void> {
    return this.metered(uid, async (usage) => {
      const { sandboxId } = await this.ensure(uid, sessionKey, usage);
      await this.deps.provider.writeFile(sandboxId, path, bytes);
    });
  }

  /**
   * Make each link path name the same file as its target (a hard link; a copy
   * where the paths are on different filesystems). One command for all of them.
   */
  async linkFiles(uid: string, sessionKey: string, groups: Array<{ target: string; links: string[] }>): Promise<void> {
    const commands = groups.flatMap(({ target, links }) => links
      .filter((link) => link !== target)
      .map((link) => {
        const dir = link.slice(0, link.lastIndexOf('/')) || '/';
        return `mkdir -p ${shellQuote(dir)} && { ln -f ${shellQuote(target)} ${shellQuote(link)} 2>/dev/null || cp -f ${shellQuote(target)} ${shellQuote(link)}; }`;
      }));
    if (commands.length === 0) return;
    return this.metered(uid, async (usage) => {
      const { sandboxId } = await this.ensure(uid, sessionKey, usage);
      const result = await this.deps.provider.runCommand(sandboxId, commands.join(' && '), COMMAND_TIMEOUT_MS);
      if (result.exitCode !== 0) throw new Error('Failed to link files in the sandbox');
    });
  }

  /**
   * Unpack zips into one folder, replacing what was there, in one command. A checksum of
   * the zips is kept in the folder, so unpacking the same zips again does nothing.
   */
  async extractZips(uid: string, sessionKey: string, zipPaths: string[], destination: string): Promise<void> {
    if (zipPaths.length === 0) return;
    const zips = zipPaths.map(shellQuote).join(' ');
    const dir = shellQuote(destination);
    const marker = shellQuote(`${destination}/.zip-sha256`);
    const unzip = shellQuote('import sys, zipfile\nfor path in sys.argv[2:]: zipfile.ZipFile(path).extractall(sys.argv[1])');
    const command = [
      `expected="$(sha256sum ${zips})"`,
      `if [ "$(cat ${marker} 2>/dev/null)" != "$expected" ]; then rm -rf ${dir} && mkdir -p ${dir} && python3 -c ${unzip} ${dir} ${zips} && printf '%s' "$expected" > ${marker}; fi`,
    ].join(' && ');
    return this.metered(uid, async (usage) => {
      const { sandboxId } = await this.ensure(uid, sessionKey, usage);
      const result = await this.deps.provider.runCommand(sandboxId, command, COMMAND_TIMEOUT_MS);
      if (result.exitCode !== 0) throw new Error(`Failed to unpack ${zipPaths.join(', ')} into ${destination}`);
    });
  }

  async readFile(
    uid: string,
    sessionKey: string,
    input: { path: string; offset?: number },
  ): Promise<{ base64: string; size: number; eof: boolean }> {
    return this.metered(uid, (usage) => this.readFileCall(usage, uid, sessionKey, input));
  }

  private async readFileCall(
    usage: SandboxUsage,
    uid: string,
    sessionKey: string,
    input: { path: string; offset?: number },
  ): Promise<{ base64: string; size: number; eof: boolean }> {
    const { provider } = this.deps;
    const { sandboxId } = await this.ensure(uid, sessionKey, usage);
    const info = await provider.stat(sandboxId, input.path);
    if (!info || info.isDirectory) throw new SandboxInputError(`File not found: ${input.path}`);

    const offset = Math.max(0, Math.floor(input.offset ?? 0));
    if (offset === 0 && info.size <= FILE_CHUNK_BYTES) {
      const bytes = await provider.readFile(sandboxId, input.path);
      return { base64: Buffer.from(bytes).toString('base64'), size: bytes.byteLength, eof: true };
    }

    const result = await provider.runCommand(
      sandboxId,
      `tail -c +${offset + 1} ${shellQuote(input.path)} | head -c ${FILE_CHUNK_BYTES} | base64 -w0`,
      COMMAND_TIMEOUT_MS,
    );
    if (result.exitCode !== 0) throw new Error(`Failed to read ${input.path}`);
    return {
      base64: result.stdout.trim(),
      size: info.size,
      eof: offset + FILE_CHUNK_BYTES >= info.size,
    };
  }

  async listFiles(uid: string, sessionKey: string, dir: string): Promise<SandboxFileEntry[]> {
    return this.metered(uid, async (usage) => {
      const { provider } = this.deps;
      const { sandboxId } = await this.ensure(uid, sessionKey, usage);
      const info = await provider.stat(sandboxId, dir);
      if (!info || !info.isDirectory) return [];
      return provider.listDir(sandboxId, dir);
    });
  }

  async deleteFile(uid: string, sessionKey: string, path: string): Promise<void> {
    return this.metered(uid, async (usage) => {
      const { provider } = this.deps;
      const { sandboxId } = await this.ensure(uid, sessionKey, usage);
      if (await provider.stat(sandboxId, path)) await provider.remove(sandboxId, path);
    });
  }

  /** Stop running code in one kernel (user Stop). Python state is kept unless it must restart. */
  async interrupt(
    uid: string,
    sessionKey: string,
    kernelKey: string = DEFAULT_KERNEL,
  ): Promise<'interrupted' | 'restarted' | 'none'> {
    const { provider, store } = this.deps;
    const record = await store.get(uid, sessionKey);
    if (record && await provider.connect(record.sandboxId, this.deps.idleTimeoutMs)) {
      return this.stopRunningCode(record.sandboxId, kernelKey);
    }
    return 'none';
  }

  /** Shut down a finished subagent's kernel; its files stay in /output/agents/<key>. */
  async releaseKernel(uid: string, sessionKey: string, kernelKey: string): Promise<void> {
    if (kernelKey === DEFAULT_KERNEL) throw new SandboxInputError('The main kernel cannot be released');
    const { provider, store } = this.deps;
    const record = await store.get(uid, sessionKey);
    if (record && await provider.connect(record.sandboxId, this.deps.idleTimeoutMs)) {
      await provider.releaseKernel(record.sandboxId, kernelKey);
    }
  }

  /**
   * SIGINT first (KeyboardInterrupt keeps variables); if the kernel still doesn't
   * answer, restart it and wait until the new kernel responds.
   */
  private async stopRunningCode(sandboxId: string, kernelKey: string): Promise<'interrupted' | 'restarted'> {
    const { provider } = this.deps;
    try {
      await provider.interruptKernel(sandboxId, kernelKey);
      if (await this.kernelResponds(sandboxId, kernelKey)) return 'interrupted';
    } catch (error) {
      console.warn('[sandbox] interrupt failed; restarting kernel', error);
    }
    await provider.restartKernel(sandboxId, kernelKey);
    const deadline = this.deps.now() + RESTART_READY_DEADLINE_MS;
    let consecutive = 0;
    while (consecutive < 2 && this.deps.now() < deadline) {
      consecutive = await this.kernelResponds(sandboxId, kernelKey) ? consecutive + 1 : 0;
      if (consecutive < 2) await this.deps.sleep(500);
    }
    return 'restarted';
  }

  private async kernelResponds(sandboxId: string, kernelKey: string): Promise<boolean> {
    try {
      const probe = await this.deps.provider.runCode(sandboxId, '1', PROBE_TIMEOUT_MS, kernelKey);
      return !probe.timedOut && !probe.error;
    } catch {
      return false;
    }
  }

  /** Destroy the session's sandbox (variables and files). */
  async reset(uid: string, sessionKey: string): Promise<void> {
    const { provider, store } = this.deps;
    const record = await store.get(uid, sessionKey);
    if (record) {
      await provider.destroy(record.sandboxId);
      await store.delete(uid, sessionKey);
      await store.releaseAwake(uid, sessionKey);
    }
  }

  /** Destroy every sandbox a user owns (account deletion). */
  async destroyAllForUser(uid: string): Promise<number> {
    const refs = await this.deps.store.listForUser(uid);
    for (const ref of refs) await this.destroyRef(ref);
    return refs.length;
  }

  /** Destroy sandboxes idle longer than `maxIdleMs`. Returns how many were removed. */
  async sweepIdle(maxIdleMs: number, batchSize = 200): Promise<number> {
    const refs = await this.deps.store.listIdle(this.deps.now() - maxIdleMs, batchSize);
    let removed = 0;
    for (const ref of refs) {
      try {
        await this.destroyRef(ref);
        removed += 1;
      } catch (error) {
        console.error('[sandbox] retention sweep failed for', ref.uid, ref.sessionKey, error);
      }
    }
    return removed;
  }

  private async destroyRef(ref: SandboxRecordRef): Promise<void> {
    await this.deps.provider.destroy(ref.record.sandboxId);
    await this.deps.store.delete(ref.uid, ref.sessionKey);
    await this.deps.store.releaseAwake(ref.uid, ref.sessionKey);
  }

  private async isUnchanged(sandboxId: string, path: string, expected: { size: number; sha256: string }): Promise<boolean> {
    if (!/^[0-9a-f]{64}$/.test(expected.sha256)) return false;
    const existing = await this.deps.provider.stat(sandboxId, path);
    if (!existing || existing.isDirectory || existing.size !== expected.size) return false;
    const hashed = await this.deps.provider.runCommand(sandboxId, `sha256sum ${shellQuote(path)}`, COMMAND_TIMEOUT_MS);
    return hashed.exitCode === 0 && hashed.stdout.trim().split(/\s+/)[0] === expected.sha256;
  }

  private async readInline(
    sandboxId: string,
    file: { path: string; size: number },
    budget: { remaining: number },
  ): Promise<Uint8Array | null> {
    if (file.size > budget.remaining) return null;
    const bytes = await this.deps.provider.readFile(sandboxId, file.path);
    budget.remaining -= bytes.byteLength;
    return bytes;
  }
}

function partPath(path: string, index: number): string {
  return `${path}.__symposium_part_${index}`;
}

function formatError(error: { name: string; value: string; traceback: string }): string {
  const traceback = formatTraceback(error.traceback || '');
  return traceback || `${error.name}: ${error.value}`;
}
