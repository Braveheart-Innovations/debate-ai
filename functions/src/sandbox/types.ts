/**
 * Vendor-neutral sandbox contracts for Analyze remote code execution.
 *
 * Nothing above SandboxProvider may depend on a specific vendor (E2B today);
 * see docs/analyze-agents-architecture-plan.md in symposium-ai-web.
 */

/** Raw outcome of running one cell in a sandbox kernel. */
export interface RawRunResult {
  stdout: string;
  stderr: string;
  /** Plain-text value of the cell's last expression, if any. */
  text?: string;
  /** PNG images (base64) emitted via display(). */
  pngs: string[];
  error?: { name: string; value: string; traceback: string };
  timedOut: boolean;
}

export interface SandboxFileEntry {
  name: string;
  path: string;
  size: number;
  isDirectory: boolean;
}

export interface CreateSandboxOptions {
  template: string;
  /** Idle period after which the sandbox pauses (memory preserved). */
  idleTimeoutMs: number;
  metadata: Record<string, string>;
}

export interface SandboxProvider {
  readonly name: string;
  create(options: CreateSandboxOptions): Promise<string>;
  /** Resume/connect. Returns false when the sandbox no longer exists. */
  connect(sandboxId: string, idleTimeoutMs: number): Promise<boolean>;
  destroy(sandboxId: string): Promise<void>;
  runCode(sandboxId: string, code: string, timeoutMs: number): Promise<RawRunResult>;
  /** Send SIGINT to the kernel (KeyboardInterrupt): stops running code, keeps Python state. */
  interruptKernel(sandboxId: string): Promise<void>;
  /** Restart the kernel: stops running code, clears Python state, keeps files. */
  restartKernel(sandboxId: string): Promise<void>;
  runCommand(sandboxId: string, command: string, timeoutMs: number): Promise<{ stdout: string; exitCode: number }>;
  writeFile(sandboxId: string, path: string, data: Uint8Array): Promise<void>;
  readFile(sandboxId: string, path: string): Promise<Uint8Array>;
  listDir(sandboxId: string, path: string): Promise<SandboxFileEntry[]>;
  stat(sandboxId: string, path: string): Promise<SandboxFileEntry | null>;
  remove(sandboxId: string, path: string): Promise<void>;
}

export interface SandboxRecord {
  sandboxId: string;
  provider: string;
  template: string;
  createdAt: number;
  lastUsedAt: number;
}

export interface SandboxRecordRef {
  uid: string;
  sessionKey: string;
  record: SandboxRecord;
}

/** Server-owned mapping of (user, session) → sandbox. Never client-writable. */
export interface SandboxStore {
  get(uid: string, sessionKey: string): Promise<SandboxRecord | null>;
  put(uid: string, sessionKey: string, record: SandboxRecord): Promise<void>;
  touch(uid: string, sessionKey: string, at: number): Promise<void>;
  delete(uid: string, sessionKey: string): Promise<void>;
  listForUser(uid: string): Promise<SandboxRecordRef[]>;
  /** Records not used since `before`, oldest first. */
  listIdle(before: number, limit: number): Promise<SandboxRecordRef[]>;
}

/** Output file reference; `base64` is omitted when deferred past the inline budget. */
export interface OutputFile {
  filename: string;
  path: string;
  size: number;
  base64?: string;
}

/**
 * Mirrors the web app's ExecutionResult (formerly PyodideExecutionResult) so the
 * Analyze tool/artifact pipeline is unchanged.
 */
export interface ExecutionResult {
  success: boolean;
  stdout: string;
  result?: string;
  images: string[];
  htmlOutputs: Array<{ filename: string; path: string; size: number; content?: string }>;
  dataOutputs: OutputFile[];
  error?: string;
  errorCode?: 'TIMEOUT';
  /** True when the sandbox had to be recreated, so prior Python state and files are gone. */
  environmentReset: boolean;
}
