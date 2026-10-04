/**
 * Builds the E2B template used by the sandbox* callables (SANDBOX_TEMPLATE in
 * src/sandbox/callables.ts). Re-run after changing the package set.
 *
 *   E2B_API_KEY=... node scripts/build-sandbox-template.mjs
 *
 * Packages mirror what Analyze Python could import in the browser (Pyodide)
 * before the move to server execution. Sandboxes run with no internet access,
 * so anything Analyze needs must be baked in here.
 *
 * Map boundaries for geopandas live under /opt/geo (geopandas.datasets is gone and
 * the sandbox can't download): official sources, pinned by SHA-256 so an upstream
 * change fails the build instead of silently changing maps. The web app's prompt
 * names these paths (symposium-ai-web baseSystemPrompt.ts, Maps line).
 */
import { Template, defaultBuildLogger } from 'e2b';

const TEMPLATE = 'symposium-analyze';

const PACKAGES = [
  'altair', 'astropy', 'beautifulsoup4', 'biopython', 'bokeh', 'folium', 'geopandas', 'h5py',
  'humanize', 'imageio', 'jinja2', 'jsonschema', 'lxml', 'matplotlib', 'networkx', 'nltk',
  'numpy', 'openpyxl', 'pandas', 'patsy', 'Pillow', 'plotly', 'pyarrow', 'pypdf',
  'python-dateutil', 'python-docx', 'python-pptx', 'pytz', 'pywavelets', 'pyyaml', 'regex',
  'reportlab', 'rich', 'scikit-image', 'scikit-learn', 'scipy', 'seaborn', 'shapely',
  'sqlalchemy', 'statsmodels', 'sympy', 'tabulate', 'wordcloud', 'xarray', 'xlsxwriter',
];

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

const installGeo = GEO_SOURCES.map(({ url, sha256, dir }) => [
  `mkdir -p ${dir}`,
  `python3 -c "import sys, urllib.request; urllib.request.urlretrieve(sys.argv[1], '/tmp/geo.zip')" ${url}`,
  `echo "${sha256}  /tmp/geo.zip" | sha256sum -c -`,
  `python3 -m zipfile -e /tmp/geo.zip ${dir}`,
  'rm /tmp/geo.zip',
].join(' && ')).join(' && ');

if (!process.env.E2B_API_KEY) {
  console.error('E2B_API_KEY is not set');
  process.exit(1);
}

const template = Template()
  .fromTemplate('code-interpreter-v1')
  .pipInstall(PACKAGES)
  .setUser('root')
  // Analyze code and tools address files by absolute path (/uploads, /output, /data).
  .runCmd('mkdir -p /uploads /output /data && chown -R user:user /uploads /output /data')
  .runCmd(installGeo)
  .setUser('user');

const info = await Template.build(template, TEMPLATE, {
  cpuCount: 2,
  memoryMB: 4096,
  onBuildLogs: defaultBuildLogger(),
});
console.log('Built template', info);
