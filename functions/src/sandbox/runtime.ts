/**
 * Python runtime injected into each sandbox kernel. Reproduces the Pyodide
 * worker contract: matplotlib figures captured as PNG after each run, and new
 * or modified files under /output reported back (HTML separately from data).
 *
 * Runtime lives here (not baked into the template) so it versions with the
 * functions code. It self-installs on the first run and after kernel restarts, and
 * records the kernel pid so a timeout or Stop can SIGINT it (keeping variables).
 */

export const POST_MARKER = '__SYMPOSIUM_POST__';
/** Written by the bootstrap so the server can SIGINT a busy kernel. */
export const KERNEL_PID_FILE = '/tmp/symposium_kernel.pid';

// Mirrors scanForDataOutputs in the retired pyodide-worker.js.
const DATA_EXTENSIONS = [
  '.csv', '.json', '.xlsx', '.xls', '.tsv', '.parquet', '.pdf', '.txt', '.md', '.docx',
  '.rtf', '.log', '.xml', '.yaml', '.yml', '.toml', '.css', '.js', '.svg', '.png', '.jpg',
  '.jpeg', '.gif', '.webp', '.woff', '.woff2',
];

const BOOTSTRAP = `
import os as _sym_os, json as _sym_json, base64 as _sym_base64, io as _sym_io
import matplotlib as _sym_mpl
_sym_mpl.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
for _sym_dir in ('/uploads', '/output', '/data'):
    _sym_os.makedirs(_sym_dir, exist_ok=True)
with open('${KERNEL_PID_FILE}', 'w') as _sym_pid_file:
    _sym_pid_file.write(str(_sym_os.getpid()))
_SYM_DATA_EXT = tuple(${JSON.stringify(DATA_EXTENSIONS)})
_sym_snapshot = {}

def _sym_scan():
    found = {}
    for root, _dirs, files in _sym_os.walk('/output'):
        for name in files:
            path = _sym_os.path.join(root, name)
            try:
                st = _sym_os.stat(path)
            except OSError:
                continue
            found[_sym_os.path.relpath(path, '/output')] = (path, st.st_size, f"{st.st_size}_{st.st_mtime_ns}")
    return found

def _sym_pre():
    global _sym_snapshot
    plt.close('all')
    _sym_snapshot = {rel: key for rel, (_p, _s, key) in _sym_scan().items()}

def _sym_post(include_visuals):
    images, html, data = [], [], []
    if include_visuals:
        for num in plt.get_fignums():
            fig = plt.figure(num)
            buf = _sym_io.BytesIO()
            fig.savefig(buf, format='png', dpi=150, bbox_inches='tight', facecolor='white', edgecolor='none')
            images.append(_sym_base64.b64encode(buf.getvalue()).decode('ascii'))
    plt.close('all')
    for rel, (path, size, key) in sorted(_sym_scan().items()):
        if _sym_snapshot.get(rel) == key:
            continue
        lower = rel.lower()
        entry = {'filename': rel, 'path': path, 'size': size}
        if lower.endswith(('.html', '.htm')):
            if include_visuals:
                html.append(entry)
        elif lower.endswith(_SYM_DATA_EXT):
            data.append(entry)
    print('${POST_MARKER}' + _sym_json.dumps({'images': images, 'html': html, 'data': data}))
`;

export const PRE_CODE = `try:
    _sym_pre
except NameError:
${BOOTSTRAP.split('\n').map((line) => (line ? `    ${line}` : line)).join('\n')}
_sym_pre()
`;

export function postCode(includeVisuals: boolean): string {
  return `_sym_post(${includeVisuals ? 'True' : 'False'})`;
}

export interface PostScan {
  images: string[];
  html: Array<{ filename: string; path: string; size: number }>;
  data: Array<{ filename: string; path: string; size: number }>;
}

export function parsePostScan(stdout: string): PostScan | null {
  const line = stdout.split('\n').reverse().find((l) => l.startsWith(POST_MARKER));
  if (!line) return null;
  try {
    const parsed = JSON.parse(line.slice(POST_MARKER.length)) as Partial<PostScan>;
    return {
      images: Array.isArray(parsed.images) ? parsed.images : [],
      html: Array.isArray(parsed.html) ? parsed.html : [],
      data: Array.isArray(parsed.data) ? parsed.data : [],
    };
  } catch {
    return null;
  }
}

// Mirrors BENIGN_STDERR_PATTERNS in the retired pyodide-worker.js, plus the
// Agg "non-interactive" warning that plt.show() now emits server-side.
const BENIGN_STDERR_PATTERNS = [
  /UserWarning:\s*$/,
  /Glyph \d+ \(\\N\{[^}]+\}\) missing from current font\./,
  /FigureCanvasAgg is non-interactive, and thus cannot be shown/,
  /^\s*plt\.show\(\)\s*$/,
];

export function filterStderr(stderr: string): string[] {
  return stderr
    .split('\n')
    .filter((line) => line.trim() && !BENIGN_STDERR_PATTERNS.some((p) => p.test(line)));
}

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;]*m/g;

export function stripAnsi(value: string): string {
  return value.replace(ANSI, '');
}

/**
 * IPython tracebacks arrive as a dashed rule + "XError   Traceback (most recent
 * call last)" header glued to the first frame. Normalize to the standard Python
 * shape so the web error classifier and the model read it like before.
 */
export function formatTraceback(traceback: string): string {
  return stripAnsi(traceback)
    .replace(/^-{10,}/, '')
    .replace(/^\s*\S+\s+Traceback \(most recent call last\)/, 'Traceback (most recent call last):\n')
    .replace(/([^\n])(Cell In\[)/g, '$1\n$2')
    .trim();
}
