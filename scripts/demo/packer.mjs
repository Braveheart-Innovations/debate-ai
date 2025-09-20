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
  const raw = readFileSync(path, 'utf8');
  return JSON.parse(raw);
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
  const isDraft = typeof rec.id === 'string' && /_rec_/i.test(rec.id);

  const removeFromRouting = (zone, key, id) => {
    if (!key) return;
    const routing = pack.routing[zone];
    if (!routing || !routing[key]) return;
    routing[key] = routing[key].filter(existing => existing !== id);
  };

  if (rec.type === 'chat') {
    const entry = { id: rec.id, title: rec.title, events: rec.events, tags: rec.tags || [] };
    const idx = pack.chats.findIndex(c => c.id === rec.id);
    if (idx >= 0) pack.chats[idx] = entry;
    else pack.chats.push(entry);
    const key = rec.comboKey;
    if (isDraft) removeFromRouting('chat', key, rec.id);
    else if (key) {
      pack.routing.chat[key] = pack.routing.chat[key] || [];
      if (!pack.routing.chat[key].includes(rec.id)) pack.routing.chat[key].push(rec.id);
    }
  } else if (rec.type === 'debate') {
    const entry = { id: rec.id, topic: rec.topic, participants: rec.participants || [], events: rec.events };
    const idx = pack.debates.findIndex(d => d.id === rec.id);
    if (idx >= 0) pack.debates[idx] = entry;
    else pack.debates.push(entry);
    const key = rec.comboKey; // e.g., "claude+openai:George"
    if (isDraft) removeFromRouting('debate', key, rec.id);
    else if (key) {
      pack.routing.debate[key] = pack.routing.debate[key] || [];
      if (!pack.routing.debate[key].includes(rec.id)) pack.routing.debate[key].push(rec.id);
    }
  } else if (rec.type === 'compare') {
    const entry = { id: rec.id, title: rec.title, category: rec.category || 'provider', runs: rec.runs };
    const idx = pack.compares.findIndex(c => c.id === rec.id);
    if (idx >= 0) pack.compares[idx] = entry;
    else pack.compares.push(entry);
    const key = rec.comboKey;
    if (isDraft) removeFromRouting('compare', key, rec.id);
    else if (key) {
      pack.routing.compare[key] = pack.routing.compare[key] || [];
      if (!pack.routing.compare[key].includes(rec.id)) pack.routing.compare[key].push(rec.id);
    }
  }
}

function main() {
  if (!existsSync(RECORDINGS_DIR)) {
    console.error('No recordings directory found:', RECORDINGS_DIR);
    process.exit(1);
  }
  let pack;
  try {
    pack = loadJSON(PACK_PATH);
  } catch (e) {
    console.error('[packer] Failed to parse pack JSON at', PACK_PATH);
    console.error(String(e?.message || e));
    process.exit(1);
  }
  const files = readdirSync(RECORDINGS_DIR).filter(f => f.endsWith('.json'));
  for (const f of files) {
    const full = resolve(RECORDINGS_DIR, f);
    try {
      const rec = loadJSON(full);
      appendRecording(pack, rec);
    } catch (e) {
      console.error('[packer] Skipping invalid JSON:', full);
      console.error(String(e?.message || e));
    }
  }
  // Update meta timestamp
  pack.meta = pack.meta || {};
  pack.meta.createdAt = new Date().toISOString();
  saveJSON(PACK_PATH, pack);
  console.log(`Updated demo pack with ${files.length} recording(s).`);
}

main();
