/** The analyzeRunStep task queue (its own module so the stores can enqueue without importing the step). */
import { getFunctions } from 'firebase-admin/functions';

export const STEP_FUNCTION = 'analyzeRunStep';

export interface StepPayload {
  uid: string;
  sessionId: string;
  runId: string;
}

export async function enqueueStep(payload: StepPayload): Promise<void> {
  await getFunctions()
    .taskQueue(`locations/us-central1/functions/${STEP_FUNCTION}`)
    .enqueue(payload, { dispatchDeadlineSeconds: 1800 });
}
