/**
 * Builds the E2B template used by the sandbox* callables (SANDBOX_TEMPLATE in
 * src/sandbox/callables.ts). Re-run after changing the package set.
 *
 *   E2B_API_KEY=... node scripts/build-sandbox-template.mjs
 *
 * Packages mirror what Analyze Python could import in the browser (Pyodide)
 * before the move to server execution. Sandboxes run with no internet access,
 * so anything Analyze needs must be baked in here.
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
  .setUser('user');

const info = await Template.build(template, TEMPLATE, {
  cpuCount: 2,
  memoryMB: 4096,
  onBuildLogs: defaultBuildLogger(),
});
console.log('Built template', info);
