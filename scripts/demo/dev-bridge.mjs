#!/usr/bin/env node

import http from 'node:http';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ROOT = resolve(__dirname, '..', '..');
const RECORDINGS_DIR = resolve(__dirname, 'recordings');
const BUILD_SCRIPT = resolve(__dirname, 'build-recordings-manifest.js');
const PORT = Number(process.env.DEMO_BRIDGE_PORT || 8889);

if (!existsSync(RECORDINGS_DIR)) {
  mkdirSync(RECORDINGS_DIR, { recursive: true });
}

function writeRecordingFile(session) {
  const id = session?.id;
  if (!id || typeof id !== 'string') {
    throw new Error('Recording session is missing an id');
  }
  const safeId = id.replace(/[^a-zA-Z0-9_\-]/g, '_');
  const filePath = resolve(RECORDINGS_DIR, `${safeId}.json`);
  writeFileSync(filePath, JSON.stringify(session, null, 2));
  return filePath;
}

function rebuildManifest() {
  const result = spawnSync('node', [BUILD_SCRIPT], { cwd: ROOT, stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error('Failed to rebuild demo recordings manifest');
  }
}

function readBody(req) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolveBody(raw);
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === 'POST' && req.url === '/append') {
    try {
      const raw = await readBody(req);
      const payload = JSON.parse(raw || '{}');
      const session = payload?.session;
      if (!session) {
        throw new Error('Missing session payload');
      }

      const filePath = writeRecordingFile(session);
      console.log(`[demo-bridge] wrote ${filePath}`);

      rebuildManifest();
      console.log('[demo-bridge] manifest rebuilt');

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (error) {
      console.error('[demo-bridge] append failed', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`[demo-bridge] listening on http://127.0.0.1:${PORT}`);
  console.log('[demo-bridge] Waiting for recordings… (use "Append to Pack (dev)" in the app)');
});
