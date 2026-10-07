const assert = require('node:assert/strict');
const test = require('node:test');

const {
  SandboxSessionService,
  SandboxInputError,
  assertSessionKey,
  assertSandboxPath,
  clampTimeout,
  shellQuote,
  INLINE_OUTPUT_BUDGET_BYTES,
} = require('../lib/sandbox/service');
const {
  POST_MARKER, parsePostScan, filterStderr, stripAnsi, formatTraceback, preCode, postCode, kernelPidFile, outputScope,
} = require('../lib/sandbox/runtime');
const { assertKernelKey } = require('../lib/sandbox/service');

const isPre = (code) => code.startsWith('try:\n    _sym_pre\nexcept NameError:');

function memoryStore() {
  const docs = new Map();
  const key = (uid, sessionKey) => `${uid}/${sessionKey}`;
  return {
    docs,
    async get(uid, sessionKey) { return docs.get(key(uid, sessionKey)) ?? null; },
    async put(uid, sessionKey, record) { docs.set(key(uid, sessionKey), { ...record }); },
    async touch(uid, sessionKey, at) { docs.get(key(uid, sessionKey)).lastUsedAt = at; },
    async delete(uid, sessionKey) { docs.delete(key(uid, sessionKey)); },
    async listForUser(uid) {
      return [...docs.entries()].filter(([k]) => k.startsWith(`${uid}/`))
        .map(([k, record]) => ({ uid, sessionKey: k.slice(uid.length + 1), record }));
    },
    async listIdle(before) {
      return [...docs.entries()].filter(([, r]) => r.lastUsedAt < before)
        .map(([k, record]) => ({ uid: k.split('/')[0], sessionKey: k.split('/')[1], record }));
    },
  };
}

function fakeProvider(overrides = {}) {
  const calls = [];
  let nextId = 1;
  const alive = new Set();
  const files = new Map();
  const base = {
    name: 'fake',
    calls,
    alive,
    files,
    async create() { const id = `sbx-${nextId++}`; alive.add(id); calls.push(['create', id]); return id; },
    async connect(id) { calls.push(['connect', id]); return alive.has(id); },
    async destroy(id) { alive.delete(id); calls.push(['destroy', id]); },
    async runCode(id, code, timeoutMs, kernelKey) {
      calls.push(['runCode', isPre(code) ? 'PRE' : code.startsWith('_sym_post') ? code : 'USER', kernelKey]);
      if (code.startsWith('_sym_post')) {
        return { stdout: `${POST_MARKER}{"images":[],"html":[],"data":[]}\n`, stderr: '', pngs: [], timedOut: false };
      }
      return { stdout: '', stderr: '', pngs: [], timedOut: false };
    },
    async interruptKernel(id, kernelKey) { calls.push(['interrupt', id, kernelKey]); },
    async restartKernel(id, kernelKey) { calls.push(['restart', id, kernelKey]); },
    async releaseKernel(id, kernelKey) { calls.push(['release', id, kernelKey]); },
    async runCommand(id, command) { calls.push(['command', command]); return { stdout: '', exitCode: 0 }; },
    async writeFile(id, path, data) { files.set(path, data); calls.push(['write', path]); },
    async readFile(id, path) { return files.get(path) ?? new Uint8Array(); },
    async listDir() { return []; },
    async stat(id, path) {
      const data = files.get(path);
      return data ? { name: path.split('/').pop(), path, size: data.byteLength, isDirectory: false } : null;
    },
    async remove(id, path) { files.delete(path); },
  };
  return Object.assign(base, overrides);
}

function service(provider, store = memoryStore()) {
  let t = 1000;
  return {
    store,
    svc: new SandboxSessionService({ provider, store, template: 'tpl', idleTimeoutMs: 1, now: () => t++, sleep: async () => {} }),
  };
}

test('ensure creates once per (uid, session) and reconnects afterwards', async () => {
  const provider = fakeProvider();
  const { svc, store } = service(provider);
  const first = await svc.ensure('u1', 'analyze_1');
  const second = await svc.ensure('u1', 'analyze_1');
  assert.equal(first.sandboxId, second.sandboxId);
  assert.equal(first.environmentReset, false);
  assert.equal(second.environmentReset, false);
  assert.equal(provider.calls.filter(([c]) => c === 'create').length, 1);
  assert.equal(store.docs.get('u1/analyze_1').provider, 'fake');
});

test('sandboxes are never shared across users with the same session key', async () => {
  const { svc } = service(fakeProvider());
  const a = await svc.ensure('u1', 'analyze_1');
  const b = await svc.ensure('u2', 'analyze_1');
  assert.notEqual(a.sandboxId, b.sandboxId);
});

test('a vanished sandbox is recreated and reported as an environment reset', async () => {
  const provider = fakeProvider();
  const { svc } = service(provider);
  const first = await svc.ensure('u1', 's');
  provider.alive.delete(first.sandboxId);
  const second = await svc.ensure('u1', 's');
  assert.notEqual(first.sandboxId, second.sandboxId);
  assert.equal(second.environmentReset, true);
});

test('execute runs pre, user code, then post with visuals', async () => {
  const provider = fakeProvider();
  const { svc } = service(provider);
  const result = await svc.execute('u1', 's', 'print(1)', 5000);
  assert.deepEqual(
    provider.calls.filter(([c]) => c === 'runCode').map(([, v]) => v),
    ['PRE', 'USER', "_sym_post(True, '/output', True)"],
  );
  assert.equal(result.success, true);
  assert.equal(result.result, 'Done');
});

test('execute maps stdout, filtered stderr, last-expression text, images and outputs', async () => {
  const html = new TextEncoder().encode('<html>chart</html>');
  const csv = new TextEncoder().encode('a,b\n1,2\n');
  const provider = fakeProvider({
    async runCode(id, code) {
      if (isPre(code)) return { stdout: '', stderr: '', pngs: [], timedOut: false };
      if (code.startsWith('_sym_post')) {
        return {
          stdout: `noise\n${POST_MARKER}${JSON.stringify({
            images: ['FIG'],
            html: [{ filename: 'chart.html', path: '/output/chart.html', size: html.byteLength }],
            data: [{ filename: 'out/t.csv', path: '/output/out/t.csv', size: csv.byteLength }],
          })}\n`,
          stderr: '',
          pngs: [],
          timedOut: false,
        };
      }
      return {
        stdout: 'hello\n',
        stderr: 'real warning\n/tmp/x.py:3: UserWarning: FigureCanvasAgg is non-interactive, and thus cannot be shown\n',
        text: '42',
        pngs: ['DISPLAYED'],
        timedOut: false,
      };
    },
  });
  provider.files.set('/output/chart.html', html);
  provider.files.set('/output/out/t.csv', csv);
  const { svc } = service(provider);
  const result = await svc.execute('u1', 's', 'x', 5000);
  assert.equal(result.stdout, 'hello\n[stderr] real warning\n42');
  assert.deepEqual(result.images, ['FIG', 'DISPLAYED']);
  assert.equal(result.htmlOutputs[0].content, '<html>chart</html>');
  assert.equal(Buffer.from(result.dataOutputs[0].base64, 'base64').toString(), 'a,b\n1,2\n');
});

test('a Python error returns the traceback, keeps data outputs, drops visuals', async () => {
  const provider = fakeProvider({
    async runCode(id, code) {
      if (isPre(code)) return { stdout: '', stderr: '', pngs: [], timedOut: false };
      if (code.startsWith('_sym_post')) {
        assert.equal(code, "_sym_post(False, '/output', True)");
        return { stdout: `${POST_MARKER}{"images":[],"html":[],"data":[]}`, stderr: '', pngs: [], timedOut: false };
      }
      return {
        stdout: 'partial\n', stderr: '', pngs: ['X'], timedOut: false,
        error: { name: 'NameError', value: "name 'y' is not defined", traceback: "\u001b[31mNameError\u001b[0m: name 'y' is not defined" },
      };
    },
  });
  const { svc } = service(provider);
  const result = await svc.execute('u1', 's', 'y', 5000);
  assert.equal(result.success, false);
  assert.equal(result.error, "NameError: name 'y' is not defined");
  assert.equal(result.stdout, 'partial');
  assert.deepEqual(result.images, []);
});

test('a timeout interrupts the kernel and keeps variables when SIGINT works', async () => {
  const provider = fakeProvider({
    async runCode(id, code) {
      if (isPre(code) || code === '1') return { stdout: '', stderr: '', pngs: [], timedOut: false };
      return { stdout: '', stderr: '', pngs: [], timedOut: true };
    },
  });
  const { svc } = service(provider);
  const result = await svc.execute('u1', 's', 'while True: pass', 3000);
  assert.equal(result.errorCode, 'TIMEOUT');
  assert.match(result.error, /timed out after 3s and was stopped\. Variables and files are kept\./);
  assert.ok(provider.calls.some(([c]) => c === 'interrupt'));
  assert.ok(!provider.calls.some(([c]) => c === 'restart'));
});

test('a timeout falls back to restart and waits until the new kernel answers twice', async () => {
  let restarted = false;
  let probesAfterRestart = 0;
  const provider = fakeProvider({
    async runCode(id, code) {
      if (isPre(code)) return { stdout: '', stderr: '', pngs: [], timedOut: false };
      if (code === '1') {
        if (!restarted) return { stdout: '', stderr: '', pngs: [], timedOut: true };
        probesAfterRestart += 1;
        // The dying kernel drops the first connection after a restart.
        if (probesAfterRestart === 1) throw new TypeError('terminated');
        return { stdout: '', stderr: '', pngs: [], timedOut: false };
      }
      return { stdout: '', stderr: '', pngs: [], timedOut: true };
    },
    async restartKernel() { restarted = true; },
  });
  const { svc } = service(provider);
  const result = await svc.execute('u1', 's', 'while True: pass', 3000);
  assert.match(result.error, /restarted, so variables were cleared/);
  assert.equal(probesAfterRestart, 3);
});

test('outputs past the inline budget are deferred, not dropped', async () => {
  const big = new Uint8Array(INLINE_OUTPUT_BUDGET_BYTES + 1);
  const provider = fakeProvider({
    async runCode(id, code) {
      if (code.startsWith('_sym_post')) {
        return {
          stdout: `${POST_MARKER}${JSON.stringify({ images: [], html: [], data: [
            { filename: 'big.parquet', path: '/output/big.parquet', size: big.byteLength },
          ] })}`,
          stderr: '', pngs: [], timedOut: false,
        };
      }
      return { stdout: '', stderr: '', pngs: [], timedOut: false };
    },
  });
  provider.files.set('/output/big.parquet', big);
  const { svc } = service(provider);
  const result = await svc.execute('u1', 's', 'x', 5000);
  assert.equal(result.dataOutputs.length, 1);
  assert.equal(result.dataOutputs[0].base64, undefined);
  assert.equal(result.dataOutputs[0].size, big.byteLength);
});

test('writeFile skips unchanged re-mounts and assembles chunked uploads', async () => {
  const provider = fakeProvider();
  const { svc } = service(provider);
  const abcHash = require('node:crypto').createHash('sha256').update('abc').digest('hex');
  provider.runCommand = async (id, command) => {
    provider.calls.push(['command', command]);
    return command.startsWith('sha256sum') ? { stdout: `${abcHash}  /uploads/a.csv\n`, exitCode: 0 } : { stdout: '', exitCode: 0 };
  };
  await svc.writeFile('u1', 's', { path: '/uploads/a.csv', base64: Buffer.from('abc').toString('base64') });
  const skipped = await svc.writeFile('u1', 's', {
    path: '/uploads/a.csv', base64: 'ignored', skipIfUnchanged: { size: 3, sha256: abcHash },
  });
  assert.equal(skipped.written, false);
  // Same size, different content must be written.
  const edited = await svc.writeFile('u1', 's', {
    path: '/uploads/a.csv', base64: Buffer.from('xyz').toString('base64'),
    skipIfUnchanged: { size: 3, sha256: 'f'.repeat(64) },
  });
  assert.equal(edited.written, true);

  await svc.writeFile('u1', 's', { path: "/uploads/it's.bin", base64: 'AA==', chunkIndex: 0, totalChunks: 2 });
  await svc.writeFile('u1', 's', { path: "/uploads/it's.bin", base64: 'AQ==', chunkIndex: 1, totalChunks: 2 });
  const command = provider.calls.filter(([c]) => c === 'command').at(-1)[1];
  assert.match(command, /^cat '\/uploads\/it'\\''s\.bin\.__symposium_part_0' /);
  assert.match(command, /> '\/uploads\/it'\\''s\.bin' && rm -f /);

  await assert.rejects(
    svc.writeFile('u1', 's', { path: '/uploads/x', base64: '', chunkIndex: 2, totalChunks: 2 }),
    SandboxInputError,
  );
});

test('reset destroys the sandbox and forgets the mapping', async () => {
  const provider = fakeProvider();
  const { svc, store } = service(provider);
  const { sandboxId } = await svc.ensure('u1', 's');
  await svc.reset('u1', 's');
  assert.equal(provider.alive.has(sandboxId), false);
  assert.equal(store.docs.size, 0);
});

test('account deletion destroys only that user\'s sandboxes', async () => {
  const provider = fakeProvider();
  const { svc, store } = service(provider);
  const a = await svc.ensure('u1', 's1');
  const b = await svc.ensure('u1', 's2');
  const c = await svc.ensure('u2', 's1');
  assert.equal(await svc.destroyAllForUser('u1'), 2);
  assert.equal(provider.alive.has(a.sandboxId), false);
  assert.equal(provider.alive.has(b.sandboxId), false);
  assert.equal(provider.alive.has(c.sandboxId), true);
  assert.deepEqual([...store.docs.keys()], ['u2/s1']);
});

test('retention sweep removes only idle sandboxes', async () => {
  const provider = fakeProvider();
  const store = memoryStore();
  let t = 0;
  const svc = new SandboxSessionService({ provider, store, template: 'tpl', idleTimeoutMs: 1, now: () => t });
  t = 1_000;
  const old = await svc.ensure('u1', 'old');
  t = 9_000;
  const fresh = await svc.ensure('u1', 'fresh');
  t = 10_000;
  assert.equal(await svc.sweepIdle(5_000), 1);
  assert.equal(provider.alive.has(old.sandboxId), false);
  assert.equal(provider.alive.has(fresh.sandboxId), true);
});

test('each kernel key gets its own pid file and output scope', () => {
  const main = preCode();
  const agent = preCode('agent-r1');
  assert.ok(main.includes(kernelPidFile('main')));
  assert.ok(agent.includes(kernelPidFile('agent-r1')));
  assert.ok(main.trimEnd().endsWith("_sym_pre('/output', True)"));
  assert.ok(agent.trimEnd().endsWith("_sym_pre('/output/agents/agent-r1', False)"));
  assert.equal(postCode(true, 'agent-r1'), "_sym_post(True, '/output/agents/agent-r1', False)");
  assert.deepEqual(outputScope('main'), { root: '/output', excludeAgents: true });
});

test('execute, stop and release are scoped to one kernel', async () => {
  const provider = fakeProvider({
    async runCode(id, code, timeoutMs, kernelKey) {
      provider.calls.push(['runCode', isPre(code) ? 'PRE' : code === '1' ? 'PROBE' : 'USER', kernelKey]);
      if (isPre(code) || code === '1') return { stdout: '', stderr: '', pngs: [], timedOut: false };
      return { stdout: '', stderr: '', pngs: [], timedOut: true };
    },
  });
  const { svc } = service(provider);
  await svc.execute('u1', 's', 'while True: pass', 3000, 'agent-r1');
  assert.ok(provider.calls.filter(([c]) => c === 'runCode').every(([, , key]) => key === 'agent-r1'));
  assert.deepEqual(provider.calls.find(([c]) => c === 'interrupt').slice(2), ['agent-r1']);

  await svc.interrupt('u1', 's', 'agent-r2');
  assert.deepEqual(provider.calls.filter(([c]) => c === 'interrupt').at(-1).slice(2), ['agent-r2']);

  await svc.releaseKernel('u1', 's', 'agent-r1');
  assert.deepEqual(provider.calls.find(([c]) => c === 'release').slice(2), ['agent-r1']);
  await assert.rejects(svc.releaseKernel('u1', 's', 'main'), SandboxInputError);
});

test('input validation', () => {
  assert.equal(assertSessionKey('analyze_123:chat-1.x'), 'analyze_123:chat-1.x');
  for (const bad of ['', '..', 'a/b', 'x'.repeat(129), 7, null]) {
    assert.throws(() => assertSessionKey(bad), SandboxInputError);
  }
  assert.equal(assertSandboxPath('/output/a.csv'), '/output/a.csv');
  for (const bad of ['relative.csv', '/a\0b', 5]) {
    assert.throws(() => assertSandboxPath(bad), SandboxInputError);
  }
  assert.equal(clampTimeout(10), 1000);
  assert.equal(clampTimeout(10_000_000), 300_000);
  assert.equal(clampTimeout(undefined), 60_000);
  assert.equal(shellQuote("a'b"), "'a'\\''b'");
  assert.equal(assertKernelKey(undefined), 'main');
  assert.equal(assertKernelKey('agent-r_1'), 'agent-r_1');
  for (const bad of ['', 'a b', '../x', 'x'.repeat(65), 3]) {
    assert.throws(() => assertKernelKey(bad), SandboxInputError);
  }
});

test('runtime helpers', () => {
  assert.equal(parsePostScan('nothing here'), null);
  assert.deepEqual(parsePostScan(`${POST_MARKER}{"images":["a"]}`), { images: ['a'], html: [], data: [] });
  assert.deepEqual(filterStderr('keep me\nGlyph 9 (\\N{TAB}) missing from current font.\n  plt.show()\n'), ['keep me']);
  assert.equal(stripAnsi('\u001b[0;31mErr\u001b[0m'), 'Err');
  // Real E2B traceback shape (captured 2026-10-03).
  assert.equal(
    formatTraceback('-----------------------------------ZeroDivisionError                         Traceback (most recent call last)Cell In[1], line 9\n----> 9 f()\nCell In[1], line 7, in f()\n----> 7     return 1/0\nZeroDivisionError: division by zero'),
    'Traceback (most recent call last):\nCell In[1], line 9\n----> 9 f()\nCell In[1], line 7, in f()\n----> 7     return 1/0\nZeroDivisionError: division by zero',
  );
  assert.equal(formatTraceback('  Cell In[2], line 1\n    def broken(:\n               ^\nSyntaxError: invalid syntax\n'),
    'Cell In[2], line 1\n    def broken(:\n               ^\nSyntaxError: invalid syntax');
  assert.ok(isPre(preCode()));
});
