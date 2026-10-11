#!/usr/bin/env node
// Compile firestore.rules and evaluate allow/deny cases with the Firebase
// Rules API test endpoint: nothing is deployed, no emulator (or Java 21)
// needed. Needs ADC: gcloud auth login --update-adc.
//   node functions/scripts/check-firestore-rules.mjs   (run from the repo root or functions/)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applicationDefault, initializeApp } from 'firebase-admin/app';

initializeApp({ credential: applicationDefault(), projectId: 'symposium-ai' });
const rulesPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../firestore.rules');
const token = (await applicationDefault().getAccessToken()).access_token;

const base = '/databases/(default)/documents/users/owner1/conversations/s1';
const tc = (method, sub, uid, expectation) => ({
  request: { method, path: base + sub, auth: uid ? { uid } : null, time: new Date().toISOString() },
  expectation,
});
const notificationPath = '/databases/(default)/documents/users/owner1/notifications/n1';
const notification = { id: 'n1', kind: 'completed', mode: 'analyze', sessionId: 's1', runId: 'r1', createdAt: 1, read: false };
/** A notification case; update cases carry the stored doc and the write's result. */
const nc = (method, uid, expectation, data) => ({
  request: {
    method,
    path: notificationPath,
    auth: uid ? { uid } : null,
    time: new Date().toISOString(),
    ...(data ? { resource: { data } } : {}),
  },
  ...(method === 'update' || method === 'get' || method === 'delete' ? { resource: { data: notification } } : {}),
  expectation,
});
const testCases = [
  // Analyze server-loop runs: owner reads, nobody writes from a client.
  tc('get', '/analyzeRuns/r1', 'owner1', 'ALLOW'),
  tc('list', '/analyzeRuns/r1', 'owner1', 'ALLOW'),
  tc('get', '/analyzeRuns/r1', 'intruder', 'DENY'),
  tc('get', '/analyzeRuns/r1', null, 'DENY'),
  tc('create', '/analyzeRuns/r1', 'owner1', 'DENY'),
  tc('update', '/analyzeRuns/r1', 'owner1', 'DENY'),
  tc('delete', '/analyzeRuns/r1', 'owner1', 'DENY'),
  tc('get', '/analyzeRuns/r1/runEvents/000001', 'owner1', 'ALLOW'),
  tc('get', '/analyzeRuns/r1/runEvents/000001', 'intruder', 'DENY'),
  tc('create', '/analyzeRuns/r1/runEvents/000001', 'owner1', 'DENY'),
  tc('get', '/analyzeRuns/r1/toolCalls/c1', 'owner1', 'DENY'),
  tc('create', '/analyzeRuns/r1/toolCalls/c1', 'owner1', 'DENY'),
  // Run notifications: owner reads, may only flip `read`, and may delete; only the server creates.
  nc('get', 'owner1', 'ALLOW'),
  nc('list', 'owner1', 'ALLOW'),
  nc('get', 'intruder', 'DENY'),
  nc('get', null, 'DENY'),
  nc('create', 'owner1', 'DENY', { ...notification }),
  nc('delete', 'owner1', 'ALLOW'),
  nc('delete', 'intruder', 'DENY'),
  nc('delete', null, 'DENY'),
  nc('update', 'owner1', 'ALLOW', { ...notification, read: true }),
  nc('update', 'intruder', 'DENY', { ...notification, read: true }),
  nc('update', 'owner1', 'DENY', { ...notification, read: true, kind: 'error' }),
  nc('update', 'owner1', 'DENY', { ...notification, read: 'yes' }),
  // Existing conversation access is unchanged.
  tc('get', '/messages/m1', 'owner1', 'ALLOW'),
  tc('create', '/messages/m1', 'owner1', 'ALLOW'),
  tc('get', '/messages/m1', 'intruder', 'DENY'),
];

const response = await fetch('https://firebaserules.googleapis.com/v1/projects/symposium-ai:test', {
  method: 'POST',
  headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'x-goog-user-project': 'symposium-ai' },
  body: JSON.stringify({
    source: { files: [{ name: 'firestore.rules', content: fs.readFileSync(rulesPath, 'utf8') }] },
    testSuite: { testCases },
  }),
});
const result = await response.json();
if (!response.ok) {
  console.error(response.status, JSON.stringify(result).slice(0, 500));
  process.exit(1);
}
if (result.issues?.length) {
  console.error('Compile issues:', JSON.stringify(result.issues, null, 2));
  process.exit(1);
}
let failed = 0;
result.testResults.forEach((res, i) => {
  const c = testCases[i];
  if (res.state !== 'SUCCESS') failed += 1;
  console.log(`${res.state.padEnd(8)} ${c.request.method.padEnd(6)} expect ${c.expectation.padEnd(5)} ${(c.request.auth?.uid ?? 'anon').padEnd(9)} ${c.request.path.replace(base, '').replace('/databases/(default)/documents/users/owner1', '~')}`);
});
console.log(failed ? `${failed} case(s) failed` : `All ${testCases.length} cases passed.`);
process.exit(failed ? 1 : 0);
