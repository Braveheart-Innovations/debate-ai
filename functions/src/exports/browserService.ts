/**
 * Browser Service — Puppeteer + @sparticuz/chromium
 *
 * Launches headless Chromium via @sparticuz/chromium (serverless-optimized)
 * with deterministic settings and network isolation for reproducible PDF rendering.
 *
 * Hardened:
 *   - Emulator-aware executable path resolution
 *   - UTC timezone emulation per page
 *   - en-US locale via Accept-Language header
 *   - Protocol-based network blocking (data:, blob:, about:, file: allowed)
 *   - Page error capture for debugging
 */
import type { Browser, Page } from 'puppeteer-core';

// Warnings collected during network interception
const networkWarnings: string[] = [];

/**
 * Launch a headless Chromium browser using @sparticuz/chromium.
 *
 * In the emulator, uses Puppeteer's bundled Chrome.
 * In deployed Cloud Functions, uses @sparticuz/chromium's serverless binary.
 */
export async function launchBrowser(): Promise<Browser> {
  const chromium = await import('@sparticuz/chromium');
  const puppeteer = await import('puppeteer-core');

  const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true';

  let executablePath: string | undefined;
  if (isEmulator) {
    // In emulator, try to use locally-installed puppeteer's bundled Chrome
    try {
      // Dynamic require to avoid compile-time dependency on 'puppeteer'
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const localPuppeteer = require('puppeteer');
      executablePath = localPuppeteer.executablePath();
    } catch {
      executablePath = undefined;
    }
  }
  const usingBundledChromium = !executablePath;
  if (!executablePath) {
    executablePath = await chromium.default.executablePath();
  }

  // @sparticuz/chromium >=149 bakes --headless='shell' into `args` and dropped
  // its `headless` getter; 'shell' at launch matches its README. Its args are
  // tuned for (and only valid with) the bundled serverless binary, so a local
  // desktop Chrome launch must not inherit them.
  const browser = await puppeteer.default.launch({
    executablePath,
    headless: usingBundledChromium ? 'shell' : true,
    args: [
      ...(usingBundledChromium ? chromium.default.args : []),
      '--disable-setuid-sandbox',
      '--no-first-run',
      '--no-zygote',
      '--lang=en-US',
    ],
  });

  return browser;
}

/**
 * Create a new page with deterministic viewport, timezone, and locale.
 *
 * Puppeteer has no launch-level locale/timezone options (unlike Playwright),
 * so both are set per-page.
 */
export async function createPage(browser: Browser): Promise<Page> {
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 800, deviceScaleFactor: 1 });
  await page.emulateTimezone('UTC');
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US' });
  return page;
}

/**
 * Allowlisted hostnames for external requests.
 *
 * HTML artifacts (Leaflet/Folium maps, Plotly charts, etc.) may reference
 * external resources like map tile servers or CDN-hosted libraries.
 * These are safe to fetch during PDF rendering.
 */
const ALLOWED_HOSTS = new Set([
  // OpenStreetMap tile servers
  'tile.openstreetmap.org',
  'a.tile.openstreetmap.org',
  'b.tile.openstreetmap.org',
  'c.tile.openstreetmap.org',
  // Stamen / Stadia tiles
  'tiles.stadiamaps.com',
  'stamen-tiles.a.ssl.fastly.net',
  // CartoDB / CARTO tiles
  'basemaps.cartocdn.com',
  'a.basemaps.cartocdn.com',
  'b.basemaps.cartocdn.com',
  'c.basemaps.cartocdn.com',
  // Mapbox tiles (free tier)
  'api.mapbox.com',
  'a.tiles.mapbox.com',
  'b.tiles.mapbox.com',
  // ESRI basemaps
  'server.arcgisonline.com',
  'services.arcgisonline.com',
  // CDNs commonly used by Leaflet, Plotly, D3
  'unpkg.com',
  'cdn.jsdelivr.net',
  'cdnjs.cloudflare.com',
  'd3js.org',
  'cdn.plot.ly',
  // Leaflet assets
  'leafletjs.com',
  // Google Fonts (for styled HTML)
  'fonts.googleapis.com',
  'fonts.gstatic.com',
]);

/**
 * Set up network blocking on a page.
 *
 * Allows data:, blob:, about:, file: schemes unconditionally.
 * Allows https: requests to allowlisted tile servers and CDNs.
 * Blocks all other external requests.
 *
 * IMPORTANT: Call before any setContent/navigation on the page.
 */
export async function setupNetworkBlocking(page: Page): Promise<void> {
  await page.setRequestInterception(true);

  page.on('request', (request) => {
    const url = request.url();

    // Extract protocol and hostname
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      // Malformed URL — block it
      const warning = `Blocked malformed request: ${request.method()} ${url} [${request.resourceType()}]`;
      console.warn(`[browserService] ${warning}`);
      networkWarnings.push(warning);
      request.abort('blockedbyclient');
      return;
    }

    // Allow safe local protocols
    if (
      parsed.protocol === 'data:' ||
      parsed.protocol === 'blob:' ||
      parsed.protocol === 'about:' ||
      parsed.protocol === 'file:'
    ) {
      request.continue();
      return;
    }

    // Allow https requests to allowlisted hosts (tile servers, CDNs)
    if (parsed.protocol === 'https:' && ALLOWED_HOSTS.has(parsed.hostname)) {
      request.continue();
      return;
    }

    // Block everything else (http:, unknown https hosts, ws:, wss:, ftp:, etc.)
    const warning = `Blocked external request: ${request.method()} ${url} [${request.resourceType()}]`;
    console.warn(`[browserService] ${warning}`);
    networkWarnings.push(warning);
    request.abort('blockedbyclient');
  });

  // Capture page-level JS errors for debugging
  page.on('pageerror', (err) => {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[browserService] Page error: ${message}`);
  });
}

/**
 * Get and clear collected network warnings.
 */
export function drainNetworkWarnings(): string[] {
  const warnings = [...networkWarnings];
  networkWarnings.length = 0;
  return warnings;
}

/**
 * Close the browser safely.
 */
export async function closeBrowser(browser: Browser | null): Promise<void> {
  if (browser) {
    try {
      await browser.close();
    } catch (err) {
      console.error('[browserService] Error closing browser:', err);
    }
  }
}

/**
 * Get Chromium version info from the browser.
 */
export async function getBrowserVersion(browser: Browser): Promise<string> {
  return browser.version();
}
