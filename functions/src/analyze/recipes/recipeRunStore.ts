/**
 * Model re-run records: `users/{uid}/conversations/{sessionId}/recipeRuns/{runId}`,
 * written by the server only (the owner reads them). Kept out of analyzeRuns
 * so the step loop and the sweeper never pick one up.
 *
 * A record still 'running' holds the session: no turn starts and no other
 * recipe runs until it ends. One that crashed stops holding after
 * RECIPE_RUN_STALE_MS.
 */
import { getFirestore, type Transaction } from 'firebase-admin/firestore';
import type { RecipeParamValue } from '../contract/types/notebook';

/** A recipe gets more time than a cell: it's the whole model. */
export const RECIPE_RUN_TIMEOUT_MS = 5 * 60_000;
/** A record still 'running' after this is a crashed run and no longer holds the session. */
export const RECIPE_RUN_STALE_MS = RECIPE_RUN_TIMEOUT_MS + 2 * 60_000;

export type RecipeRunStatus = 'running' | 'completed' | 'error';

export interface RecipeRunDoc {
  runId: string;
  recipeArtifactId: string;
  recipeName: string;
  values: Record<string, RecipeParamValue>;
  status: RecipeRunStatus;
  startedAt: number;
  finishedAt?: number;
  /** The new versions this run saved (files whose bytes didn't change make none). */
  outputArtifactIds?: string[];
  /** What the recipe printed, for the Model panel. */
  stdout?: string;
  error?: string;
}

export function recipeRunsPath(uid: string, sessionId: string): string {
  return `users/${uid}/conversations/${sessionId}/recipeRuns`;
}

/** Whether a recipe run in progress holds the session (read inside a transaction). */
export async function activeRecipeRunIn(tx: Transaction, uid: string, sessionId: string, now: number): Promise<boolean> {
  const running = await tx.get(getFirestore().collection(recipeRunsPath(uid, sessionId)).where('status', '==', 'running'));
  return running.docs.some((doc) => now - (doc.data() as RecipeRunDoc).startedAt < RECIPE_RUN_STALE_MS);
}
