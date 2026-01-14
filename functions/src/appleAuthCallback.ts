import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as querystring from 'querystring';
import axios from 'axios';
import { SignJWT, importPKCS8 } from 'jose';

// Define secrets for v2 functions
const appleTeamIdSecret = defineSecret('APPLE_TEAM_ID');
const appleKeyIdSecret = defineSecret('APPLE_KEY_ID');
const appleServiceIdSecret = defineSecret('APPLE_SERVICE_ID');
const applePrivateKeySecret = defineSecret('APPLE_PRIVATE_KEY');
const appleRedirectUriSecret = defineSecret('APPLE_REDIRECT_URI');

/**
 * Apple Sign In Callback Handler
 *
 * Apple uses response_mode=form_post when scopes (name, email) are requested.
 * This means Apple POSTs the authorization response to the redirect URI.
 * Since the web app is statically hosted, we need this Cloud Function to:
 * 1. Receive the POST from Apple with the authorization code
 * 2. Exchange the code for tokens (including id_token)
 * 3. Redirect to the web app callback page with the id_token in query params
 */
export const appleAuthCallback = onRequest(
  { secrets: [appleTeamIdSecret, appleKeyIdSecret, appleServiceIdSecret, applePrivateKeySecret, appleRedirectUriSecret] },
  async (req, res) => {
    // Set CORS headers
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    // Parse request body
    const rawBody = req.rawBody ? req.rawBody.toString('utf8') : '';
    const parsedRawBody = rawBody ? querystring.parse(rawBody) : {};
    const body = Object.keys(req.body || {}).length > 0 ? req.body : parsedRawBody;

    const firstString = (value: unknown): string | null => {
      if (!value) return null;
      if (Array.isArray(value)) return value[0] ?? null;
      return String(value);
    };

    // Extract parameters from POST body (form_post mode)
    const code = firstString((body as Record<string, unknown>)?.code) || null;
    const state = firstString((body as Record<string, unknown>)?.state) || null;
    const user = (body as Record<string, unknown>)?.user ?? null;
    const error = firstString((body as Record<string, unknown>)?.error) || null;
    const errorDescription = firstString((body as Record<string, unknown>)?.error_description) || null;

    // If Apple returned an error, redirect with the error
    if (error) {
      const redirectBase = 'https://symposiumai.app/auth/apple/callback/';
      const params = new URLSearchParams();
      params.set('error', error);
      if (errorDescription) params.set('error_description', errorDescription);
      if (state) params.set('state', state);
      res.redirect(303, `${redirectBase}?${params.toString()}`);
      return;
    }

    // If no code, we can't proceed
    if (!code) {
      const redirectBase = 'https://symposiumai.app/auth/apple/callback/';
      const params = new URLSearchParams();
      params.set('error', 'no_code');
      params.set('error_description', 'No authorization code received from Apple');
      res.redirect(303, `${redirectBase}?${params.toString()}`);
      return;
    }

    // Get Apple credentials from secrets (trim to remove any trailing newlines)
    const appleTeamId = (process.env.APPLE_TEAM_ID || '').trim();
    const appleKeyId = (process.env.APPLE_KEY_ID || '').trim();
    const appleServiceId = (process.env.APPLE_SERVICE_ID || '').trim();
    const applePrivateKey = (process.env.APPLE_PRIVATE_KEY || '').trim();
    const redirectUri = (process.env.APPLE_REDIRECT_URI || 'https://us-central1-symposium-ai.cloudfunctions.net/appleAuthCallback').trim();

    // Exchange the authorization code for tokens
    try {
      const now = Math.floor(Date.now() / 1000);

      // Create client_secret JWT
      const clientSecret = await new SignJWT({})
        .setProtectedHeader({ alg: 'ES256', kid: appleKeyId })
        .setIssuer(appleTeamId)
        .setIssuedAt(now)
        .setExpirationTime(now + 5 * 60)
        .setAudience('https://appleid.apple.com')
        .setSubject(appleServiceId)
        .sign(await importPKCS8(applePrivateKey, 'ES256'));

      // Make token exchange request to Apple
      const tokenParams = new URLSearchParams();
      tokenParams.set('client_id', appleServiceId);
      tokenParams.set('client_secret', clientSecret);
      tokenParams.set('code', code);
      tokenParams.set('grant_type', 'authorization_code');
      tokenParams.set('redirect_uri', redirectUri);

      const tokenResponse = await axios.post('https://appleid.apple.com/auth/token', tokenParams.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        validateStatus: () => true,
      });

      if (tokenResponse.status >= 200 && tokenResponse.status < 300) {
        // Success - redirect with id_token
        const data = tokenResponse.data as { id_token?: string };
        const idToken = data.id_token;

        if (!idToken) {
          throw new Error('No id_token in Apple response');
        }

        const redirectBase = 'https://symposiumai.app/auth/apple/callback/';
        const params = new URLSearchParams();
        params.set('id_token', idToken);
        if (state) params.set('state', state);
        if (user) params.set('user', typeof user === 'string' ? user : JSON.stringify(user));
        res.redirect(303, `${redirectBase}?${params.toString()}`);
      } else {
        // Token exchange failed
        const data = tokenResponse.data as Record<string, unknown> | undefined;
        const exchangeError = typeof data?.error === 'string' ? data.error : 'token_exchange_failed';

        const redirectBase = 'https://symposiumai.app/auth/apple/callback/';
        const params = new URLSearchParams();
        params.set('error', exchangeError);
        if (state) params.set('state', state);
        res.redirect(303, `${redirectBase}?${params.toString()}`);
      }
    } catch (err) {
      console.error('[appleAuthCallback] Token exchange error:', err);

      const redirectBase = 'https://symposiumai.app/auth/apple/callback/';
      const params = new URLSearchParams();
      params.set('error', 'token_exchange_exception');
      params.set('error_description', err instanceof Error ? err.message : 'Unknown error');
      if (state) params.set('state', state);
      res.redirect(303, `${redirectBase}?${params.toString()}`);
    }
  }
);
