#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ROOT = resolve(__dirname, '../../');
const RECORDINGS_DIR = resolve(__dirname, './recordings');
const PACK_PATH = resolve(ROOT, 'src/assets/demo/demo-pack.v1.json');

function loadJSON(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
function saveJSON(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
}

function ensureRouting(pack) {
  if (!pack.routing) pack.routing = {};
  if (!pack.routing.chat) pack.routing.chat = {};
  if (!pack.routing.debate) pack.routing.debate = {};
  if (!pack.routing.compare) pack.routing.compare = {};
}

function appendRecording(pack, rec) {
  ensureRouting(pack);
  if (rec.type === 'chat') {
    const exists = pack.chats.some(c => c.id === rec.id);
    if (!exists) pack.chats.push({ id: rec.id, title: rec.title, events: rec.events, tags: rec.tags || [] });
    const key = rec.comboKey;
    pack.routing.chat[key] = pack.routing.chat[key] || [];
    if (!pack.routing.chat[key].includes(rec.id)) pack.routing.chat[key].push(rec.id);
  } else if (rec.type === 'debate') {
    const exists = pack.debates.some(d => d.id === rec.id);
    if (!exists) pack.debates.push({ id: rec.id, topic: rec.topic, participants: rec.participants || [], events: rec.events });
    const key = rec.comboKey; // e.g., "claude+openai:George"
    pack.routing.debate[key] = pack.routing.debate[key] || [];
    if (!pack.routing.debate[key].includes(rec.id)) pack.routing.debate[key].push(rec.id);
  } else if (rec.type === 'compare') {
    const exists = pack.compares.some(c => c.id === rec.id);
    if (!exists) pack.compares.push({ id: rec.id, title: rec.title, category: rec.category || 'provider', runs: rec.runs });
    const key = rec.comboKey;
    pack.routing.compare[key] = pack.routing.compare[key] || [];
    if (!pack.routing.compare[key].includes(rec.id)) pack.routing.compare[key].push(rec.id);
  }
}

function main() {
  if (!existsSync(RECORDINGS_DIR)) {
    console.error('No recordings directory found:', RECORDINGS_DIR);
    process.exit(1);
  }
  const pack = loadJSON(PACK_PATH);
  const files = readdirSync(RECORDINGS_DIR).filter(f => f.endsWith('.json'));
  for (const f of files) {
    const rec = loadJSON(resolve(RECORDINGS_DIR, f));
    appendRecording(pack, rec);
  }
  // Update meta timestamp
  pack.meta = pack.meta || {};
  pack.meta.createdAt = new Date().toISOString();
  saveJSON(PACK_PATH, pack);
  console.log(`Updated demo pack with ${files.length} recording(s).`);
}

main();

