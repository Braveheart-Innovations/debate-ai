/**
 * Phase 3 build-out: the engine is deployed dark. Only these accounts may use
 * it until the v2.6 cutover; DELETE this list (and its checks) at release.
 *  - mspencer@braveheartinnovations.com (Michael's web account)
 *  - the live-proxy test account (automated harness)
 *
 * The sandbox also uses it to dark-test a candidate template
 * (SANDBOX_TEMPLATE_CANDIDATE in src/sandbox/callables.ts).
 */
export const SERVER_LOOP_ALLOWED_UIDS = new Set([
  'NIxWoHSaoZbleBOUfnJVpocHTY22',
  'm8zEMeTFGUaZ0xXyuZ6Fu57rWa72',
]);
