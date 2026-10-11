import { detectWebMapTiles, guardWebMapTiles } from '../webMapTiles';
import type { ToolResult } from '../../../contract/lib/ai/tools/types';

const LEAFLET = '<script>L.map("m"); L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png").addTo(map);</script>';
const VEGA_MAP = '<script>vegaEmbed("#v", {"mark":"geoshape","data":{"url":"/data/boundaries/world-countries@1.json"}});</script>';

function base64(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64');
}

function specJson(blocks: unknown[]): string {
  return JSON.stringify({ version: 1, kind: 'analysis_artifact_spec', title: 'Quakes', pages: [{ slug: 'index', title: 'Map', blocks }] });
}

function dataOutput(filename: string, text: string) {
  return { filename, base64: base64(text), size: text.length };
}

const noFile = jest.fn(async () => { throw new Error('missing'); });

describe('detectWebMapTiles', () => {
  it.each([
    ['folium / Leaflet', LEAFLET],
    ['a raster tile template', '{"tiles":["https://tile.openstreetmap.org/{z}/{x}/{y}.png"]}'],
    ['an ArcGIS-order template', "url: 'https://server/MapServer/tile/{z}/{y}/{x}'"],
    ['Plotly scattermap', '{"data":[{"type": "scattermap","lat":[1]}]}'],
    ['Plotly scattermapbox', '{"type":"scattermapbox"}'],
    ['MapLibre', 'const map = new maplibregl.Map({ container: "m" });'],
    ['OpenLayers', 'new ol.layer.Tile({ source: new ol.source.OSM() })'],
    ['Google Maps', '<script src="https://maps.googleapis.com/maps/api/js?key=x"></script>'],
  ])('flags %s', (_name, html) => {
    expect(detectWebMapTiles(html)).not.toBeNull();
  });

  it.each([
    ['a Vega-Lite geoshape map', VEGA_MAP],
    ['Plotly scattergeo', '{"type":"scattergeo","lat":[1]}'],
    ['a plain page', '<p>Zoom level {z} is explained in the text.</p>'],
  ])('leaves %s alone', (_name, html) => {
    expect(detectWebMapTiles(html)).toBeNull();
  });
});

describe('guardWebMapTiles', () => {
  it('returns a result without HTML or JSON outputs unchanged', async () => {
    const result: ToolResult = { toolCallId: 't', success: true, content: 'Executed successfully.' };
    expect(await guardWebMapTiles(result, noFile)).toBe(result);
  });

  it('tells the model to redraw a tile-map HTML output as a chart block, keeping the file', async () => {
    const result: ToolResult = { toolCallId: 't', success: true, content: 'Executed successfully.', htmlOutputs: [{ filename: 'quake_map.html', content: LEAFLET }] };
    const guarded = await guardWebMapTiles(result, noFile);
    expect(guarded.success).toBe(true);
    expect(guarded.htmlOutputs).toEqual(result.htmlOutputs);
    expect(guarded.content).toContain('/output/quake_map.html draws a web tile map (a map tile URL template');
    expect(guarded.content).toContain('`geoshape`');
  });

  it('adds nothing for a Vega map', async () => {
    const result: ToolResult = { toolCallId: 't', success: true, content: 'ok', htmlOutputs: [{ filename: 'map.html', content: VEGA_MAP }] };
    expect((await guardWebMapTiles(result, noFile)).content).toBe('ok');
  });

  it('does not save a report that embeds a tile map written earlier, and keeps the other outputs', async () => {
    const readFile = jest.fn(async (path: string) => {
      if (path === '/output/quake_map.html') return new TextEncoder().encode(LEAFLET).buffer;
      throw new Error('missing');
    });
    const spec = dataOutput('report.json', specJson([
      { kind: 'markdown', markdown: 'Intro' },
      { kind: 'embedded_html', artifactId: 'quake_map.html', title: 'Recent quakes' },
    ]));
    const csv = dataOutput('quakes.csv', 'a,b\n1,2');
    const result: ToolResult = { toolCallId: 't', success: true, content: 'Wrote 1 KB to /output/report.json.', dataOutputs: [spec, csv] };

    const guarded = await guardWebMapTiles(result, readFile);

    expect(readFile).toHaveBeenCalledWith('/output/quake_map.html');
    expect(guarded.dataOutputs).toEqual([csv]);
    expect(guarded.content).toContain('Report NOT saved: /output/report.json embeds quake_map.html (block "Recent quakes")');
  });

  it('checks an embed against the same result\'s HTML, by /output/ path too', async () => {
    const spec = dataOutput('report.json', specJson([{ kind: 'embedded_html', artifactId: '/output/quake_map.html' }]));
    const result: ToolResult = {
      toolCallId: 't',
      success: true,
      content: 'Executed successfully.',
      htmlOutputs: [{ filename: 'quake_map.html', content: LEAFLET }],
      dataOutputs: [spec],
    };
    const guarded = await guardWebMapTiles(result, noFile);
    expect(noFile).not.toHaveBeenCalled();
    expect(guarded.dataOutputs).toBeUndefined();
    expect(guarded.content).toContain('(block page 1, block 1)');
  });

  it('saves a report whose embedded component is not a tile map', async () => {
    const spec = dataOutput('report.json', specJson([{ kind: 'embedded_html', artifactId: 'widget.html' }]));
    const result: ToolResult = { toolCallId: 't', success: true, content: 'ok', htmlOutputs: [{ filename: 'widget.html', content: '<div>widget</div>' }], dataOutputs: [spec] };
    const guarded = await guardWebMapTiles(result, noFile);
    expect(guarded).toBe(result);
  });

  it('adds the note to a failed run\'s error too', async () => {
    const result: ToolResult = { toolCallId: 't', success: false, content: 'Error: boom', error: 'boom', htmlOutputs: [{ filename: 'm.html', content: LEAFLET }] };
    const guarded = await guardWebMapTiles(result, noFile);
    expect(guarded.error).toContain('boom\n\nNote: /output/m.html draws a web tile map');
  });
});
