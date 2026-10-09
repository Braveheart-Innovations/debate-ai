/**
 * Smoke test for an Analyze sandbox template: an inventory plus one functional
 * probe per template capability. Creates a sandbox exactly as production does
 * (E2BSandboxProvider: no internet access), so offline gaps show up here.
 *
 *   E2B_API_KEY=... node scripts/sandbox-template-smoke.mjs [--template symposium-analyze-v2] [--out DIR] [--compare symposium-analyze]
 *
 * --out saves the probe images (house-style chart, Plotly export, choropleth, PDF page,
 * table image) for the screen-cap review. --compare also draws the sample chart
 * on another template, so the two can be viewed side by side.
 * Exits non-zero if any probe fails.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Sandbox } from '@e2b/code-interpreter';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
};
const TEMPLATE = option('template', 'symposium-analyze-v2');
const OUT = option('out', null);
const COMPARE = option('compare', null);

if (!process.env.E2B_API_KEY) {
  console.error('E2B_API_KEY is not set');
  process.exit(1);
}

const INVENTORY = `
import os, sys, shutil, subprocess, importlib.metadata as md
mem = int(open('/proc/meminfo').read().split()[1]) // 1024
disk = shutil.disk_usage('/')
print('python', sys.version.split()[0], '| cpus', os.cpu_count(), '| memory', mem, 'MB | free disk', disk.free // 2**30, 'GB')
print('packages', len(list(md.distributions())))
print('programs', {p: bool(shutil.which(p)) for p in ['chromium', 'R', 'java', 'node', 'convert', 'libreoffice', 'pandoc', 'tesseract']})
fams = subprocess.run(['fc-list', ':', 'family'], capture_output=True, text=True).stdout.split('\\n')
print('fonts', sorted({f.split(',')[0] for f in fams if f}))
print('fontconfig defaults', {g: subprocess.run(['fc-match', g], capture_output=True, text=True).stdout.strip() for g in ['sans-serif', 'serif', 'monospace']})
`;

const SAMPLE_CHART = `
import numpy as np, matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
rng = np.random.default_rng(7)
months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug']
fig, (a, b) = plt.subplots(1, 2, figsize=(11, 4.2))
for i, name in enumerate(['North', 'South', 'East', 'West']):
    a.plot(months, 100 + np.cumsum(rng.normal(3, 6, len(months))) + i * 12, marker='o', label=name)
a.set_title('Monthly enrolment by region (東京 office included)')
a.set_ylabel('Enrolments')
a.legend()
b.bar(['Toddler', 'Preschool', 'Pre-K', 'School age'], [42, 57, 61, 38])
b.set_title('Capacity utilisation, %')
import warnings
with warnings.catch_warnings(record=True) as caught:
    warnings.simplefilter('always')
    fig.savefig('/output/smoke-house-style.png')
missing = [str(w.message) for w in caught if 'missing from font' in str(w.message)]
print('missing glyphs', missing[:2] or 'none')
print('font', matplotlib.font_manager.findfont(matplotlib.font_manager.FontProperties(family=['sans-serif'])))
`;

const PROBES = [
  ['matplotlib house style', `
import matplotlib.pyplot as plt, matplotlib.font_manager as fm
rc = plt.rcParams
assert rc['font.sans-serif'][0] == 'Inter', rc['font.sans-serif']
assert 'Inter' in fm.findfont(fm.FontProperties(family=['sans-serif'])), fm.findfont(fm.FontProperties(family=['sans-serif']))
assert 'SourceSerif4' in fm.findfont(fm.FontProperties(family=['serif']))
assert 'JetBrainsMono' in fm.findfont(fm.FontProperties(family=['monospace']))
assert rc['savefig.dpi'] == 150 and rc['axes.prop_cycle'].by_key()['color'][0].lower() == '#0e9594'
${SAMPLE_CHART}`],
  ['plotly write_image', `
import plotly.express as px, plotly.io as pio
assert pio.templates.default == 'symposium', pio.templates.default
fig = px.bar(x=['a', 'b', 'c'], y=[3, 1, 2], title='Plotly export')
fig.write_image('/output/smoke-plotly.png', width=800, height=450)
fig.write_image('/output/smoke-plotly.svg')
geo = px.choropleth(locations=['TX', 'CA', 'NY'], locationmode='USA-states', color=[1, 2, 3], scope='usa', title='Plotly geo, offline')
geo.write_image('/output/smoke-plotly-geo.png', width=800, height=450)
math = px.line(x=[0, 1, 2], y=[0, 1, 4], title=r'$y = x^2$')
math.write_image('/output/smoke-plotly-math.png', width=600, height=350)
import os; print(os.path.getsize('/output/smoke-plotly.png'), 'bytes')`],
  ['classed choropleth', `
import glob, geopandas as gpd, numpy as np, matplotlib.pyplot as plt
states = gpd.read_file(glob.glob('/opt/geo/us/cb_2023_us_state_5m.shp')[0])
states = states[~states.STUSPS.isin(['AK', 'HI', 'PR', 'GU', 'VI', 'MP', 'AS'])].to_crs(5070)
states['value'] = np.random.default_rng(1).gamma(2, 10, len(states))
ax = states.plot(column='value', scheme='NaturalBreaks', k=5, legend=True, cmap='Blues', edgecolor='white', linewidth=0.4, figsize=(9, 5))
ax.set_axis_off(); ax.set_title('Natural breaks (mapclassify)')
plt.savefig('/output/smoke-choropleth.png')`],
  ['pdfplumber + pypdfium2', `
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Table, Paragraph
from reportlab.lib.styles import getSampleStyleSheet
rows = [['Center', 'Capacity', 'Enrolled'], ['Austin', '120', '104'], ['Denver', '96', '91'], ['Tampa', '140', '118']]
SimpleDocTemplate('/data/smoke.pdf', pagesize=letter).build([Paragraph('Fixture', getSampleStyleSheet()['Title']), Table(rows, style=[('GRID', (0, 0), (-1, -1), 0.5, 'black')])])
import pdfplumber
with pdfplumber.open('/data/smoke.pdf') as pdf:
    table = pdf.pages[0].extract_table()
assert table == rows, table
import pypdfium2 as pdfium
page = pdfium.PdfDocument('/data/smoke.pdf')[0]
page.render(scale=2).to_pil().save('/output/smoke-pdf-page.png')
print('table rows', len(table))`],
  ['duckdb over parquet', `
import pandas as pd, numpy as np, duckdb, polars as pl
pd.DataFrame({'k': np.arange(100_000) % 7, 'v': np.arange(100_000)}).to_parquet('/data/smoke.parquet')
got = duckdb.sql("select k, sum(v) s from '/data/smoke.parquet' group by k order by k").df()
assert len(got) == 7
assert pl.read_parquet('/data/smoke.parquet').height == 100_000
print(got.head(2).to_dict('records'))`],
  ['spacy + nltk offline', `
import spacy, nltk
from nltk.sentiment import SentimentIntensityAnalyzer
from nltk.corpus import stopwords
doc = spacy.load('en_core_web_sm')('KinderCare opened a new center in Portland last March.')
assert {e.label_ for e in doc.ents} & {'ORG', 'GPE', 'DATE'}, [(e.text, e.label_) for e in doc.ents]
assert nltk.word_tokenize('Hello there. How are you?')[:2] == ['Hello', 'there']
assert 'the' in stopwords.words('english')
score = SentimentIntensityAnalyzer().polarity_scores('The staff were wonderful and kind.')
assert score['compound'] > 0.5, score
print([(e.text, e.label_) for e in doc.ents], score['compound'])`],
  ['file readers', `
import pandas as pd, pyreadstat, pyxlsb, odf
df = pd.DataFrame({'a': [1, 2], 'b': ['x', 'y']})
pyreadstat.write_sav(df, '/data/smoke.sav'); assert pyreadstat.read_sav('/data/smoke.sav')[0].shape == (2, 2)
pyreadstat.write_dta(df, '/data/smoke.dta'); assert pd.read_stata('/data/smoke.dta').shape[0] == 2
df.to_excel('/data/smoke.ods', engine='odf', index=False); assert pd.read_excel('/data/smoke.ods', engine='odf').shape == (2, 2)
df.to_excel('/data/smoke.xlsx', index=False); assert pd.read_excel('/data/smoke.xlsx', engine='calamine').shape == (2, 2)
print('ok')`],
  ['modelling packages', `
import numpy as np, pandas as pd, lightgbm, xgboost, lifelines, statsforecast
from statsforecast import StatsForecast
from statsforecast.models import AutoETS
X = np.random.default_rng(0).normal(size=(300, 4)); y = X[:, 0] * 2 + X[:, 1]
lightgbm.LGBMRegressor(n_estimators=20, verbose=-1).fit(X, y)
xgboost.XGBRegressor(n_estimators=20).fit(X, y)
lifelines.KaplanMeierFitter().fit(np.random.default_rng(1).exponential(10, 100))
series = pd.DataFrame({'unique_id': 'a', 'ds': pd.date_range('2024-01-01', periods=36, freq='MS'), 'y': np.arange(36) + 10.0})
fc = StatsForecast(models=[AutoETS(season_length=12)], freq='MS').forecast(df=series, h=3)
assert len(fc) == 3
print('ok')`],
  ['great_tables image', `
import pandas as pd
from great_tables import GT
GT(pd.DataFrame({'Center': ['Austin', 'Denver'], 'Utilisation': [0.87, 0.95]})).fmt_percent('Utilisation').gtsave('/output/smoke-table.png')
import os; print(os.path.getsize('/output/smoke-table.png'), 'bytes')`],
];

const IMAGES = ['smoke-house-style.png', 'smoke-plotly.png', 'smoke-plotly-geo.png', 'smoke-plotly-math.png', 'smoke-choropleth.png', 'smoke-pdf-page.png', 'smoke-table.png'];

async function open(template) {
  const t0 = Date.now();
  const sandbox = await Sandbox.create(template, { allowInternetAccess: false, timeoutMs: 600_000 });
  const first = await sandbox.runCode('1');
  if (first.error) throw new Error(`first run failed: ${first.error.value}`);
  return { sandbox, coldStartMs: Date.now() - t0 };
}

async function run(sandbox, code, timeoutMs = 120_000) {
  const t0 = Date.now();
  let result;
  try {
    result = await sandbox.runCode(code, { timeoutMs });
  } catch (error) {
    return { ms: Date.now() - t0, stdout: '', error: `${error.name}: ${error.message}` };
  }
  return {
    ms: Date.now() - t0,
    stdout: result.logs.stdout.join('').trim(),
    error: result.error ? `${result.error.name}: ${result.error.value}\n${result.error.traceback ?? ''}` : null,
  };
}

async function save(sandbox, name, prefix = '') {
  if (!OUT) return;
  try {
    const bytes = await sandbox.files.read(`/output/${name}`, { format: 'bytes' });
    writeFileSync(join(OUT, `${prefix}${name}`), bytes);
  } catch {
    // The probe failed and already reported why.
  }
}

if (OUT) mkdirSync(OUT, { recursive: true });
const { sandbox, coldStartMs } = await open(TEMPLATE);
let failed = 0;
try {
  console.log(`template ${TEMPLATE} | cold start ${coldStartMs} ms`);
  console.log((await run(sandbox, INVENTORY)).stdout);
  for (const [name, code] of PROBES) {
    const result = await run(sandbox, code);
    if (result.error) failed += 1;
    console.log(`${result.error ? 'FAIL' : 'PASS'}  ${name} (${result.ms} ms)${result.stdout ? `\n      ${result.stdout.split('\n').join('\n      ')}` : ''}`);
    if (result.error) console.log(`      ${result.error.split('\n').slice(-12).join('\n      ')}`);
  }
  for (const name of IMAGES) await save(sandbox, name, `${TEMPLATE}-`);
} finally {
  await sandbox.kill();
}

if (COMPARE) {
  const other = await open(COMPARE);
  try {
    const result = await run(other.sandbox, SAMPLE_CHART);
    console.log(`compare ${COMPARE} | cold start ${other.coldStartMs} ms | sample chart ${result.error ? `FAIL ${result.error}` : 'drawn'}`);
    await save(other.sandbox, 'smoke-house-style.png', `${COMPARE}-`);
  } finally {
    await other.sandbox.kill();
  }
}

if (OUT) console.log(`images saved to ${OUT}`);
console.log(failed ? `${failed} probe(s) failed` : 'all probes passed');
process.exit(failed ? 1 : 0);
