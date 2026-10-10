/**
 * A manual cell re-run (the cell's Run button). The browser ran the code
 * straight into the operator kernel (AnalyzeModeView.handleRunCellCode); this
 * runs it in the same sandbox and kernel as the session's operator runs, and
 * only while none is active, so a re-run can't interleave with a run's Python.
 *
 * Nothing is captured, as in the browser: the output shows on the cell and
 * isn't saved. Variables the code sets stay in the kernel for the next turn.
 */
import { getSandboxService } from '../../sandbox/callables';
import { ENVIRONMENT_RESET_NOTE } from './sandboxBridge';
import { SessionBusyError, findActiveOperatorRun, findLatestOperatorRun } from './turns';

/** handleRunCellCode's timeout. */
export const RUN_CELL_TIMEOUT_MS = 60_000;

/** What the cell renders (AnalyzeModeView cellOutputOverrides). */
export interface RunCellResult {
  success: boolean;
  stdout: string;
  images: string[];
  error?: string;
}

/** The session has no operator run yet, so there's no sandbox to run in. */
export class NoSessionSandboxError extends Error {
  constructor() {
    super('Send a message first: this session has no Python environment yet.');
  }
}

export async function runCell(uid: string, sessionId: string, code: string): Promise<RunCellResult> {
  if (await findActiveOperatorRun(uid, sessionId)) throw new SessionBusyError();
  const latest = await findLatestOperatorRun(uid, sessionId);
  if (!latest) throw new NoSessionSandboxError();
  const result = await getSandboxService().execute(uid, latest.config.sandboxSessionKey, code, RUN_CELL_TIMEOUT_MS);
  return {
    success: result.success,
    stdout: result.environmentReset ? `${ENVIRONMENT_RESET_NOTE}\n${result.stdout}` : result.stdout,
    images: result.images,
    ...(result.error ? { error: result.error } : {}),
  };
}
