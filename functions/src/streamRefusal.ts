import { HttpsError } from 'firebase-functions/v2/https';

/** What a missing or expired sign-in reads as; the web client renews the sign-in and asks once more first. */
export const SIGN_IN_AGAIN = 'Your sign-in has expired. Sign in again to continue.';

/**
 * The error event for a request a streaming handler refused (an HttpsError it
 * threw: no sign-in or an expired one, a bad argument), with the refusal's own
 * code, so the client can tell a sign-in to renew from a model's failure. Every
 * such refusal used to reach the user as "<model> encountered an error" with
 * code internal. Undefined for anything else.
 */
export function refusalOf(error: unknown): { message: string; code: string } | undefined {
  if (!(error instanceof HttpsError)) return undefined;
  return { message: error.code === 'unauthenticated' ? SIGN_IN_AGAIN : error.message, code: error.code };
}
