const fs = require('fs');
const path = require('path');

// Root detection: assume script run from repo root
const repoRoot = process.cwd();
const srcRoot = path.join(repoRoot, 'src');

// Utility: read all TS/TSX files under src
function walk(dir, exts = new Set(['.ts', '.tsx'])) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    const entries = fs.readdirSync(d, { withFileTypes: true });
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
        stack.push(p);
      } else if (exts.has(path.extname(e.name))) {
        out.push(p);
      }
    }
  }
  return out;
}

// Resolve an import path to a file in the repo, if possible
function resolveImport(importerFile, spec) {
  if (!spec) return null;
  // Strip query params or platform suffix handling is out of scope here
  // Handle alias '@/'
  const candidates = [];
  if (spec.startsWith('@/')) {
    const rel = spec.slice(2); // remove '@/'
    const base = path.join(srcRoot, rel);
    candidates.push(base);
  } else if (spec.startsWith('./') || spec.startsWith('../')) {
    const base = path.resolve(path.dirname(importerFile), spec);
    candidates.push(base);
  } else if (spec.startsWith('src/')) {
    // sometimes raw src path used
    const base = path.join(repoRoot, spec);
    candidates.push(base);
  } else {
    // Bare module import — skip (external lib)
    return null;
  }

  const exts = ['', '.tsx', '.ts', '/index.tsx', '/index.ts'];
  for (const cand of candidates) {
    for (const ext of exts) {
      const full = cand + ext;
      try {
        const st = fs.statSync(full);
        if (st.isFile()) return path.normalize(full);
      } catch {}
    }
  }
  return null;
}

// Extract import-like specifiers from a file
function extractImports(file) {
  const code = fs.readFileSync(file, 'utf8');
  const specs = new Set();
  // import ... from '...'
  const re1 = /import\s+[^'";]+?from\s+['"]([^'\"]+)['"]/g;
  // export ... from '...'
  const re2 = /export\s+[^'";]+?from\s+['"]([^'\"]+)['"]/g;
  // dynamic import('...')
  const re3 = /import\(\s*['"]([^'\"]+)['"]\s*\)/g;
  // require('...')
  const re4 = /require\(\s*['"]([^'\"]+)['"]\s*\)/g;
  let m;
  for (const re of [re1, re2, re3, re4]) {
    while ((m = re.exec(code)) !== null) {
      specs.add(m[1]);
    }
  }
  return Array.from(specs);
}

// Build adjacency map (file -> imported files)
const allFiles = walk(srcRoot);
// Include root entry files in the scan as well
['App.tsx', 'index.ts', 'index.tsx'].forEach(fname => {
  const p = path.join(repoRoot, fname);
  if (fs.existsSync(p)) allFiles.push(p);
});
const graph = new Map();

for (const f of allFiles) {
  const imports = [];
  const specs = extractImports(f);
  for (const s of specs) {
    const resolved = resolveImport(f, s);
    if (resolved) imports.push(resolved);
  }
  graph.set(path.normalize(f), new Set(imports.map(p => path.normalize(p))));
}

// Find entrypoints: repo App.tsx + root index.ts if exists
const entrypoints = [];
const appRoot = path.join(repoRoot, 'App.tsx');
if (fs.existsSync(appRoot)) entrypoints.push(path.normalize(appRoot));
const rootIndexTs = path.join(repoRoot, 'index.ts');
const rootIndexTsx = path.join(repoRoot, 'index.tsx');
if (fs.existsSync(rootIndexTs)) entrypoints.push(path.normalize(rootIndexTs));
if (fs.existsSync(rootIndexTsx)) entrypoints.push(path.normalize(rootIndexTsx));

// Traverse reachable files
const reachable = new Set(entrypoints);
const queue = [...entrypoints];
while (queue.length) {
  const cur = queue.shift();
  const deps = graph.get(cur) || new Set();
  for (const dep of deps) {
    if (!reachable.has(dep)) {
      reachable.add(dep);
      queue.push(dep);
    }
  }
}

// Collect all .tsx under src/components (excluding index files)
const componentFiles = walk(path.join(srcRoot, 'components'), new Set(['.tsx']))
  .filter(p => !/\/index\.tsx$/.test(p))
  .map(p => path.normalize(p));

const orphans = componentFiles.filter(p => !reachable.has(p)).sort();

console.log(JSON.stringify({
  entrypoints,
  counts: {
    totalSrcFiles: allFiles.length,
    totalComponents: componentFiles.length,
    orphaned: orphans.length,
  },
  orphans,
}, null, 2));
