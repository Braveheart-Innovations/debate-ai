/**
 * Export Job Runner — Main Pipeline
 *
 * Receives a jobId from Cloud Tasks, reads the report spec,
 * validates + canonicalizes, renders all visuals via Puppeteer,
 * generates a PDF, content-addresses the output, builds a signed
 * provenance manifest, and stores everything to Cloud Storage + Firestore.
 *
 * Phases: queued → processing → rendering → completed | failed
 *
 * Security:
 *   - Network isolation: all external requests blocked in Puppeteer
 *   - Content integrity: sha256 verification of all input artifacts
 *   - HTML sanitization: defense-in-depth for html_snapshot
 *   - HMAC-signed provenance manifest
 */
import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { getFirestore } from 'firebase-admin/firestore';
import { OAuth2Client } from 'google-auth-library';
import { getExportBucket } from './utils';
import type { Browser } from 'puppeteer-core';

import type {
  ExportJobDoc,
  ReportSpecV1,
  ReportChromeSlot,
  ArtifactDoc,
  ArtifactBlock,
  ProvenanceInputArtifact,
} from './types';
import { sha256Hex, updateJobPhase, resolveArtifactData } from './utils';
import { validateExportArtifacts } from './policyGate';
import { canonicalizeReportSpecV1, contentAddressReportSpec } from './canonicalize';
import {
  launchBrowser,
  createPage,
  setupNetworkBlocking,
  drainNetworkWarnings,
  closeBrowser,
  getBrowserVersion,
} from './browserService';
import { renderVegaToSvg } from './vegaRenderer';
import { renderHtmlToPng } from './htmlRenderer';
import { assembleReportHtml, renderDatasetPreview, renderJsonDocument, renderTextDocument } from './reportAssembler';
import { generateManifest, signManifest, storeProvenance } from './provenance';
import { getOrRenderVisual, resetCacheStats, getCacheStats } from './renderCache';
import { runHtmlDirectPipeline } from './htmlDirectPipeline';
import {
  createArtifactBrandingRecord,
  formatBrandingLine,
  isVisibleBranding,
  shouldWriteBrandingMetadata,
} from './artifactBranding';

const provenanceHmacKey = defineSecret('PROVENANCE_HMAC_KEY');

// Verifies that a request carries a valid Cloud Tasks OIDC token. This endpoint
// is invoked ONLY by the exports queue (see enqueueExportJob), which attaches an
// OIDC token whose audience is this function's URL and whose identity is the
// App Engine default service account. Rejecting anything else prevents arbitrary
// callers from triggering or replaying export jobs.
const oidcClient = new OAuth2Client();

async function verifyCloudTasksInvoker(
  authorizationHeader: string | undefined,
): Promise<{ status: number; error: string } | null> {
  const token = typeof authorizationHeader === 'string'
    ? (authorizationHeader.match(/^Bearer (.+)$/)?.[1] ?? null)
    : null;
  if (!token) {
    return { status: 401, error: 'Unauthorized: missing bearer token' };
  }

  const project = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || '';
  // Must mirror enqueueExportJob's oidcToken settings exactly.
  const expectedAudience = `https://us-central1-${project}.cloudfunctions.net/runExportJob`;
  const expectedEmail = `${project}@appspot.gserviceaccount.com`;

  try {
    const ticket = await oidcClient.verifyIdToken({ idToken: token, audience: expectedAudience });
    const payload = ticket.getPayload();
    if (!payload || payload.email !== expectedEmail || payload.email_verified !== true) {
      return { status: 403, error: 'Forbidden: unexpected invoker identity' };
    }
    return null;
  } catch {
    return { status: 401, error: 'Unauthorized: invalid token' };
  }
}

// Puppeteer version for provenance
let puppeteerVersion = 'unknown';
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pptrPkg = require('puppeteer-core/package.json');
  puppeteerVersion = pptrPkg.version;
} catch {
  // Resolved at runtime
}

/**
 * Build a renderer version string for cache keying.
 */
function getRendererVersionString(): string {
  return `pptr:${puppeteerVersion}`;
}

const EMPTY_CHROME_TEMPLATE = '<span></span>';
const DEFAULT_HEADER: Required<ReportChromeSlot> = {
  enabled: false,
  left: '',
  center: '',
  right: '',
};
const DEFAULT_FOOTER: Required<ReportChromeSlot> = {
  enabled: true,
  left: '',
  center: '{{pageNumber}} / {{totalPages}}',
  right: formatBrandingLine(),
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function tokenToPuppeteerSpan(text: string): string {
  return escapeHtml(text)
    .replace(/\{\{pageNumber\}\}/g, '<span class="pageNumber"></span>')
    .replace(/\{\{totalPages\}\}/g, '<span class="totalPages"></span>')
    .replace(/\{\{title\}\}/g, '<span class="title"></span>')
    .replace(/\{\{date\}\}/g, '<span class="date"></span>');
}

function buildChromeTemplate(
  slot: ReportChromeSlot | undefined,
  defaults: Required<ReportChromeSlot>,
): string {
  const merged: Required<ReportChromeSlot> = {
    ...defaults,
    ...(slot ?? {}),
  };
  if (!merged.enabled) return EMPTY_CHROME_TEMPLATE;

  const left = merged.left.trim();
  const center = merged.center.trim();
  const right = merged.right.trim();
  if (!left && !center && !right) return EMPTY_CHROME_TEMPLATE;

  return [
    '<div style="width:100%;font-size:9px;color:#6b7280;padding:0 8px;">',
    '<div style="display:flex;align-items:center;justify-content:space-between;width:100%;gap:6px;">',
    `<span style="flex:1;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${tokenToPuppeteerSpan(left)}</span>`,
    `<span style="flex:1;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${tokenToPuppeteerSpan(center)}</span>`,
    `<span style="flex:1;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${tokenToPuppeteerSpan(right)}</span>`,
    '</div>',
    '</div>',
  ].join('');
}

/**
 * Store a debug bundle on export failure for admin diagnostics.
 */
async function storeDebugBundle(
  jobId: string,
  data: {
    reportSpec?: unknown;
    assembledHtml?: string;
    renderPlan?: unknown;
    blockedRequests?: string[];
    consoleMessages?: string[];
    error?: string;
  },
): Promise<void> {
  try {
    const bucket = getExportBucket();
    const bundlePath = `exports/debug/${jobId}.json`;

    await bucket.file(bundlePath).save(
      JSON.stringify({
        jobId,
        timestamp: new Date().toISOString(),
        ...data,
      }, null, 2),
      {
        contentType: 'application/json',
        metadata: { cacheControl: 'private, max-age=86400' },
      },
    );
    console.log(`[runExportJob] Debug bundle stored at ${bundlePath}`);
  } catch (err) {
    console.error('[runExportJob] Failed to store debug bundle:', err);
  }
}

export const runExportJob = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 540,
    memory: '2GiB',
    concurrency: 1,
    maxInstances: 3,
    secrets: [provenanceHmacKey],
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed');
      return;
    }

    // Authenticate the caller as the Cloud Tasks exports queue before doing any work.
    const authError = await verifyCloudTasksInvoker(req.headers.authorization);
    if (authError) {
      console.warn(`[runExportJob] Rejected unauthenticated invocation: ${authError.error}`);
      res.status(authError.status).json({ error: authError.error });
      return;
    }

    const { jobId } = req.body;
    if (!jobId || typeof jobId !== 'string') {
      res.status(400).json({ error: 'Missing jobId' });
      return;
    }

    console.log(`[runExportJob] Starting export job: ${jobId}`);

    // ================================================================
    // 0. Startup guard: HMAC secret must be configured
    // ================================================================
    const hmacSecret = provenanceHmacKey.value();
    if (!hmacSecret) {
      console.error(`[runExportJob] MISSING_SECRET: PROVENANCE_HMAC_KEY not configured`);
      try {
        await updateJobPhase(jobId, 'failed', {
          error: 'MISSING_SECRET: PROVENANCE_HMAC_KEY not configured. Contact administrator.',
        });
      } catch { /* best effort */ }
      res.status(500).json({ error: 'MISSING_SECRET' });
      return;
    }

    const db = getFirestore();
    let browser: Browser | null = null;
    let assembledHtml = '';
    const blockedRequests: string[] = [];
    const consoleMessages: string[] = [];

    // Reset render cache stats for this job
    resetCacheStats();

    try {
      // ================================================================
      // 1. Load export job document
      // ================================================================
      const jobDoc = await db.collection('exportJobs').doc(jobId).get();
      if (!jobDoc.exists) {
        console.error(`[runExportJob] Job ${jobId} not found`);
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      const job = jobDoc.data() as ExportJobDoc;
      const { sessionId, createdBy } = job;

      if (!sessionId || !createdBy) {
        await updateJobPhase(jobId, 'failed', { error: 'Missing sessionId or createdBy on job doc' });
        res.status(400).json({ error: 'Invalid job document' });
        return;
      }

      // ================================================================
      // MODE DISPATCH: html_direct bypasses the report_spec pipeline
      // ================================================================
      if (job.mode === 'html_direct') {
        await updateJobPhase(jobId, 'processing', { progress: 10 });

        const artifactId = job.artifactId;
        if (!artifactId) {
          await updateJobPhase(jobId, 'failed', { error: 'Missing artifactId for html_direct mode' });
          res.status(400).json({ error: 'Missing artifactId' });
          return;
        }

        // Load artifact
        const artDoc = await db
          .collection('users')
          .doc(createdBy)
          .collection('conversations')
          .doc(sessionId)
          .collection('artifacts')
          .doc(artifactId)
          .get();

        if (!artDoc.exists) {
          await updateJobPhase(jobId, 'failed', { error: 'Artifact not found' });
          res.status(404).json({ error: 'Artifact not found' });
          return;
        }

        const artifact = artDoc.data() as ArtifactDoc;
        artifact.data = await resolveArtifactData(artifact);

        await updateJobPhase(jobId, 'rendering', { progress: 30 });

        // Launch browser + render PDF
        browser = await launchBrowser();
        const page = await createPage(browser);
        await setupNetworkBlocking(page);

        const { pdfBuffer, sourceHash, artifactName } = await runHtmlDirectPipeline(
          artifact,
          page,
          job.options,
        );
        await page.close();

        await updateJobPhase(jobId, 'rendering', { progress: 85 });

        // Content-address + store PDF (same pattern as report_spec)
        const pdfHash = sha256Hex(pdfBuffer);
        const bucket = getExportBucket();
        const pdfPath = `exports/pdf/${pdfHash}.pdf`;
        const pdfFile = bucket.file(pdfPath);

        const [exists] = await pdfFile.exists();
        if (!exists) {
          await pdfFile.save(pdfBuffer, {
            contentType: 'application/pdf',
            metadata: { cacheControl: 'public, max-age=31536000, immutable' },
          });
          console.log(`[runExportJob] html_direct: Stored PDF at ${pdfPath}`);
        }

        // Signed URL (7-day expiry)
        const [downloadUrl] = await pdfFile.getSignedUrl({
          action: 'read',
          expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
        });

        // Create document_pdf artifact in Firestore
        const pdfArtifactId = `document_pdf_${pdfHash.slice(0, 12)}`;
        const brandingRecord = shouldWriteBrandingMetadata(job.options?.branding)
          ? createArtifactBrandingRecord(job.options?.branding)
          : undefined;
        await db
          .collection('users')
          .doc(createdBy)
          .collection('conversations')
          .doc(sessionId)
          .collection('artifacts')
          .doc(pdfArtifactId)
          .set({
            id: pdfArtifactId,
            cellId: 'export',
            sessionId,
            name: `${artifactName.replace(/\.[^.]+$/, '')}.pdf`,
            type: 'document_pdf',
            mimeType: 'application/pdf',
            data: '',
            createdAt: Date.now(),
            metadata: {
              pdfHash,
              storagePath: pdfPath,
              downloadUrl,
              sourceArtifactId: artifactId,
              exportJobId: jobId,
              ...(brandingRecord ? { branding: brandingRecord } : {}),
            },
            profile: 'ARCHIVE_PORTABLE',
            provenance: {
              generator: 'html-direct-pipeline',
              generatorVersion: '1.0.0',
              inputs: [artifactId],
            },
          });

        await updateJobPhase(jobId, 'completed', {
          progress: 100,
          downloadUrl,
          outputArtifactId: pdfArtifactId,
          outputArtifactType: 'document_pdf',
          pdfHash,
        });

        console.log(`[runExportJob] html_direct job ${jobId} completed. PDF: ${pdfHash}`);
        res.status(200).json({
          status: 'completed',
          jobId,
          pdfHash,
          downloadUrl,
          outputArtifactId: pdfArtifactId,
          outputArtifactType: 'document_pdf',
        });
        return;
      }

      // ================================================================
      // REPORT_SPEC MODE (existing pipeline)
      // ================================================================
      const { reportSpecArtifactId } = job;

      // ================================================================
      // 2. Update phase → processing
      // ================================================================
      await updateJobPhase(jobId, 'processing', { progress: 10 });

      // ================================================================
      // 3. Load report_spec artifact
      // ================================================================
      const specDoc = await db
        .collection('users')
        .doc(createdBy)
        .collection('conversations')
        .doc(sessionId)
        .collection('artifacts')
        .doc(reportSpecArtifactId)
        .get();

      if (!specDoc.exists) {
        await updateJobPhase(jobId, 'failed', {
          error: 'Report spec artifact not found',
        });
        res.status(404).json({ error: 'Report spec not found' });
        return;
      }

      const specArtifact = specDoc.data() as ArtifactDoc;

      // ================================================================
      // 3a. Parse + canonicalize report spec (Zod validation)
      // ================================================================
      let reportSpec: ReportSpecV1;
      try {
        const resolvedSpecData = await resolveArtifactData(specArtifact);
        const rawSpec = JSON.parse(resolvedSpecData);
        reportSpec = canonicalizeReportSpecV1(rawSpec);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Invalid report spec';
        await updateJobPhase(jobId, 'failed', { error: `Canonicalization failed: ${msg}` });
        res.status(400).json({ error: 'Invalid report spec' });
        return;
      }

      // ================================================================
      // 3b. Verify content-addressed ID matches artifact ID
      // ================================================================
      const { id: expectedId, hash: reportSpecHash } = contentAddressReportSpec(reportSpec);
      if (reportSpecArtifactId !== expectedId) {
        console.warn(
          `[runExportJob] Artifact ID mismatch: expected ${expectedId}, got ${reportSpecArtifactId}. ` +
          `Proceeding (may be a legacy ID or re-publish).`,
        );
      }

      // ================================================================
      // 4. Resolve referenced artifacts
      // ================================================================
      const artifactBlocks: ArtifactBlock[] = [];
      for (const page of reportSpec.pages) {
        for (const block of page.blocks) {
          if (block.kind === 'artifact') {
            artifactBlocks.push(block);
          }
        }
      }

      const artifacts = new Map<string, ArtifactDoc>();
      for (const block of artifactBlocks) {
        if (artifacts.has(block.artifactId)) continue;

        const artDoc = await db
          .collection('users')
          .doc(createdBy)
          .collection('conversations')
          .doc(sessionId)
          .collection('artifacts')
          .doc(block.artifactId)
          .get();

        if (artDoc.exists) {
          const artData = artDoc.data() as ArtifactDoc;
          // Resolve offloaded data from Storage if needed
          artData.data = await resolveArtifactData(artData);
          artifacts.set(block.artifactId, artData);
        }
      }

      // ================================================================
      // 4a. Integrity check: verify artifact data hashes
      // ================================================================
      for (const [artifactId, artifact] of artifacts) {
        if (artifact.metadata && typeof artifact.metadata === 'object') {
          const storedHash = (artifact.metadata as Record<string, unknown>).sha256;
          if (storedHash && typeof storedHash === 'string') {
            const computedHash = sha256Hex(artifact.data);
            if (computedHash !== storedHash) {
              await updateJobPhase(jobId, 'failed', {
                error: `ARTIFACT_INTEGRITY_MISMATCH: ${artifactId} (expected ${storedHash}, got ${computedHash})`,
              });
              res.status(400).json({ error: 'ARTIFACT_INTEGRITY_MISMATCH', artifactId });
              return;
            }
          }
        }
      }

      // ================================================================
      // 4b. Profile consistency check
      // ================================================================
      if (reportSpec.profile === 'ARCHIVE_PORTABLE') {
        for (const [artifactId, artifact] of artifacts) {
          if (artifact.profile && artifact.profile !== 'ARCHIVE_PORTABLE' && artifact.profile !== 'SESSION_INTERACTIVE') {
            // Non-standard profile — warn but allow
            console.warn(`[runExportJob] Artifact ${artifactId} has profile '${artifact.profile}' (expected ARCHIVE_PORTABLE)`);
          }
        }
      }

      // ================================================================
      // 5. Policy gate
      // ================================================================
      const policyResult = validateExportArtifacts(reportSpec, artifacts);
      if (!policyResult.valid) {
        await updateJobPhase(jobId, 'failed', {
          error: `Policy gate failed: ${policyResult.errors.join('; ')}`,
        });
        res.status(400).json({ error: 'Policy gate failed', details: policyResult.errors });
        return;
      }

      const allWarnings = [...policyResult.warnings];

      // ================================================================
      // 6. Launch browser
      // ================================================================
      browser = await launchBrowser();
      const chromiumVersion = await getBrowserVersion(browser);

      // ================================================================
      // 7. Update phase → rendering
      // ================================================================
      await updateJobPhase(jobId, 'rendering', { progress: 30 });

      // ================================================================
      // 8. Render visuals (with render cache)
      // ================================================================
      // Key renderings by page:block position (not artifactId) so the same
      // artifact can appear in multiple blocks with different options/intents.
      const blockRenderings = new Map<string, string>();
      const rendererVersions = getRendererVersionString();

      // Build position-keyed list of artifact blocks
      const positionedBlocks: Array<{ key: string; block: ArtifactBlock }> = [];
      for (let pi = 0; pi < reportSpec.pages.length; pi++) {
        for (let bi = 0; bi < reportSpec.pages[pi].blocks.length; bi++) {
          const block = reportSpec.pages[pi].blocks[bi];
          if (block.kind === 'artifact') {
            positionedBlocks.push({ key: `${pi}:${bi}`, block });
          }
        }
      }

      for (const { key, block } of positionedBlocks) {
        const artifact = artifacts.get(block.artifactId);
        if (!artifact) continue;

        const sourceHash = sha256Hex(artifact.data);

        const page = await createPage(browser);
        await setupNetworkBlocking(page);

        // Collect console messages for debug
        page.on('console', (msg) => {
          consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
        });

        try {
          let rendered: string;

          switch (block.renderIntent) {
            case 'vega':
            case 'map': {
              rendered = await getOrRenderVisual({
                sourceArtifactHash: sourceHash,
                rendererVersions,
                format: 'svg',
                renderFn: async () => {
                  const spec = JSON.parse(artifact.data);
                  return renderVegaToSvg(spec, page, 20_000);
                },
              });
              break;
            }

            case 'image': {
              const mimeType = artifact.mimeType || 'image/png';
              const data = artifact.data;
              if (data.startsWith('data:')) {
                rendered = `<img src="${data}" alt="${artifact.name}" style="max-width:100%">`;
              } else {
                rendered = `<img src="data:${mimeType};base64,${data}" alt="${artifact.name}" style="max-width:100%">`;
              }
              break;
            }

            case 'dataset_preview': {
              const maxRows = block.options?.maxRows ?? 20;
              rendered = renderDatasetPreview(artifact.data, maxRows, artifact.mimeType);
              break;
            }

            case 'json_document': {
              rendered = renderJsonDocument(artifact.data);
              break;
            }

            case 'text_document': {
              rendered = renderTextDocument(artifact.data);
              break;
            }

            case 'html_snapshot': {
              rendered = await getOrRenderVisual({
                sourceArtifactHash: sourceHash,
                rendererVersions,
                format: 'png',
                renderFn: async () => {
                  const pngDataUrl = await renderHtmlToPng(artifact.data, page, 20_000);
                  return pngDataUrl;
                },
              });
              // Wrap cached data URL in img tag if not already
              if (rendered.startsWith('data:')) {
                rendered = `<img src="${rendered}" alt="${artifact.name}" style="max-width:100%">`;
              }
              break;
            }

            default:
              rendered = `<p><em>Unsupported render intent: ${block.renderIntent}</em></p>`;
          }

          blockRenderings.set(key, rendered);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[runExportJob] Failed to render artifact ${block.artifactId}:`, msg);
          blockRenderings.set(
            key,
            `<p style="color:#dc2626"><em>Render error: ${msg}</em></p>`,
          );
          allWarnings.push(`Render failed for ${block.artifactId}: ${msg}`);
        } finally {
          await page.close();
        }
      }

      // Collect network warnings
      const networkWarnings = drainNetworkWarnings();
      allWarnings.push(...networkWarnings);
      blockedRequests.push(...networkWarnings);

      // Log cache stats
      const cacheStats = getCacheStats();
      console.log(`[runExportJob] Render cache: ${cacheStats.hits} hits, ${cacheStats.misses} misses`);

      // ================================================================
      // 9. Assemble HTML
      // ================================================================
      await updateJobPhase(jobId, 'rendering', { progress: 70 });

      assembledHtml = assembleReportHtml(
        reportSpec,
        blockRenderings,
        reportSpec.theme,
        artifacts,
      );

      // ================================================================
      // 10. Generate PDF via Puppeteer
      // ================================================================
      const pdfPage = await createPage(browser);
      await pdfPage.setContent(assembledHtml, { waitUntil: 'load', timeout: 30_000 });
      await pdfPage.emulateMediaType('print');

      const margins = reportSpec.theme.margins;
      // Convert points to inches (1pt = 1/72in) — Puppeteer only supports px/in/cm/mm
      const ptToIn = (pt: number) => `${(pt / 72).toFixed(4)}in`;
      const headerTemplate = buildChromeTemplate(reportSpec.options?.header, DEFAULT_HEADER);
      const footerDefaults: Required<ReportChromeSlot> = {
        ...DEFAULT_FOOTER,
        right: isVisibleBranding(reportSpec.options?.branding)
          ? formatBrandingLine(reportSpec.options?.branding)
          : '',
      };
      const footerTemplate = buildChromeTemplate(reportSpec.options?.footer, footerDefaults);
      const displayHeaderFooter = headerTemplate !== EMPTY_CHROME_TEMPLATE || footerTemplate !== EMPTY_CHROME_TEMPLATE;
      const pdfBuffer = Buffer.from(await pdfPage.pdf({
        format: reportSpec.theme.pageSize === 'LETTER' ? 'Letter' : 'A4',
        landscape: reportSpec.theme.landscape === true,
        margin: {
          top: ptToIn(margins.top),
          right: ptToIn(margins.right),
          bottom: ptToIn(margins.bottom),
          left: ptToIn(margins.left),
        },
        displayHeaderFooter,
        headerTemplate,
        footerTemplate,
        printBackground: true,
      }));

      await pdfPage.close();

      await updateJobPhase(jobId, 'rendering', { progress: 85 });

      // ================================================================
      // 11. Content-address PDF
      // ================================================================
      const pdfHash = sha256Hex(pdfBuffer);

      // ================================================================
      // 12. Store PDF in Cloud Storage (idempotent)
      // ================================================================
      const bucket = getExportBucket();
      const pdfPath = `exports/pdf/${pdfHash}.pdf`;
      const pdfFile = bucket.file(pdfPath);

      const [exists] = await pdfFile.exists();
      if (!exists) {
        await pdfFile.save(pdfBuffer, {
          contentType: 'application/pdf',
          metadata: {
            cacheControl: 'public, max-age=31536000, immutable',
          },
        });
        console.log(`[runExportJob] Stored PDF at ${pdfPath}`);
      } else {
        console.log(`[runExportJob] PDF already exists at ${pdfPath} (idempotent)`);
      }

      // ================================================================
      // 13. Generate signed URL (7-day expiry)
      // ================================================================
      const [downloadUrl] = await pdfFile.getSignedUrl({
        action: 'read',
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
      });

      // ================================================================
      // 14. Build provenance manifest
      // ================================================================
      const inputArtifacts: ProvenanceInputArtifact[] = [];
      for (const [id, art] of artifacts) {
        inputArtifacts.push({
          id,
          type: art.type,
          hash: sha256Hex(art.data),
        });
      }

      const manifest = generateManifest(
        specArtifact.id,
        reportSpecHash,
        inputArtifacts,
        puppeteerVersion,
        chromiumVersion,
        allWarnings,
      );

      // ================================================================
      // 15. Sign + store provenance
      // ================================================================
      const { json: provenanceJson, signature: provenanceSig } = signManifest(
        manifest,
        hmacSecret,
      );
      const provenanceHash = sha256Hex(provenanceJson);

      await storeProvenance(pdfHash, provenanceJson, provenanceSig);

      // ================================================================
      // 16. Create document_pdf artifact in Firestore
      // ================================================================
      const pdfArtifactId = `document_pdf_${pdfHash.slice(0, 12)}`;
      const brandingRecord = shouldWriteBrandingMetadata(reportSpec.options?.branding)
        ? createArtifactBrandingRecord(reportSpec.options?.branding)
        : undefined;
      await db
        .collection('users')
        .doc(createdBy)
        .collection('conversations')
        .doc(sessionId)
        .collection('artifacts')
        .doc(pdfArtifactId)
        .set({
          id: pdfArtifactId,
          cellId: 'export',
          sessionId,
          name: `${reportSpec.title || 'Report'}.pdf`,
          type: 'document_pdf',
          mimeType: 'application/pdf',
          data: '',
          createdAt: Date.now(),
          metadata: {
            pdfHash,
            provenanceHash,
            storagePath: pdfPath,
            downloadUrl,
            reportSpecArtifactId,
            exportJobId: jobId,
            ...(brandingRecord ? { branding: brandingRecord } : {}),
          },
          profile: 'ARCHIVE_PORTABLE',
          provenance: {
            generator: 'export-pipeline',
            generatorVersion: '1.0.0',
            inputs: [reportSpecArtifactId, ...Array.from(artifacts.keys())],
          },
        });

      // ================================================================
      // 17. Update phase → completed
      // ================================================================
      await updateJobPhase(jobId, 'completed', {
        progress: 100,
        downloadUrl,
        outputArtifactId: pdfArtifactId,
        outputArtifactType: 'document_pdf',
        pdfHash,
        provenanceHash,
      });

      console.log(
        `[runExportJob] Job ${jobId} completed. PDF: ${pdfHash} | ` +
        `Cache: ${cacheStats.hits}h/${cacheStats.misses}m`,
      );
      res.status(200).json({
        status: 'completed',
        jobId,
        pdfHash,
        downloadUrl,
        outputArtifactId: pdfArtifactId,
        outputArtifactType: 'document_pdf',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[runExportJob] Job ${jobId} failed:`, msg);

      // Store debug bundle for admin diagnostics
      await storeDebugBundle(jobId, {
        assembledHtml: assembledHtml || undefined,
        blockedRequests,
        consoleMessages,
        error: msg,
      });

      try {
        await updateJobPhase(jobId, 'failed', { error: msg });
      } catch (updateErr) {
        console.error('[runExportJob] Failed to update job phase:', updateErr);
      }

      res.status(500).json({ error: msg });
    } finally {
      // ================================================================
      // 18. Cleanup
      // ================================================================
      await closeBrowser(browser);
    }
  },
);
