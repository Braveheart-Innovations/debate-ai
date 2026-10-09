/** Ported from symposium-ai-web src/services/artifacts/BundleDetectionService.ts (Phase 3), logic unchanged. */
/**
 * BundleDetectionService
 *
 * Pure-function service that determines whether outputs from a single execution
 * should form a bundle. Scans HTML files for references to sibling CSS/JS/image
 * files and groups them into a BundleManifest.
 */

import type { BundleFile, BundleManifest } from '../contract/types/notebook';

export interface ExecutionOutputs {
  htmlOutputs: Array<{ content: string; filename: string }>;
  dataOutputs: Array<{ filename: string; base64: string; size: number }>;
}

export interface BundleDetectionResult {
  shouldBundle: boolean;
  manifest: BundleManifest | null;
  /** HTML outputs that were NOT included in the bundle */
  unbundledHtml: Array<{ content: string; filename: string }>;
  /** Data outputs that were NOT included in the bundle */
  unbundledData: Array<{ filename: string; base64: string; size: number }>;
}

/**
 * Extract all local file references from HTML content.
 * Looks for href=, src=, @import, and url() references that could point to sibling files.
 */
function normalizePathSegments(path: string): string {
  const segments: string[] = [];
  for (const part of path.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      segments.pop();
    } else {
      segments.push(part);
    }
  }
  return segments.join('/');
}

function dirname(path: string): string {
  const index = path.lastIndexOf('/');
  return index === -1 ? '' : path.slice(0, index);
}

function basename(path: string): string {
  const index = path.lastIndexOf('/');
  return index === -1 ? path : path.slice(index + 1);
}

function resolveLocalReference(raw: string, fromFilename?: string, knownFilenames?: Set<string>): string | null {
  if (/^(https?:|javascript:|mailto:|data:|blob:|#)/i.test(raw)) return null;

  const stripped = raw.split(/[?#]/)[0].trim();
  if (!stripped) return null;

  const withoutOutputPrefix = stripped.replace(/^\/output\//i, '');
  if (withoutOutputPrefix.startsWith('/')) {
    return normalizePathSegments(withoutOutputPrefix.slice(1));
  }

  const directCandidate = normalizePathSegments(withoutOutputPrefix.replace(/^\.\//, ''));
  if (knownFilenames?.has(directCandidate)) {
    return directCandidate;
  }

  const baseDir = fromFilename ? dirname(fromFilename) : '';
  const candidate = baseDir ? `${baseDir}/${withoutOutputPrefix}` : withoutOutputPrefix;
  const relativeCandidate = normalizePathSegments(candidate.replace(/^\.\//, ''));
  if (knownFilenames?.has(relativeCandidate)) {
    return relativeCandidate;
  }

  return relativeCandidate;
}

function extractFileReferences(html: string, fromFilename?: string, knownFilenames?: Set<string>): string[] {
  const refs = new Set<string>();

  // href="filename" and src="filename" (not external URLs, anchors, javascript:, mailto:)
  const attrRegex = /(?:href|src)\s*=\s*["']([^"']+)["']/gi;
  let match;
  while ((match = attrRegex.exec(html)) !== null) {
    const normalized = resolveLocalReference(match[1], fromFilename, knownFilenames);
    if (normalized) refs.add(normalized);
  }

  // CSS @import "filename" or @import url("filename")
  const importRegex = /@import\s+(?:url\s*\(\s*)?["']([^"']+)["']/gi;
  while ((match = importRegex.exec(html)) !== null) {
    const normalized = resolveLocalReference(match[1], fromFilename, knownFilenames);
    if (normalized) refs.add(normalized);
  }

  // CSS url(filename) — but not data: or https: URIs
  const urlRegex = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;
  while ((match = urlRegex.exec(html)) !== null) {
    const normalized = resolveLocalReference(match[1], fromFilename, knownFilenames);
    if (normalized) refs.add(normalized);
  }

  return [...refs];
}

/**
 * Map file extension to MIME type for bundle files.
 */
function mimeForFilename(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    'html': 'text/html',
    'htm': 'text/html',
    'css': 'text/css',
    'js': 'application/javascript',
    'json': 'application/json',
    'svg': 'image/svg+xml',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'woff': 'font/woff',
    'woff2': 'font/woff2',
  };
  return map[ext] || 'application/octet-stream';
}

/**
 * Check if a MIME type represents binary content that should be base64-encoded.
 */
function isBinaryMime(mime: string): boolean {
  return mime.startsWith('image/') ||
    mime.startsWith('font/') ||
    mime === 'application/octet-stream';
}

/**
 * Select the entry point from a set of HTML filenames.
 * Preference: index.html > dashboard.html > alphabetically first.
 */
function selectEntryPoint(htmlFilenames: string[]): string {
  const indexFile = htmlFilenames.find((filename) => basename(filename) === 'index.html');
  if (indexFile) return indexFile;
  const dashboardFile = htmlFilenames.find((filename) => basename(filename) === 'dashboard.html');
  if (dashboardFile) return dashboardFile;
  return [...htmlFilenames].sort()[0];
}

/**
 * Detect whether execution outputs should be bundled together.
 *
 * Algorithm:
 * 1. Build a set of all filenames from htmlOutputs + dataOutputs
 * 2. For each HTML file, scan for references that match sibling filenames
 * 3. If any HTML file references another file from the same execution → bundle them
 * 4. Non-referenced data files remain as individual artifacts
 */
export function detectBundle(outputs: ExecutionOutputs): BundleDetectionResult {
  const { htmlOutputs, dataOutputs } = outputs;

  // Nothing to bundle with fewer than 2 total outputs
  if (htmlOutputs.length + dataOutputs.length < 2) {
    return {
      shouldBundle: false,
      manifest: null,
      unbundledHtml: [...htmlOutputs],
      unbundledData: [...dataOutputs],
    };
  }

  // Build filename sets
  const allFilenames = new Set<string>();
  const htmlFilenames = new Set<string>();
  const dataFilenameMap = new Map<string, { base64: string; size: number }>();

  for (const h of htmlOutputs) {
    allFilenames.add(h.filename);
    htmlFilenames.add(h.filename);
  }
  for (const d of dataOutputs) {
    allFilenames.add(d.filename);
    dataFilenameMap.set(d.filename, { base64: d.base64, size: d.size });
  }

  // For each HTML file, find which sibling files it references
  const referencedFiles = new Set<string>(); // files referenced by at least one HTML
  const referencingHtml = new Set<string>(); // HTML files that reference at least one sibling

  for (const h of htmlOutputs) {
    const refs = extractFileReferences(h.content, h.filename, allFilenames);
    for (const ref of refs) {
      if (allFilenames.has(ref) && ref !== h.filename) {
        referencedFiles.add(ref);
        referencingHtml.add(h.filename);
      }
    }
  }

  // If no HTML references any sibling → no bundle
  if (referencingHtml.size === 0) {
    return {
      shouldBundle: false,
      manifest: null,
      unbundledHtml: [...htmlOutputs],
      unbundledData: [...dataOutputs],
    };
  }

  // Collect all files that should be in the bundle:
  // - All HTML files that reference siblings
  // - All HTML files that ARE referenced by siblings
  // - All non-HTML files that are referenced
  const bundledFilenames = new Set<string>();

  for (const name of referencingHtml) bundledFilenames.add(name);
  for (const name of referencedFiles) bundledFilenames.add(name);

  // Also include HTML files that are referenced (they might not reference anything themselves)
  // They're already covered by referencedFiles above

  // Build the manifest
  const files: Record<string, BundleFile> = {};

  for (const h of htmlOutputs) {
    if (bundledFilenames.has(h.filename)) {
      files[h.filename] = {
        mimeType: 'text/html',
        content: h.content,
        size: new TextEncoder().encode(h.content).length,
      };
    }
  }

  for (const [filename, data] of dataFilenameMap) {
    if (bundledFilenames.has(filename)) {
      const mime = mimeForFilename(filename);
      const binary = isBinaryMime(mime);
      if (binary) {
        files[filename] = {
          mimeType: mime,
          content: data.base64,
          isBase64: true,
          size: data.size,
        };
      } else {
        // Decode base64 to text for text assets (CSS, JS, SVG, JSON)
        try {
          const text = atob(data.base64);
          files[filename] = {
            mimeType: mime,
            content: text,
            size: data.size,
          };
        } catch {
          // If decode fails, store as base64
          files[filename] = {
            mimeType: mime,
            content: data.base64,
            isBase64: true,
            size: data.size,
          };
        }
      }
    }
  }

  // Select entry point from bundled HTML files
  const bundledHtmlFiles = htmlOutputs
    .filter(h => bundledFilenames.has(h.filename))
    .map(h => h.filename);

  const manifest: BundleManifest = {
    version: 1,
    entryPoint: selectEntryPoint(bundledHtmlFiles),
    files,
  };

  // Collect unbundled outputs
  const unbundledHtml = htmlOutputs.filter(h => !bundledFilenames.has(h.filename));
  const unbundledData = dataOutputs.filter(d => !bundledFilenames.has(d.filename));

  return {
    shouldBundle: true,
    manifest,
    unbundledHtml,
    unbundledData,
  };
}
