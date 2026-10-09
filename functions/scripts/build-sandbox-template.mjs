/**
 * Builds the E2B template used by the sandbox* callables (SANDBOX_TEMPLATE and
 * SANDBOX_TEMPLATE_CANDIDATE in src/sandbox/callables.ts).
 *
 *   E2B_API_KEY=... node scripts/build-sandbox-template.mjs
 *
 * Templates are versioned by name and never rebuilt in place: a same-name rebuild
 * reaches every new production sandbox at once. A change means a new TEMPLATE name,
 * dark-tested as SANDBOX_TEMPLATE_CANDIDATE, then switched. The script refuses to
 * build the name SANDBOX_TEMPLATE currently points at.
 *
 * v1 (symposium-analyze) mirrored what Pyodide could import. v2 adds a Chromium for
 * Plotly image export, NLP data, a house chart style that matches the report
 * (Inter; scripts/sandbox-template/), PDF and statistics-file readers, and analytical
 * packages. Plan: symposium-ai-web docs/analyze-sandbox-template-v2-plan.md.
 * Sandboxes run with no internet access, so anything Analyze needs must be baked in.
 * Every download is pinned by SHA-256 so an upstream change fails the build. Only
 * permissive licences (MIT, BSD, Apache-2.0, OFL): no AGPL (PyMuPDF), no GPL.
 *
 * Map boundaries for geopandas live under /opt/geo (geopandas.datasets is gone and
 * the sandbox can't download): official sources, pinned by SHA-256 so an upstream
 * change fails the build instead of silently changing maps. The web app's prompt
 * names these paths (symposium-ai-web baseSystemPrompt.ts, Maps line).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Template, defaultBuildLogger } from 'e2b';

const TEMPLATE = 'symposium-analyze-v2';
const here = dirname(fileURLToPath(import.meta.url));

const PACKAGES = [
  'altair', 'astropy', 'beautifulsoup4', 'biopython', 'bokeh', 'folium', 'geopandas', 'h5py',
  'humanize', 'imageio', 'jinja2', 'jsonschema', 'lxml', 'matplotlib', 'networkx', 'nltk',
  'numpy', 'openpyxl', 'pandas', 'patsy', 'Pillow', 'pyarrow', 'pypdf',
  'python-dateutil', 'python-docx', 'python-pptx', 'pytz', 'pywavelets', 'pyyaml', 'regex',
  'reportlab', 'rich', 'scikit-image', 'scikit-learn', 'scipy', 'seaborn', 'shapely',
  'sqlalchemy', 'statsmodels', 'sympy', 'tabulate', 'wordcloud', 'xarray', 'xlsxwriter',
  // v2: Plotly 6.0.x can't drive the base image's kaleido 1.x (fig.write_image fails);
  // 6.1.1 is the first that can. Newest 6.x; 7 is a major. Exact pins only: pipInstall
  // doesn't quote, so a '>=' becomes a shell redirect.
  'plotly==6.9.0',
  // v2: classed choropleths (GeoDataFrame.plot(scheme=...)).
  'mapclassify',
  // v2: reading uploads. PDF layout text and tables, PDF page images (no browser, no
  // AGPL), SPSS/Stata/SAS, .xlsb, .ods, fast Excel.
  'pdfplumber', 'pypdfium2', 'pyreadstat', 'pyxlsb', 'odfpy', 'python-calamine',
  // v2: analytical depth. xgboost-cpu, not xgboost: the main wheel pulls in CUDA's NCCL.
  'duckdb', 'polars', 'lightgbm', 'xgboost-cpu', 'lifelines', 'statsforecast',
  // v2: table images (GT.gtsave renders through Chromium).
  'great_tables',
];

// Debian packages (the base image's apt sources are a dated snapshot, so these pin too).
// Chromium serves kaleido (Plotly fig.write_image) and great_tables (GT.gtsave).
const APT_PACKAGES = ['chromium'];

// Fonts, all OFL. Inter 4.1's static TTFs are byte-identical to the report PDF's
// (symposium-ai-web public/fonts), so charts and report text match exactly.
const FONT_SOURCES = [
  {
    url: 'https://github.com/rsms/inter/releases/download/v4.1/Inter-4.1.zip',
    sha256: '9883fdd4a49d4fb66bd8177ba6625ef9a64aa45899767dde3d36aa425756b11e',
    files: ['extras/ttf/Inter-*.ttf', 'LICENSE.txt'],
    dir: '/usr/share/fonts/truetype/inter',
  },
  {
    url: 'https://github.com/adobe-fonts/source-serif/releases/download/4.005R/source-serif-4.005_Desktop.zip',
    sha256: '549fdb8f9a682bd06944298621404969f6de77c2e422ff3b8244a1dcd6a0c425',
    files: ['source-serif-4.005_Desktop/TTF/SourceSerif4-*.ttf', 'source-serif-4.005_Desktop/LICENSE.md'],
    dir: '/usr/share/fonts/truetype/source-serif-4',
  },
  {
    url: 'https://github.com/JetBrains/JetBrainsMono/releases/download/v2.304/JetBrainsMono-2.304.zip',
    sha256: '6f6376c6ed2960ea8a963cd7387ec9d76e3f629125bc33d1fdcd7eb7012f7bbf',
    files: ['fonts/ttf/JetBrainsMono-*.ttf', 'OFL.txt'],
    dir: '/usr/share/fonts/truetype/jetbrains-mono',
  },
];

// NLP data for offline use: spacy's small English model (MIT) and the core NLTK data.
const SPACY_MODEL = {
  url: 'https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.8.0/en_core_web_sm-3.8.0-py3-none-any.whl',
  sha256: '1932429db727d4bff3deed6b34cfc05df17794f4a52eeb26cf8928f7c1a0fb85',
};
const NLTK_DATA = [
  { path: 'tokenizers/punkt_tab', sha256: 'e57f64187974277726a3417ca6f181ec5403676c717672eef6a748a7b20e0106' },
  { path: 'corpora/stopwords', sha256: '48c0e52d8b52546e827f53761fb30300c0ab94f70660d28bd65ba0a86270946b' },
  { path: 'sentiment/vader_lexicon', sha256: '8adba4294eef3964d820bf655e37e61bdc3a341994356af59b74fb3b4a36ce5c' },
];
const NLTK_ROOT = '/usr/share/nltk_data';

// kaleido (Plotly image export) loads MathJax from a CDN, and Plotly geo figures load
// their topojson from one; offline, write_image hangs until the cell times out. Local
// copies, wired up in sandbox-template/90_symposium_style.py. Apache-2.0 and MIT.
const MATHJAX = {
  url: 'https://registry.npmjs.org/mathjax/-/mathjax-2.7.9.tgz',
  sha256: '7131e739848edc14aa661a5516995866b81a477fab8b039d7cc324930e71f786',
  dir: '/opt/mathjax',
};
const TOPOJSON = {
  url: 'https://registry.npmjs.org/sane-topojson/-/sane-topojson-4.0.0.tgz',
  sha256: '31bd5369063a7ac6d840b6ce28d438ac7f32f8b7750c54885637e4a19046b797',
  dir: '/opt/plotly-topojson',
};

// Natural Earth is public domain; Census cartographic boundary files are US Government works.
const GEO_SOURCES = [
  {
    url: 'https://naturalearth.s3.amazonaws.com/50m_cultural/ne_50m_admin_0_countries.zip',
    sha256: '5fed433373581fa648920435f937d95f2d3c0200e067409c6478dcdf1b853139',
    dir: '/opt/geo/world',
  },
  {
    url: 'https://www2.census.gov/geo/tiger/GENZ2023/shp/cb_2023_us_state_5m.zip',
    sha256: '0f606018e81fe99a204d08aa7ac1f8d00516143ddc95900b79eeecfee65da8c3',
    dir: '/opt/geo/us',
  },
  {
    url: 'https://www2.census.gov/geo/tiger/GENZ2023/shp/cb_2023_us_county_5m.zip',
    sha256: '13b2bcdd81fee8476220793dd1023c4f1d2887945b5f66eef52afa98c99d2485',
    dir: '/opt/geo/us',
  },
];

const fetchPinned = (url, sha256, file) => [
  `python3 -c "import sys, urllib.request; urllib.request.urlretrieve(sys.argv[1], sys.argv[2])" ${url} ${file}`,
  `echo "${sha256}  ${file}" | sha256sum -c -`,
];

const installGeo = GEO_SOURCES.map(({ url, sha256, dir }) => [
  `mkdir -p ${dir}`,
  ...fetchPinned(url, sha256, '/tmp/geo.zip'),
  `python3 -m zipfile -e /tmp/geo.zip ${dir}`,
  'rm /tmp/geo.zip',
].join(' && ')).join(' && ');

const installFonts = [
  ...FONT_SOURCES.map(({ url, sha256, files, dir }) => [
    `mkdir -p ${dir} /tmp/font`,
    ...fetchPinned(url, sha256, '/tmp/font.zip'),
    'python3 -m zipfile -e /tmp/font.zip /tmp/font',
    `cp ${files.map((file) => `/tmp/font/${file}`).join(' ')} ${dir}/`,
    'rm -rf /tmp/font /tmp/font.zip',
  ].join(' && ')),
  'fc-cache -f',
].join(' && ');

const installNlp = [
  ...fetchPinned(SPACY_MODEL.url, SPACY_MODEL.sha256, `/tmp/${SPACY_MODEL.url.split('/').pop()}`),
  `pip install --no-deps /tmp/${SPACY_MODEL.url.split('/').pop()}`,
  `rm /tmp/${SPACY_MODEL.url.split('/').pop()}`,
  ...NLTK_DATA.flatMap(({ path, sha256 }) => [
    `mkdir -p ${NLTK_ROOT}/${dirname(path)}`,
    ...fetchPinned(`https://raw.githubusercontent.com/nltk/nltk_data/gh-pages/packages/${path}.zip`, sha256, '/tmp/nltk.zip'),
    // Keep the zip too, as nltk.download does: VADER loads its lexicon from inside it.
    `python3 -m zipfile -e /tmp/nltk.zip ${NLTK_ROOT}/${dirname(path)}`,
    `mv /tmp/nltk.zip ${NLTK_ROOT}/${path}.zip`,
  ]),
].join(' && ');

// The kernel runs as root and reads its rc from $MATPLOTLIBRC, which the base image
// points at E2B's own one-line file (font.family: Noto Sans CJK JP). Replace that file
// with the house style, then rebuild the font cache so Inter is found on first use.
const installPlotlyAssets = [
  `mkdir -p ${MATHJAX.dir} ${TOPOJSON.dir}`,
  ...fetchPinned(MATHJAX.url, MATHJAX.sha256, '/tmp/mathjax.tgz'),
  // unpacked/ is an unminified duplicate of the whole library.
  `tar xzf /tmp/mathjax.tgz -C ${MATHJAX.dir} --strip-components=1 --exclude=package/unpacked --exclude=package/test`,
  ...fetchPinned(TOPOJSON.url, TOPOJSON.sha256, '/tmp/topojson.tgz'),
  `tar xzf /tmp/topojson.tgz -C ${TOPOJSON.dir} --strip-components=2 package/dist`,
  `tar xzf /tmp/topojson.tgz -C ${TOPOJSON.dir} --strip-components=1 package/LICENSE`,
  'rm /tmp/mathjax.tgz /tmp/topojson.tgz',
].join(' && ');

// The kernel runs as root, and Chromium refuses to start as root without --no-sandbox.
// Debian's chromium wrapper reads /etc/chromium.d; the E2B microVM is the isolation boundary.
const configureChromium = `echo 'export CHROMIUM_FLAGS="$CHROMIUM_FLAGS --no-sandbox"' > /etc/chromium.d/symposium-no-sandbox`;

const installChartStyle = [
  'mkdir -p /opt/symposium /root/.config/matplotlib /root/.ipython/profile_default/startup',
  'cp /opt/symposium/matplotlibrc /root/.config/matplotlib/.matplotlibrc',
  'fc-cache -f',
  'rm -rf /root/.cache/matplotlib',
  `python3 -c "import matplotlib.font_manager as fm; fm._load_fontmanager(try_read_cache=False); assert 'Inter' in {f.name for f in fm.fontManager.ttflist}, 'Inter not registered'"`,
].join(' && ');

if (!process.env.E2B_API_KEY) {
  console.error('E2B_API_KEY is not set');
  process.exit(1);
}

const live = readFileSync(join(here, '../src/sandbox/callables.ts'), 'utf8').match(/export const SANDBOX_TEMPLATE = '([^']+)'/)?.[1];
if (!live || live === TEMPLATE) {
  console.error(`Refusing to build ${TEMPLATE}: it is the live SANDBOX_TEMPLATE (${live}). Bump TEMPLATE to a new name.`);
  process.exit(1);
}

const template = Template({ fileContextPath: join(here, 'sandbox-template') })
  .fromTemplate('code-interpreter-v1')
  .pipInstall(PACKAGES)
  .setUser('root')
  .aptInstall(APT_PACKAGES, { noInstallRecommends: true })
  .runCmd(configureChromium)
  // Analyze code and tools address files by absolute path (/uploads, /output, /data).
  .runCmd('mkdir -p /uploads /output /data && chown -R user:user /uploads /output /data')
  .runCmd(installGeo)
  .runCmd(installFonts)
  .runCmd(installNlp)
  .runCmd(installPlotlyAssets)
  .copy('matplotlibrc', '/opt/symposium/matplotlibrc', { user: 'root', mode: 0o644 })
  .copy('fonts.conf', '/etc/fonts/local.conf', { user: 'root', mode: 0o644 })
  .copy('90_symposium_style.py', '/root/.ipython/profile_default/startup/90_symposium_style.py', { user: 'root', mode: 0o644 })
  .runCmd(installChartStyle)
  .setUser('user');

const info = await Template.build(template, TEMPLATE, {
  cpuCount: 2,
  memoryMB: 4096,
  onBuildLogs: defaultBuildLogger(),
});
console.log('Built template', info);
