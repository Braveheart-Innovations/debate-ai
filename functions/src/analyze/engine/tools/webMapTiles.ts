/**
 * The maps rule, enforced (F8): reports have no map tile provider (decided
 * 2026-10-04), so a tile map's basemap never loads. Maps are report `chart`
 * blocks (Vega-Lite `geoshape` over the app-hosted boundaries).
 *
 * After execute_python / write_output_file:
 *  - an HTML output that draws a web tile map gets a note telling the model to
 *    redraw it as a chart block;
 *  - a report spec whose `embedded_html` block embeds such a map is not saved:
 *    it is dropped from the result's outputs (so capture never makes it a
 *    report) and the model is told to replace the block and save again.
 *
 * The signs below are map libraries' tile layers, not anything per provider.
 */
import type { ToolResult } from '../../contract/lib/ai/tools/types';
import { decodePossiblyBase64Json, parseJsonLenient } from '../../contract/lib/encoding/utf8Base64';
import { withNotes } from './toolResultNotes';

const TILE_SIGNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\{z\}[^"'`\s]*\{x\}[^"'`\s]*\{-?y\}|\{z\}[^"'`\s]*\{-?y\}[^"'`\s]*\{x\}/i, label: 'a map tile URL template ({z}/{x}/{y})' },
  { pattern: /\bL\.tileLayer\s*\(/, label: 'a Leaflet tile layer' },
  { pattern: /["']type["']\s*:\s*["'](?:scatter|choropleth|density)map(?:box)?["']/, label: 'a Plotly tile map' },
  { pattern: /new\s+(?:maplibregl|mapboxgl)\.Map\s*\(/, label: 'a MapLibre / Mapbox GL map' },
  { pattern: /\bol\.source\.(?:OSM|XYZ)\b/, label: 'an OpenLayers tile source' },
  { pattern: /maps\.googleapis\.com\/maps\/api\/js/, label: 'the Google Maps JavaScript API' },
];

const CHART_INSTEAD = 'Draw this map as a report `chart` block instead: Vega-Lite `geoshape` over the app-hosted boundaries (see MAPS in the output contract).';

/** What in the HTML loads web map tiles, or null. */
export function detectWebMapTiles(html: string): string | null {
  for (const sign of TILE_SIGNS) {
    if (sign.pattern.test(html)) return sign.label;
  }
  return null;
}

function outputRelativePath(path: string): string {
  return path.trim().replace(/^\/?output\//, '').replace(/^\/+/, '');
}

interface EmbeddedHtmlRef {
  artifactId: string;
  where: string;
}

/** The `embedded_html` blocks of a JSON file that declares a report spec (null if it isn't one). */
function embeddedHtmlRefs(base64: string): EmbeddedHtmlRef[] | null {
  let parsed: unknown;
  try {
    parsed = parseJsonLenient(decodePossiblyBase64Json(Buffer.from(base64, 'base64').toString('utf8')));
  } catch {
    return null;
  }
  const spec = parsed as { kind?: unknown; pages?: unknown };
  if (!spec || spec.kind !== 'analysis_artifact_spec' || !Array.isArray(spec.pages)) return null;
  const refs: EmbeddedHtmlRef[] = [];
  spec.pages.forEach((page: { title?: unknown; blocks?: unknown }, pageIndex) => {
    if (!Array.isArray(page?.blocks)) return;
    page.blocks.forEach((block: { kind?: unknown; artifactId?: unknown; title?: unknown }, blockIndex) => {
      if (block?.kind !== 'embedded_html' || typeof block.artifactId !== 'string' || !block.artifactId.trim()) return;
      const where = typeof block.title === 'string' && block.title.trim()
        ? `"${block.title.trim()}"`
        : `page ${pageIndex + 1}, block ${blockIndex + 1}`;
      refs.push({ artifactId: block.artifactId, where });
    });
  });
  return refs;
}

/**
 * Checks a tool result's HTML and report outputs for web tile maps. `readFile`
 * reads an `/output/` file the result didn't carry (an HTML written earlier).
 */
export async function guardWebMapTiles(
  result: ToolResult,
  readFile: (path: string) => Promise<ArrayBuffer>,
): Promise<ToolResult> {
  const htmlOutputs = result.htmlOutputs ?? [];
  const dataOutputs = result.dataOutputs ?? [];
  if (htmlOutputs.length === 0 && !dataOutputs.some((output) => output.filename.toLowerCase().endsWith('.json'))) {
    return result;
  }

  const notes: string[] = [];
  const tileMaps = new Map<string, string | null>();
  for (const output of htmlOutputs) {
    const name = outputRelativePath(output.filename ?? '');
    const sign = detectWebMapTiles(output.content);
    if (name) tileMaps.set(name, sign);
    if (sign) {
      const file = name ? `/output/${name}` : 'This HTML output';
      notes.push(`Note: ${file} draws a web tile map (${sign}). Reports have no map tile provider, so its basemap won't load (blank, or an error image). ${CHART_INSTEAD} Don't embed ${name || 'it'} in the report.`);
    }
  }

  const tileMapSign = async (artifactId: string): Promise<string | null> => {
    const name = outputRelativePath(artifactId);
    if (!tileMaps.has(name)) {
      let sign: string | null = null;
      try {
        sign = detectWebMapTiles(Buffer.from(await readFile(`/output/${name}`)).toString('utf8'));
      } catch {
        // Not in the sandbox (yet): nothing to check.
      }
      tileMaps.set(name, sign);
    }
    return tileMaps.get(name) ?? null;
  };

  const rejected = new Set<string>();
  for (const output of dataOutputs) {
    if (!output.filename.toLowerCase().endsWith('.json')) continue;
    const refs = embeddedHtmlRefs(output.base64);
    if (!refs?.length) continue;
    for (const ref of refs) {
      const sign = await tileMapSign(ref.artifactId);
      if (!sign) continue;
      rejected.add(output.filename);
      notes.push(`Report NOT saved: /output/${outputRelativePath(output.filename)} embeds ${ref.artifactId} (block ${ref.where}), which draws a web tile map (${sign}). Reports have no map tile provider, so that map can't render. Replace that embedded_html block with a \`chart\` block (Vega-Lite \`geoshape\` over the app-hosted boundaries, see MAPS in the output contract) and save the report again.`);
    }
  }

  if (notes.length === 0) return result;
  const guarded = withNotes(result, notes);
  if (rejected.size === 0) return guarded;
  const kept = dataOutputs.filter((output) => !rejected.has(output.filename));
  return { ...guarded, dataOutputs: kept.length > 0 ? kept : undefined };
}
