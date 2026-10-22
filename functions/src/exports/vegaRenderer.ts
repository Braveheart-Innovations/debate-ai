/**
 * Vega Render Service
 *
 * Renders Vega and Vega-Lite specs to SVG (preferred) or PNG
 * using Puppeteer and vendored Vega libraries.
 */
import type { Page } from 'puppeteer-core';
import * as path from 'path';
import * as fs from 'fs';

function getVendorDir(): string {
  // functions/static/vendor/ — two levels up from lib/exports/
  return path.resolve(__dirname, '..', '..', 'static', 'vendor');
}

/**
 * Ensure the page is loaded with the Vega renderer.
 * Loads the vendored Vega stack directly into the page.
 */
async function ensureRendererLoaded(page: Page): Promise<void> {
  const vendorDir = getVendorDir();
  const vegaPath = path.join(vendorDir, 'vega.min.js');
  const vegaLitePath = path.join(vendorDir, 'vega-lite.min.js');
  const vegaEmbedPath = path.join(vendorDir, 'vega-embed.min.js');

  for (const scriptPath of [vegaPath, vegaLitePath, vegaEmbedPath]) {
    if (!fs.existsSync(scriptPath)) {
      throw new Error(`[vegaRenderer] Missing vendored script: ${scriptPath}`);
    }
  }

  // Build a minimal HTML page shell, then inject scripts via Puppeteer.
  // This avoids file:// loading restrictions in some Chromium/serverless runtimes.
  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body>
<div id="vis"></div>
</body></html>`;

  await page.setContent(html, { waitUntil: 'domcontentloaded' });

  try {
    await page.addScriptTag({ path: vegaPath });
    await page.addScriptTag({ path: vegaLitePath });
    await page.addScriptTag({ path: vegaEmbedPath });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `[vegaRenderer] Failed to load vendored Vega stack from ${vendorDir}: ${msg}`,
    );
  }

  await page.addScriptTag({
    content: `
window.__renderVega = async function(spec, opts) {
  if (typeof vegaEmbed !== 'function') {
    throw new Error('vegaEmbed runtime not loaded');
  }

  var format = (opts && opts.format) || 'svg';
  var container = document.getElementById('vis');
  container.innerHTML = '';

  var specCopy = JSON.parse(JSON.stringify(spec || {}));
  if (opts && opts.width) specCopy.width = opts.width;
  if (opts && opts.height) specCopy.height = opts.height;

  var embedOpts = { actions: false, renderer: format === 'png' ? 'canvas' : 'svg' };
  var result = await vegaEmbed(container, specCopy, embedOpts);
  var view = result.view;

  if (format === 'svg') {
    var svg = await view.toSVG();
    return { svg: svg };
  }

  var canvas = await view.toCanvas();
  var dataUrl = canvas.toDataURL('image/png');
  return { pngDataUrl: dataUrl };
};`,
  });

  // Wait for renderer globals to be present
  await page.waitForFunction(
    'typeof window.__renderVega === "function" && typeof window.vegaEmbed === "function"',
    {
      timeout: 15_000,
    },
  );
}

/**
 * Render a Vega/Vega-Lite spec to SVG.
 * Falls back to PNG if SVG rendering fails.
 */
export async function renderVegaToSvg(
  spec: object,
  page: Page,
  timeout = 20_000,
): Promise<string> {
  await ensureRendererLoaded(page);

  try {
    const result = await page.evaluate(
      async (s: object) => {
        const fn = (window as unknown as Record<string, (spec: object, opts: object) => Promise<{ svg?: string; pngDataUrl?: string }>>).__renderVega;
        return fn(s, { format: 'svg' });
      },
      spec,
    );

    if (result.svg) {
      return result.svg;
    }
    throw new Error('SVG rendering returned empty result');
  } catch (err) {
    console.warn('[vegaRenderer] SVG failed, falling back to PNG:', err);
    return renderVegaToPngFallback(spec, page, timeout);
  }
}

/**
 * Render a Vega/Vega-Lite spec to PNG data URL.
 */
export async function renderVegaToPng(
  spec: object,
  page: Page,
  timeout = 20_000,
): Promise<string> {
  await ensureRendererLoaded(page);

  const result = await page.evaluate(
    async (s: object) => {
      const fn = (window as unknown as Record<string, (spec: object, opts: object) => Promise<{ svg?: string; pngDataUrl?: string }>>).__renderVega;
      return fn(s, { format: 'png' });
    },
    spec,
  );

  if (result.pngDataUrl) {
    return result.pngDataUrl;
  }
  throw new Error('PNG rendering returned empty result');
}

/**
 * Internal PNG fallback when SVG fails.
 * Returns an <img> tag with the PNG data URL.
 */
async function renderVegaToPngFallback(
  spec: object,
  page: Page,
  timeout: number,
): Promise<string> {
  const dataUrl = await renderVegaToPng(spec, page, timeout);
  return `<img src="${dataUrl}" alt="Vega visualization" style="max-width:100%">`;
}
