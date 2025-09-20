#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '../../');
const PACK_PATH = resolve(ROOT, 'src/assets/demo/demo-pack.v1.json');

function loadPack() {
  const raw = readFileSync(PACK_PATH, 'utf8');
  return JSON.parse(raw);
}

function ensureCount(errors, routing, combo, min, label) {
  const list = routing?.[combo] || [];
  if ((list?.length ?? 0) < min) {
    errors.push(`${label} combo "${combo}" has ${list.length || 0} sample(s); expected at least ${min}.`);
  }
}

function validateMotionFormat(errors, warnings, debate) {
  const topic = debate.topic || '';
  const motionFormatted = /^\s*(Motion:|This\s+House)/i.test(topic);
  if (!motionFormatted) {
    warnings.push(`Debate ${debate.id} topic should be motion format (e.g., "Motion: …"): "${topic}".`);
  }
  const firstUserMessage = debate.events?.find(ev => ev.role === 'user' && ev.type === 'message');
  if (firstUserMessage) {
    if (!/^\s*Motion:/i.test(firstUserMessage.content || '')) {
      warnings.push(`Debate ${debate.id} first user message should begin with "Motion:"; found "${firstUserMessage.content?.slice(0, 40) ?? ''}…"`);
    }
  } else {
    warnings.push(`Debate ${debate.id} is missing a user motion message.`);
  }
}

function main() {
  const pack = loadPack();
  const errors = [];
  const warnings = [];

  const chatRouting = pack.routing?.chat || {};
  const compareRouting = pack.routing?.compare || {};
  const debateRouting = pack.routing?.debate || {};

  const singles = ['claude', 'openai', 'google'];
  singles.forEach(key => ensureCount(errors, chatRouting, key, 2, 'Chat'));

  const pairs = ['claude+openai', 'claude+google', 'openai+google'];
  pairs.forEach(key => {
    ensureCount(errors, chatRouting, key, 2, 'Chat');
    ensureCount(errors, compareRouting, key, 2, 'Compare');
    ensureCount(errors, debateRouting, `${key}:default`, 2, 'Debate');
  });

  ensureCount(errors, chatRouting, 'claude+openai+google', 1, 'Chat');

  for (const debate of pack.debates || []) {
    validateMotionFormat(errors, warnings, debate);
  }

  if (warnings.length) {
    console.warn('[demo:validate] WARNINGS');
    warnings.forEach(w => console.warn(` - ${w}`));
  }

  if (errors.length) {
    console.error('[demo:validate] FAIL');
    errors.forEach(e => console.error(` - ${e}`));
    process.exit(1);
  } else {
    console.log('[demo:validate] OK');
  }
}

main();
