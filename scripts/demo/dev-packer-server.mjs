#!/usr/bin/env node
import http from 'node:http';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '../../');
const RECORDINGS_DIR = resolve(__dirname, './recordings');
const PACKER = resolve(__dirname, './packer.mjs');

function runPacker() {
  return new Promise((resolvePacker, reject) => {
    const proc = spawn(process.execPath, [PACKER], { stdio: 'inherit' });
    proc.on('close', (code) => {
      if (code === 0) resolvePacker();
      else reject(new Error(`packer exited with code ${code}`));
    });
  });
}

function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/append') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const session = payload.session;
        if (!session || !session.id) {
          return sendJson(res, 400, { ok: false, error: 'Missing session.id' });
        }
        if (!existsSync(RECORDINGS_DIR)) mkdirSync(RECORDINGS_DIR, { recursive: true });
        const filePath = resolve(RECORDINGS_DIR, `${session.id}.json`);
        writeFileSync(filePath, JSON.stringify(session, null, 2) + '\n');
        await runPacker();
        return sendJson(res, 200, { ok: true, file: filePath });
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: String(e?.message || e) });
      }
    });
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    return sendJson(res, 200, { ok: true, recordingsDir: RECORDINGS_DIR });
  }

  sendJson(res, 404, { ok: false, error: 'Not found' });
});

const port = process.env.PORT ? Number(process.env.PORT) : 8889;
server.listen(port, () => {
  console.log(`[demo-packer] Listening on http://localhost:${port}`);
});

