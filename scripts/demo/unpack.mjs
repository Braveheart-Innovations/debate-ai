#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '../../');
const PACK_PATH = resolve(ROOT, 'src/assets/demo/demo-pack.v1.json');
const RECORDINGS_DIR = resolve(__dirname, './recordings');

function loadPack() {
  const raw = readFileSync(PACK_PATH, 'utf8');
  return JSON.parse(raw);
}

function buildRoutingIndex(routingSection = {}) {
  const index = new Map();
  for (const [combo, ids] of Object.entries(routingSection)) {
    for (const id of ids || []) {
      if (!index.has(id)) index.set(id, []);
      index.get(id).push(combo);
    }
  }
  return index;
}

function primaryCombo(list) {
  if (!list || list.length === 0) return undefined;
  return list.slice().sort()[0];
}

function writeRecording(filename, data) {
  const path = resolve(RECORDINGS_DIR, `${filename}.json`);
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function main() {
  if (!existsSync(RECORDINGS_DIR)) {
    mkdirSync(RECORDINGS_DIR, { recursive: true });
  }

  for (const entry of readdirSync(RECORDINGS_DIR, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.json')) {
      rmSync(resolve(RECORDINGS_DIR, entry.name));
    }
  }

  const pack = loadPack();
  const chatIndex = buildRoutingIndex(pack.routing?.chat);
  const debateIndex = buildRoutingIndex(pack.routing?.debate);
  const compareIndex = buildRoutingIndex(pack.routing?.compare);

  for (const chat of pack.chats || []) {
    const comboKey = primaryCombo(chatIndex.get(chat.id));
    const payload = {
      type: 'chat',
      id: chat.id,
      title: chat.title,
      comboKey,
      tags: chat.tags ?? [],
      events: chat.events ?? [],
    };
    writeRecording(chat.id, payload);
  }

  for (const debate of pack.debates || []) {
    const comboKey = primaryCombo(debateIndex.get(debate.id));
    const payload = {
      type: 'debate',
      id: debate.id,
      title: debate.topic,
      topic: debate.topic,
      comboKey,
      participants: debate.participants ?? [],
      events: debate.events ?? [],
    };
    writeRecording(debate.id, payload);
  }

  for (const compare of pack.compares || []) {
    const comboKey = primaryCombo(compareIndex.get(compare.id));
    const payload = {
      type: 'compare',
      id: compare.id,
      title: compare.title,
      comboKey,
      category: compare.category ?? 'provider',
      runs: compare.runs ?? [],
    };
    writeRecording(compare.id, payload);
  }

  console.log(`[demo:unpack] Wrote ${
    (pack.chats?.length || 0) +
    (pack.debates?.length || 0) +
    (pack.compares?.length || 0)
  } recordings to ${RECORDINGS_DIR}`);
}

main();
