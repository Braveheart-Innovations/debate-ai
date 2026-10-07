import { onCall, HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { E2BSandboxProvider } from './e2bProvider';
import { FirestoreSandboxStore } from './firestoreStore';
import {
  SandboxInputError,
  SandboxSessionService,
  assertKernelKey,
  assertSandboxPath,
  assertSessionKey,
  clampTimeout,
} from './service';

export const e2bApiKey = defineSecret('E2B_API_KEY');

/** Built from scripts/build-sandbox-template.mjs. */
export const SANDBOX_TEMPLATE = 'symposium-analyze';
const IDLE_TIMEOUT_MS = 15 * 60_000;
/** Sandboxes (and the uploaded files inside them) are deleted after this much inactivity. */
export const SANDBOX_RETENTION_MS = 7 * 24 * 60 * 60_000;

let service: SandboxSessionService | null = null;
/** Shared with executeTool, which writes fetch_api responses straight into the sandbox. */
export function getSandboxService(): SandboxSessionService {
  if (!service) {
    service = new SandboxSessionService({
      provider: new E2BSandboxProvider(e2bApiKey.value()),
      store: new FirestoreSandboxStore(),
      template: SANDBOX_TEMPLATE,
      idleTimeoutMs: IDLE_TIMEOUT_MS,
      now: () => Date.now(),
    });
  }
  return service;
}

function requireUid(request: CallableRequest<unknown>): string {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be authenticated to use the Python sandbox');
  return request.auth.uid;
}

async function guard<T>(label: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    if (error instanceof SandboxInputError) throw new HttpsError('invalid-argument', error.message);
    console.error(`[sandbox] ${label} failed`, error);
    throw new HttpsError('internal', error instanceof Error ? error.message : 'Sandbox operation failed');
  }
}

/** Account deletion: destroy every sandbox the user owns. Call before deleting users/{uid}. */
export async function destroyUserSandboxes(uid: string): Promise<number> {
  return getSandboxService().destroyAllForUser(uid);
}

export const sandboxRetentionSweep = onSchedule(
  { schedule: 'every day 03:30', timeZone: 'America/Chicago', timeoutSeconds: 540, secrets: [e2bApiKey] },
  async () => {
    const removed = await getSandboxService().sweepIdle(SANDBOX_RETENTION_MS);
    console.log(`[sandbox] retention sweep removed ${removed} idle sandbox(es)`);
  },
);

type Data = Record<string, unknown>;

function isUnchangedSpec(value: unknown): value is { size: number; sha256: string } {
  const spec = value as { size?: unknown; sha256?: unknown } | null;
  return Boolean(spec) && typeof spec!.size === 'number' && typeof spec!.sha256 === 'string';
}

export const sandboxExecute = onCall(
  { timeoutSeconds: 420, memory: '512MiB', concurrency: 40, secrets: [e2bApiKey] },
  async (request) => {
    const uid = requireUid(request);
    const data = (request.data ?? {}) as Data;
    return guard('execute', async () => {
      const sessionKey = assertSessionKey(data.sessionKey);
      if (typeof data.code !== 'string') throw new SandboxInputError('code is required');
      return getSandboxService().execute(uid, sessionKey, data.code, clampTimeout(data.timeoutMs), assertKernelKey(data.kernelKey));
    });
  },
);

export const sandboxFiles = onCall(
  { timeoutSeconds: 120, memory: '512MiB', concurrency: 40, secrets: [e2bApiKey] },
  async (request) => {
    const uid = requireUid(request);
    const data = (request.data ?? {}) as Data;
    return guard(`files:${String(data.op)}`, async () => {
      const sessionKey = assertSessionKey(data.sessionKey);
      const svc = getSandboxService();
      switch (data.op) {
        case 'write':
          if (typeof data.base64 !== 'string') throw new SandboxInputError('base64 is required');
          return svc.writeFile(uid, sessionKey, {
            path: assertSandboxPath(data.path),
            base64: data.base64,
            chunkIndex: data.chunkIndex as number | undefined,
            totalChunks: data.totalChunks as number | undefined,
            skipIfUnchanged: isUnchangedSpec(data.skipIfUnchanged) ? data.skipIfUnchanged : undefined,
          });
        case 'read':
          return svc.readFile(uid, sessionKey, {
            path: assertSandboxPath(data.path),
            offset: typeof data.offset === 'number' ? data.offset : 0,
          });
        case 'list':
          return { entries: await svc.listFiles(uid, sessionKey, assertSandboxPath(data.path)) };
        case 'delete':
          await svc.deleteFile(uid, sessionKey, assertSandboxPath(data.path));
          return { deleted: true };
        default:
          throw new SandboxInputError('Unknown op');
      }
    });
  },
);

export const sandboxSession = onCall(
  { timeoutSeconds: 120, memory: '256MiB', concurrency: 40, secrets: [e2bApiKey] },
  async (request) => {
    const uid = requireUid(request);
    const data = (request.data ?? {}) as Data;
    return guard(`session:${String(data.action)}`, async () => {
      const sessionKey = assertSessionKey(data.sessionKey);
      const svc = getSandboxService();
      switch (data.action) {
        case 'ensure': {
          const { environmentReset } = await svc.ensure(uid, sessionKey);
          return { ready: true, environmentReset };
        }
        case 'interrupt':
          return { interrupted: true, outcome: await svc.interrupt(uid, sessionKey, assertKernelKey(data.kernelKey)) };
        case 'releaseKernel':
          await svc.releaseKernel(uid, sessionKey, assertKernelKey(data.kernelKey));
          return { released: true };
        case 'reset':
          await svc.reset(uid, sessionKey);
          return { reset: true };
        default:
          throw new SandboxInputError('Unknown action');
      }
    });
  },
);
