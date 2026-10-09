/**
 * Stream Completed Handler — the Analyze capture pipeline.
 *
 * Ported from symposium-ai-web src/context/analyze/streamCompletedHandler.ts
 * (Phase 3 Step 3). The capture logic is unchanged; only its browser shell is
 * replaced:
 *  - persistArtifact dispatches ADD_ARTIFACT and nothing else. The server
 *    applies the collected actions to Firestore (captureRound.ts); there is no
 *    IndexedDB copy, cloud-sync state machine or toast, and thumbnails are made
 *    by the client the first time an artifact is shown (Phase 3 decision 4).
 *  - Artifact ids derive from the round's message id instead of the clock, so
 *    a redelivered step rewrites the same docs. Timestamps come from deps.now().
 *  - The two setTimeout hops that waited for React state to flush run inline:
 *    the server's getState reflects every dispatch immediately.
 *  - Sync gating (shouldSync / canSyncCloudArtifacts / getUserId) is gone; the
 *    server always writes (Phase 3 decision 2).
 */

import type { Message, MessageMetadata, ToolResultProvenance } from '../contract/types';
import type { AnalyzeOutputSelection } from '../contract/types/analyze';
import type { Artifact, BundleManifest } from '../contract/types/notebook';
import {
  deriveArtifactLineage,
  isReportMaterialArtifact,
  withArtifactPreviewMetadata,
} from './artifacts';
import type { ArtifactLineageFields } from './artifacts';
import { detectBundle, type BundleDetectionResult } from './BundleDetectionService';
import { inlineBundlePage } from '../contract/services/artifacts/InlineBundlerService';
import { repairModelAuthoredHtml } from '../contract/services/artifacts/htmlProfiles';
import { isTabularArtifact, parseArtifactRows } from '../contract/services/analyze/dataset/SessionWorkbookManager';
import type { SessionWorkbookManager } from '../contract/services/analyze/dataset/SessionWorkbookManager';
import {
  normalizeAnalysisArtifactSpecCandidate,
  tryParseAnalysisArtifactSpecText,
  validateAnalysisArtifactSpec,
} from '../contract/services/analyze/artifacts/AnalysisArtifactSpecService';
import { injectSourceProvenance } from './sourceProvenanceInjection';
import { injectTeamPanelNote, type TeamPanelRecord } from './teamPanelNote';
import { decodeBase64ToUtf8 } from '../contract/lib/encoding/utf8Base64';
import { normalizeRequestSalesforceOrgEvidenceArgs } from '../engine/tools/executeRequestSalesforceOrgEvidenceTool';
import type { AnalyzeAction } from './types';
import {
  sanitizeToolCallIdForFetchPath,
  parseExecutePythonCodeFromToolCall,
  extractFetchSourceKeysFromCode,
  dedupeProvenanceSources,
  buildArtifactProvenance,
  classifyHtmlLikeArtifact,
  injectProvenanceSourcesSection,
  isTabularJsonArray,
} from './helpers';

// ============================================================================
// Types
// ============================================================================

export interface StreamCompletedDeps {
  dispatch: (action: AnalyzeAction) => void;
  getState: () => {
    artifacts: Artifact[];
    outputSelection: AnalyzeOutputSelection;
    currentSession: { id: string } | null;
    messages: Message[];
  };
  /** Clock for createdAt / requestedAt and the timestamped default names. */
  now: () => number;
  persistMessage: (message: Message) => void;
  getFetchProvenanceMap: () => Map<string, ToolResultProvenance>;
  /** The independent panel this turn ran, if any (from the turn's sub-agent runs). */
  getTeamPanel?: () => TeamPanelRecord | null;
  setFetchProvenanceMap: (map: Map<string, ToolResultProvenance>) => void;
  setLatestCompletedOperatorMessageId: (id: string | null) => void;
  /** A valid report spec was captured this turn (gates auto-review). */
  markReportProduced?: () => void;
  getSessionWorkbookManager: () => SessionWorkbookManager;
}

export interface StreamCompletedEventData {
  messageId: string;
  /** The app replaced an empty operator reply with a notice (see MessageMetadata.appNotice). */
  appNotice?: MessageMetadata['appNotice'];
  /** Team mode was on but the operator answered without a team plan. */
  teamModeSkipped?: boolean;
  /** The reply stopped at the model's output limit. */
  outputLimitReached?: boolean;
  finalContent: string;
  toolCalls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  toolExecutionResults?: Array<{
    toolName: string;
    content?: string;
    error?: string;
    success: boolean;
    images?: Array<{ mimeType: string; base64: string }>;
    htmlOutputs?: Array<{ content: string; filename?: string }>;
    dataOutputs?: Array<{ filename: string; base64: string; size: number }>;
    bundleOutputs?: Array<{ name?: string; manifest: BundleManifest; sourceFiles: string[] }>;
    provenance?: ToolResultProvenance;
  }>;
}

// ============================================================================
// Artifact Persistence Helper
// ============================================================================

function getPersistErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Record the artifact (with its preview metadata) in capture state. The server
 * writes the collected artifacts after the pipeline returns.
 */
function persistArtifact(
  artifact: Artifact,
  _sessionId: string,
  deps: Pick<StreamCompletedDeps, 'dispatch'>,
): void {
  deps.dispatch({ type: 'ADD_ARTIFACT', payload: withArtifactPreviewMetadata(artifact) });
}

// ============================================================================
// Bundle Pre-processing
// ============================================================================

interface BundlePreprocessResult {
  bundleResultsMap: Map<number, BundleDetectionResult>;
  crossExecBundle: BundleDetectionResult | null;
  crossExecBundledFilenames: Set<string>;
  processedToolExecutionResults: StreamCompletedEventData['toolExecutionResults'];
}

function preprocessBundles(
  toolExecutionResults: NonNullable<StreamCompletedEventData['toolExecutionResults']>,
): BundlePreprocessResult {
  const bundleResultsMap = new Map<number, BundleDetectionResult>();
  let crossExecBundle: BundleDetectionResult | null = null;
  const crossExecBundledFilenames = new Set<string>();
  let processedToolExecutionResults: StreamCompletedEventData['toolExecutionResults'] = toolExecutionResults;

  // Step 1: Aggregate all HTML + data outputs across all executions
  const allHtml: Array<{ content: string; filename: string }> = [];
  const allData: Array<{ filename: string; base64: string; size: number }> = [];

  for (const result of toolExecutionResults) {
    for (const h of (result.htmlOutputs || [])) {
      if (h.filename) allHtml.push(h as { content: string; filename: string });
    }
    for (const d of (result.dataOutputs || [])) {
      allData.push(d);
    }
  }

  // Step 2: Run bundle detection on the aggregate
  let aggregateBundle: BundleDetectionResult | null = null;
  if (allHtml.length > 0 && allHtml.length + allData.length >= 2) {
    const bundle = detectBundle({ htmlOutputs: allHtml, dataOutputs: allData });
    if (bundle.shouldBundle && bundle.manifest) {
      aggregateBundle = bundle;
    }
  }

  if (aggregateBundle?.manifest) {
    const bundledFilenames = new Set(Object.keys(aggregateBundle.manifest.files));

    if (toolExecutionResults.length === 1) {
      // Single execution: store as per-execution bundle (original behavior)
      bundleResultsMap.set(0, aggregateBundle);
    } else {
      // Multiple executions: store as cross-execution bundle
      crossExecBundle = aggregateBundle;
      for (const fn of bundledFilenames) {
        crossExecBundledFilenames.add(fn);
      }
    }

    // Inline CSS/JS into bundled HTML for CellOutput rendering
    processedToolExecutionResults = toolExecutionResults.map((result) => {
      const inlinedHtml = (result.htmlOutputs || []).map(h => {
        if (h.filename && bundledFilenames.has(h.filename)) {
          return {
            content: inlineBundlePage(aggregateBundle!.manifest!, h.filename),
            filename: h.filename,
          };
        }
        return h;
      });
      return { ...result, htmlOutputs: inlinedHtml };
    });
  }

  return {
    bundleResultsMap,
    crossExecBundle,
    crossExecBundledFilenames,
    processedToolExecutionResults,
  };
}

// ============================================================================
// MIME Type Map
// ============================================================================

const MIME_MAP: Record<string, string> = {
  'csv': 'text/csv',
  'json': 'application/json',
  'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'xls': 'application/vnd.ms-excel',
  'tsv': 'text/tab-separated-values',
  'parquet': 'application/octet-stream',
  'pdf': 'application/pdf',
  'png': 'image/png',
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'gif': 'image/gif',
  'webp': 'image/webp',
  'svg': 'image/svg+xml',
  'txt': 'text/plain',
  'md': 'text/markdown',
  'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'rtf': 'application/rtf',
  'html': 'text/html',
  'htm': 'text/html',
  'log': 'text/plain',
};

type SalesforceRole = NonNullable<NonNullable<Artifact['metadata']>['salesforceRole']>;

function getSalesforceArtifactType(filename: string): Artifact['type'] | null {
  const normalized = filename.toLowerCase();
  if (normalized.includes('salesforce-component-index')) return 'salesforce_component_index';
  if (normalized.includes('salesforce-dependency-map')) return 'salesforce_dependency_map';
  if (normalized.includes('salesforce-vscode-handoff')) return 'salesforce_vscode_handoff';
  if (
    normalized.includes('salesforce-metadata-audit-report')
    || normalized.includes('salesforce-remediation-backlog')
    || normalized.includes('salesforce-signal-evidence')
    || normalized.includes('salesforce-evidence-ledger')
    || normalized.includes('salesforce-flow-drilldowns')
    || normalized.includes('salesforce-apex-drilldowns')
    || normalized.includes('salesforce-feature-reference-map')
    || normalized.includes('salesforce-workbench-summary')
    || normalized.includes('salesforce-feature-readiness-brief')
    || normalized.includes('salesforce-troubleshooting-brief')
    || normalized.includes('salesforce-executive-brief')
    || normalized.includes('salesforce-insight-packets')
    || normalized.includes('salesforce-doc-topics')
    || normalized.includes('salesforce-doc-evidence')
    || normalized.includes('salesforce-stakeholder-visual-artifacts')
    || normalized.includes('artifact-manifest')
  ) {
    return 'salesforce_audit_report';
  }
  return null;
}

function getSalesforceArtifactRole(filename: string): SalesforceRole | undefined {
  const normalized = filename.toLowerCase();
  if (normalized.includes('artifact-manifest')) return 'artifact_manifest';
  if (normalized.includes('salesforce-component-index')) return 'component_index';
  if (normalized.includes('salesforce-dependency-map')) return 'dependency_map';
  if (normalized.includes('salesforce-metadata-audit-report')) return 'audit_report';
  if (normalized.includes('salesforce-remediation-backlog')) return 'remediation_backlog';
  if (normalized.includes('salesforce-signal-evidence')) return 'signal_evidence';
  if (normalized.includes('salesforce-evidence-ledger')) return 'evidence_ledger';
  if (normalized.includes('salesforce-flow-drilldowns')) return 'flow_drilldowns';
  if (normalized.includes('salesforce-apex-drilldowns')) return 'apex_drilldowns';
  if (normalized.includes('salesforce-feature-reference-map')) return 'feature_reference_map';
  if (normalized.includes('salesforce-workbench-summary')) return 'workbench_summary';
  if (normalized.includes('salesforce-insight-packets')) return 'insight_packets';
  if (normalized.includes('salesforce-doc-topics')) return 'documentation_topics';
  if (normalized.includes('salesforce-doc-evidence')) return 'documentation_evidence';
  if (normalized.includes('salesforce-artifact-schema')) return 'artifact_schema';
  if (normalized.includes('salesforce-stakeholder-visual-artifacts')) return 'stakeholder_visual_plan';
  if (normalized.includes('salesforce-executive-brief')) return 'executive_brief';
  if (normalized.includes('salesforce-feature-readiness-brief')) return 'feature_readiness_brief';
  if (normalized.includes('salesforce-troubleshooting-brief')) return 'troubleshooting_brief';
  if (normalized.includes('salesforce-vscode-handoff')) return 'vscode_handoff';
  return undefined;
}

function isSalesforceArtifactType(type: Artifact['type']): boolean {
  return type === 'salesforce_audit_report'
    || type === 'salesforce_component_index'
    || type === 'salesforce_dependency_map'
    || type === 'salesforce_vscode_handoff';
}

function getSalesforceLensIdsForOperation(operation: string | undefined): string[] {
  switch (operation) {
    case 'troubleshooting':
      return ['salesforce_troubleshooting'];
    case 'dependencies':
      return ['salesforce_dependency_impact'];
    case 'risks':
      return ['salesforce_access_governance'];
    case 'handoff':
      return ['salesforce_engineering_handoff'];
    case 'feature_readiness':
      return ['salesforce_feature_readiness'];
    case 'packet_findings':
      return ['salesforce_packet_findings'];
    case 'inventory':
    case 'search':
    case 'component':
    case 'audit':
    default:
      return ['salesforce_stakeholder_audit'];
  }
}

function getSalesforceOperationFromToolCall(
  toolCall: NonNullable<StreamCompletedEventData['toolCalls']>[number] | undefined,
): string | undefined {
  if (!toolCall?.function.arguments) return undefined;
  try {
    const args = JSON.parse(toolCall.function.arguments) as { operation?: unknown };
    return typeof args.operation === 'string' ? args.operation : undefined;
  } catch {
    return undefined;
  }
}

function getSelectedSalesforceLensIdsForMessage(messages: Message[], messageId: string): string[] {
  const messageIndex = messages.findIndex((message) => message.id === messageId);
  const priorMessages = messageIndex >= 0
    ? messages.slice(0, messageIndex)
    : messages;
  const lensSourceMessage = [...priorMessages].reverse().find((message) => (
    Array.isArray(message.metadata?.selectedAnalysisLensIds)
    && message.metadata.selectedAnalysisLensIds.some((lensId) => lensId.startsWith('salesforce_'))
  ));

  return lensSourceMessage?.metadata?.selectedAnalysisLensIds?.filter((lensId) => (
    lensId.startsWith('salesforce_')
  )) || [];
}

function shouldPersistSalesforcePacketArtifacts(outputSelection: AnalyzeOutputSelection): boolean {
  if (outputSelection.mode !== 'portable') return false;
  return outputSelection.portable.formats.some((format) => (
    format === 'json' || format === 'md' || format === 'txt'
  ));
}

function isHtmlDataOutput(data: { filename: string }): boolean {
  const ext = data.filename.split('.').pop()?.toLowerCase() || '';
  return ext === 'html' || ext === 'htm';
}

function hasHtmlLikeOutputForResult(
  result: NonNullable<StreamCompletedEventData['toolExecutionResults']>[number],
  bundleResult: BundleDetectionResult | null,
): boolean {
  return Boolean(
    bundleResult?.shouldBundle
    || (result.bundleOutputs?.length || 0) > 0
    || (result.htmlOutputs?.length || 0) > 0
    || (result.dataOutputs || []).some(isHtmlDataOutput),
  );
}

function hasStructuredReportDeliverable(
  toolExecutionResults: NonNullable<StreamCompletedEventData['toolExecutionResults']>,
): boolean {
  // The deliverable is the structured report: a valid `analysis_artifact_spec`
  // among the run's JSON outputs. When one exists it IS the output, and the run's
  // figures/datasets/HTML become hidden report-material backing it. An invalid or
  // absent spec is a model failure — don't suppress, or the user is left with
  // nothing. (Provider/format-agnostic: we detect the spec by parsing, not by mode.)
  return toolExecutionResults.some((result) => (
    (result.dataOutputs || []).some((output) => {
      if (!output.filename?.toLowerCase().endsWith('.json')) return false;
      let decoded: string;
      try { decoded = decodeBase64ToUtf8(output.base64); } catch { decoded = output.base64; }
      return tryParseAnalysisArtifactSpecText(decoded) !== null;
    })
  ));
}

/**
 * For JSON that claims `kind: "analysis_artifact_spec"` yet fails strict
 * validation, return the concrete validation errors (capped); null when the
 * content is not JSON, does not claim to be a spec, or actually validates.
 */
function getDeclaredSpecValidationErrors(decodedText: string): string[] | null {
  let candidate: unknown;
  try {
    candidate = JSON.parse(decodedText);
  } catch {
    return null;
  }
  if (!candidate || typeof candidate !== 'object') return null;
  if ((candidate as { kind?: unknown }).kind !== 'analysis_artifact_spec') return null;
  const validation = validateAnalysisArtifactSpec(normalizeAnalysisArtifactSpecCandidate(candidate));
  if (validation.success) return null;
  const MAX_REPORTED = 10;
  const errors = validation.errors.slice(0, MAX_REPORTED);
  if (validation.errors.length > MAX_REPORTED) {
    errors.push(`…and ${validation.errors.length - MAX_REPORTED} more`);
  }
  return errors;
}

/**
 * A 'data' artifact that DECLARED itself an analysis_artifact_spec but failed
 * validation when captured (the "Check output" case). A later validated save of
 * the same file supersedes it — it was never a report version worth keeping.
 */
function isSunkDeclaredSpecArtifact(artifact: Artifact): boolean {
  if (artifact.type !== 'data' || !artifact.data || artifact.data.startsWith('__')) return false;
  try {
    return decodeBase64ToUtf8(artifact.data).includes('"analysis_artifact_spec"');
  } catch {
    return artifact.data.includes('"analysis_artifact_spec"');
  }
}

/**
 * Latest spec artifact in the session whose report TITLE matches — the lineage
 * a renamed deliverable file should version into. Title read is a plain JSON
 * parse (spec artifacts store validated JSON text; no need to re-validate).
 */
function latestSpecArtifactWithTitle(existingArtifacts: Artifact[], title: string): Artifact | null {
  const wanted = title.trim();
  if (!wanted) return null;
  let latest: Artifact | null = null;
  for (const artifact of existingArtifacts) {
    if (artifact.type !== 'analysis_artifact_spec' || typeof artifact.data !== 'string') continue;
    let candidateTitle: unknown;
    try {
      candidateTitle = (JSON.parse(artifact.data) as { title?: unknown }).title;
    } catch {
      continue;
    }
    if (typeof candidateTitle !== 'string' || candidateTitle.trim() !== wanted) continue;
    if (
      !latest
      || (artifact.metadata?.versionNumber ?? 1) > (latest.metadata?.versionNumber ?? 1)
      || ((artifact.metadata?.versionNumber ?? 1) === (latest.metadata?.versionNumber ?? 1)
        && artifact.createdAt > latest.createdAt)
    ) {
      latest = artifact;
    }
  }
  return latest;
}

function removeExistingArtifactByName(
  name: string,
  type: Artifact['type'],
  existingArtifacts: Artifact[],
  deps: StreamCompletedDeps,
): void {
  const existingArtifactsByName = existingArtifacts.filter((artifact) => (
    artifact.type === type && artifact.name === name
  ));
  for (const existing of existingArtifactsByName) {
    deps.dispatch({ type: 'REMOVE_ARTIFACT', payload: existing.id });
  }
}

function bundleArtifactName(entryPoint: string): string {
  return `bundle-${entryPoint.replace(/[\\/]+/g, '-')}`;
}

function reportArtifactGroupId(messageId: string): string {
  return `rich-report-${messageId}`;
}

function isScratchMaterialFilename(filename: string): boolean {
  const normalized = filename.toLowerCase();
  return /(^|[-_.])(scratch|debug|tmp|temp|diagnostic|diagnostics|helper|intermediate|working|raw)([-_.]|$)/.test(normalized);
}

function getReportMaterialRole(
  artifactType: Artifact['type'],
  mimeType: string,
  filename: string,
): NonNullable<NonNullable<Artifact['metadata']>['reportMaterialRole']> | null {
  if (artifactType === 'analysis_artifact_spec') return 'structured_source';
  if (artifactType === 'image') return 'visual';
  // Interactive HTML the model authored for an `embedded_html` report block: kept
  // as hidden backing so the report (the deliverable) can render it sandboxed.
  if (artifactType === 'html') return 'visual';
  if (artifactType === 'table') return 'table';
  if (artifactType === 'dataset') return 'dataset';
  if (mimeType === 'text/csv' || mimeType === 'text/tab-separated-values') return 'dataset';
  if (mimeType.includes('spreadsheet') || mimeType.includes('ms-excel')) return 'dataset';
  if (mimeType === 'application/json') return 'source_evidence';
  if (mimeType === 'text/markdown' || mimeType === 'text/plain') return 'text_extract';
  if (filename.toLowerCase().endsWith('.md')) return 'text_extract';
  if (isSalesforceArtifactType(artifactType)) return 'source_evidence';
  return null;
}

function shouldRetainReportMaterial(
  artifactType: Artifact['type'],
  mimeType: string,
  filename: string,
): boolean {
  if (isScratchMaterialFilename(filename)) return false;
  return getReportMaterialRole(artifactType, mimeType, filename) !== null;
}

function reportMaterialMetadata(
  metadata: Artifact['metadata'],
  role: NonNullable<NonNullable<Artifact['metadata']>['reportMaterialRole']>,
  artifactGroupId: string | undefined,
  sourceOutputArtifactId?: string,
): Artifact['metadata'] {
  return {
    ...metadata,
    ...(artifactGroupId ? { artifactGroupId } : {}),
    artifactDisposition: 'report_material',
    reportMaterialRole: role,
    ...(sourceOutputArtifactId ? { sourceOutputArtifactId } : {}),
  };
}

// ============================================================================
// Image Artifact Extraction
// ============================================================================

/**
 * Validate HTML artifact content for unambiguous corruption before persistence.
 *
 * Intentionally conservative — we only flag content that genuinely cannot render
 * (empty/whitespace). We never block or drop the artifact; the report is attached
 * as metadata so the UI can warn, and the user keeps their work.
 */
function validateHtmlArtifactContent(content: string): { valid: boolean; errors: string[] } {
  if (!content || !content.trim()) {
    return { valid: false, errors: ['Empty HTML content — this artifact has nothing to render.'] };
  }
  return { valid: true, errors: [] };
}

function extractImageArtifacts(
  images: Array<{ mimeType: string; base64: string }>,
  ctx: {
    messageId: string;
    sessionId: string;
    execIndex: number;
    outputImageDataKeys: Set<string>;
    existingArtifacts: Artifact[];
    artifactProvenance: Artifact['provenance'];
    reportMaterialGroupId?: string;
    sourceOutputArtifactId?: string;
  },
  deps: StreamCompletedDeps,
): Artifact[] {
  const created: Artifact[] = [];

  images.forEach((img, imgIndex) => {
    const imageKey = img.base64.slice(-100);
    if (ctx.outputImageDataKeys.has(imageKey)) return;

    const isDuplicate = ctx.existingArtifacts.some(
      a => a.type === 'image' && a.data.slice(-100) === imageKey
    );
    if (isDuplicate) return;

    const artifact: Artifact = {
      id: `artifact-img-${ctx.messageId}-${ctx.execIndex}-${imgIndex}`,
      cellId: ctx.messageId,
      sessionId: ctx.sessionId,
      name: `chart-${deps.now()}-${imgIndex + 1}.png`,
      type: 'image',
      mimeType: img.mimeType,
      data: img.base64,
      createdAt: deps.now(),
      metadata: ctx.reportMaterialGroupId
        ? reportMaterialMetadata(undefined, 'visual', ctx.reportMaterialGroupId, ctx.sourceOutputArtifactId)
        : undefined,
      provenance: ctx.artifactProvenance,
    };
    created.push(artifact);
    persistArtifact(artifact, ctx.sessionId, deps);
  });

  return created;
}

// ============================================================================
// HTML Artifact Extraction
// ============================================================================

function extractHtmlArtifacts(
  htmlsToProcess: Array<{ content: string; filename?: string }>,
  ctx: {
    messageId: string;
    sessionId: string;
    outputSelection: AnalyzeOutputSelection;
    execIndex: number;
    existingArtifacts: Artifact[];
    artifactProvenance: Artifact['provenance'];
    reportMaterialGroupId?: string;
    sourceOutputArtifactId?: string;
  },
  deps: StreamCompletedDeps,
): Artifact[] {
  const created: Artifact[] = [];

  htmlsToProcess.forEach((html, htmlIndex) => {
    // Guarantee a provenance-derived Sources section app-side when the deliverable
    // used fetched data but the operator omitted citations. Done before dedup/
    // classification so the stored content and policy report reflect the section.
    // Strip hallucinated SRI `integrity` hashes so the stored HTML isn't self-blocking (a wrong
    // hash makes the browser refuse the resource, e.g. leaflet.css → scattered map tiles). Applied
    // at creation so downloads, exports, and every render inherit clean, loadable HTML.
    const content = repairModelAuthoredHtml(
      injectProvenanceSourcesSection(html.content, ctx.artifactProvenance?.sources),
    );
    // Skip only a byte-identical re-capture — NOT a regeneration. The old
    // last-100-chars fingerprint collided on every HTML (they all end in the same
    // closing tags), so an edited report was silently dropped instead of replacing
    // the prior one. Compare full content so a real revision flows through.
    const isDuplicate = ctx.existingArtifacts.some(
      a => a.type === 'html' && a.data === content
    );
    if (isDuplicate) return;

    // Regenerating a same-filename HTML becomes a new version: keep the prior and
    // tag the new one with lineage so the UI can collapse them to the latest.
    const existingByName = html.filename
      ? ctx.existingArtifacts.find(a => a.type === 'html' && a.name === html.filename)
      : undefined;
    const lineage: ArtifactLineageFields | undefined = existingByName
      ? deriveArtifactLineage(existingByName, ctx.existingArtifacts)
      : undefined;

    const htmlClassification = classifyHtmlLikeArtifact('html', content, ctx.outputSelection, {
      provenanceSources: ctx.artifactProvenance?.sources || [],
    });
    const htmlValidation = validateHtmlArtifactContent(content);
    const baseMeta: Artifact['metadata'] = {
      ...(htmlValidation.valid ? {} : { validationReport: htmlValidation }),
      ...(lineage ?? {}),
    };
    // When a structured report is the deliverable, an authored HTML component (e.g. an
    // embedded_html map) is hidden report-material that backs the report — it renders
    // inside the report, never as a standalone visible output.
    const metadata = ctx.reportMaterialGroupId
      ? reportMaterialMetadata(baseMeta, 'visual', ctx.reportMaterialGroupId, ctx.sourceOutputArtifactId)
      : baseMeta;
    const artifact: Artifact = {
      id: `artifact-html-${ctx.messageId}-${ctx.execIndex}-${htmlIndex}`,
      cellId: ctx.messageId,
      sessionId: ctx.sessionId,
      name: html.filename || `interactive-chart-${deps.now()}-${htmlIndex + 1}.html`,
      type: 'html',
      mimeType: 'text/html',
      data: content,
      createdAt: deps.now(),
      profile: htmlClassification.profile,
      provenance: ctx.artifactProvenance,
      policyReport: htmlClassification.policyReport,
      ...(metadata && Object.keys(metadata).length > 0 ? { metadata } : {}),
    };
    created.push(artifact);
    persistArtifact(artifact, ctx.sessionId, deps);
  });

  return created;
}

// ============================================================================
// Data Artifact Extraction
// ============================================================================

function extractDataArtifacts(
  datasToProcess: Array<{ filename: string; base64: string; size: number }>,
  ctx: {
    messageId: string;
    sessionId: string;
    outputSelection: AnalyzeOutputSelection;
    execIndex: number;
    existingArtifacts: Artifact[];
    artifactProvenance: Artifact['provenance'];
    htmlArtifactProvenance?: Artifact['provenance'];
    salesforceArtifactGroupId?: string;
    salesforceLensIds?: string[];
    suppressSalesforcePacketArtifacts?: boolean;
    suppressSalesforceIncidentalTextArtifacts?: boolean;
    // General intent-gated surfacing: when the user asked for a Rich HTML
    // deliverable and one was produced, only the HTML site is surfaced. Any
    // data/dataset/image files generated along the way stay as internal
    // /output scratch and are NOT promoted to user-facing artifacts. Applies
    // to every use case (not just Salesforce); the deliverable itself (html /
    // analysis_artifact_spec) is exempt.
    suppressNonDeliverableData?: boolean;
    reportMaterialGroupId?: string;
    sourceOutputArtifactId?: string;
  },
  deps: StreamCompletedDeps,
): Artifact[] {
  const created: Artifact[] = [];
  const seenFilenames = new Set<string>();

  datasToProcess.forEach((data, dataIndex) => {
    if (seenFilenames.has(data.filename)) return;
    seenFilenames.add(data.filename);

    const ext = data.filename.split('.').pop()?.toLowerCase() || '';
    const mimeType = MIME_MAP[ext] || 'application/octet-stream';
    const salesforceRole = getSalesforceArtifactRole(data.filename);
    const existingByName = ctx.existingArtifacts.find(a => a.name === data.filename);
    if (salesforceRole && ctx.suppressSalesforcePacketArtifacts) {
      if (existingByName) {
        deps.dispatch({ type: 'REMOVE_ARTIFACT', payload: existingByName.id });
      }
      return;
    }
    if (
      ctx.suppressSalesforceIncidentalTextArtifacts
      && !salesforceRole
      && mimeType === 'text/plain'
    ) {
      if (existingByName) {
        deps.dispatch({ type: 'REMOVE_ARTIFACT', payload: existingByName.id });
      }
      return;
    }

    // Full-content comparison (not a last-100-chars fingerprint) so a regenerated
    // same-name file is recognized as new content and replaces the prior one.
    const isDuplicate = ctx.existingArtifacts.some(
      a => a.name === data.filename && a.data === data.base64
    );
    // When suppressing rich intermediates, a byte-identical re-emission of a
    // prior-turn intermediate must NOT take the duplicate shortcut — otherwise
    // a CSV/image first surfaced in an earlier no-HTML turn would stay visible
    // even though THIS turn produced the single HTML deliverable. Fall through
    // so the stale artifact is removed below and the suppression check drops it.
    if (isDuplicate && !ctx.suppressNonDeliverableData) return;

    // Spec detection must precede lineage: a validated report spec's version
    // chain is what keeps the Reports tab at ONE row per report. Parsed here
    // once and reused below where the artifact type is assigned.
    const decodedTextData = (() => {
      try { return decodeBase64ToUtf8(data.base64); } catch { return data.base64; }
    })();
    const analysisSpec = mimeType === 'application/json'
      ? tryParseAnalysisArtifactSpecText(decodedTextData)
      : null;

    // Regenerating a same-filename file becomes a new version (keep the prior and
    // tag the new one with lineage). In a Rich run a same-name prior is usually a
    // stale intermediate (remove it) — EXCEPT a structured report spec, which is
    // the deliverable: a same-name re-write is a conversational edit, so keep the
    // prior as a revertable version (matches the inline editor's versioning).
    //
    // For a VALIDATED spec, two extra continuity rules keep one report = one row
    // (a live session ended with three same-title Reports rows without them):
    //  1. TITLE-JOIN: no same-name spec prior, but the session already has a spec
    //     lineage with this title → the model renamed its deliverable file; join
    //     that lineage as the next version instead of forking a new report.
    //  2. SUNK-PRIOR ADOPTION: the same-name prior is a 'data' artifact that
    //     DECLARED itself a spec but failed validation when it was captured (the
    //     "Check output" zombie). The validated re-save supersedes it — adopt its
    //     chain (when no title-join applies) and remove it; it was never a
    //     report version worth keeping.
    let lineage: ArtifactLineageFields | undefined;
    // The report version this one continues (when it is a spec), for carried-forward metadata.
    let priorSpecVersion: Artifact | null = null;
    if (existingByName?.type === 'analysis_artifact_spec') {
      lineage = deriveArtifactLineage(existingByName, ctx.existingArtifacts);
      priorSpecVersion = existingByName;
    } else if (analysisSpec) {
      const sameTitleLatest = latestSpecArtifactWithTitle(ctx.existingArtifacts, analysisSpec.title);
      if (sameTitleLatest) {
        lineage = deriveArtifactLineage(sameTitleLatest, ctx.existingArtifacts);
        priorSpecVersion = sameTitleLatest;
      }
      if (existingByName && isSunkDeclaredSpecArtifact(existingByName)) {
        if (!lineage) lineage = deriveArtifactLineage(existingByName, ctx.existingArtifacts);
        deps.dispatch({ type: 'REMOVE_ARTIFACT', payload: existingByName.id });
      } else if (existingByName && ctx.suppressNonDeliverableData) {
        deps.dispatch({ type: 'REMOVE_ARTIFACT', payload: existingByName.id });
      } else if (existingByName && !lineage) {
        lineage = deriveArtifactLineage(existingByName, ctx.existingArtifacts);
      }
    } else if (existingByName) {
      if (ctx.suppressNonDeliverableData) {
        deps.dispatch({ type: 'REMOVE_ARTIFACT', payload: existingByName.id });
      } else {
        lineage = deriveArtifactLineage(existingByName, ctx.existingArtifacts);
      }
    }

    let artifactType: Artifact['type'] = getSalesforceArtifactType(data.filename) || 'data';
    let artifactProfile: Artifact['profile'] | undefined;
    let artifactMeta: Artifact['metadata'] = { fileSize: data.size, ...(lineage ?? {}) };

    if (salesforceRole) {
      artifactMeta = {
        ...artifactMeta,
        artifactGroupId: ctx.salesforceArtifactGroupId,
        salesforceLensRun: true,
        salesforceLensIds: ctx.salesforceLensIds,
        salesforceRole,
      };
    }

    if (artifactType === 'data' && mimeType.startsWith('image/')) {
      artifactType = 'image';
    }
    if (artifactType === 'data' && mimeType === 'text/html') {
      artifactType = 'html';
    }

    // JSON tabular detection
    if (artifactType === 'data' && mimeType === 'application/json' && ext === 'json') {
      try {
        const decoded = decodeBase64ToUtf8(data.base64);
        const parsed = JSON.parse(decoded);
        if (isTabularJsonArray(parsed)) {
          artifactType = 'dataset';
          const columns = Object.keys(parsed[0]);
          artifactMeta = {
            ...artifactMeta,
            rowCount: parsed.length,
            columnCount: columns.length,
            schema: columns.map(name => ({
              name,
              type: typeof parsed[0][name] === 'number' ? 'number'
                : typeof parsed[0][name] === 'boolean' ? 'boolean'
                : 'string',
            })),
          };
        }
      } catch (err) {
        // Declared JSON but unparseable — keep as raw 'data' and flag it instead of
        // silently downgrading, so the user is warned rather than handed broken data.
        artifactMeta = {
          ...artifactMeta,
          validationReport: {
            valid: false,
            errors: [`Declared JSON but content is not parseable: ${getPersistErrorMessage(err)}`],
          },
        };
      }
    }

    // CSV/TSV tabular detection
    if ((mimeType === 'text/csv' || mimeType === 'text/tab-separated-values') && artifactType === 'data') {
      try {
        const decoded = decodeBase64ToUtf8(data.base64);
        const lines = decoded.split('\n').filter(l => l.trim());
        if (lines.length >= 2) {
          const delimiter = mimeType === 'text/tab-separated-values' ? '\t' : ',';
          const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));
          if (headers.length >= 2) {
            artifactType = 'dataset';
            artifactMeta = {
              ...artifactMeta,
              rowCount: lines.length - 1,
              columnCount: headers.length,
              schema: headers.map(name => ({ name, type: 'string' })),
            };
          }
        }
      } catch {
        // Decode failed - keep as 'data'
      }
    }

    // decodedTextData/analysisSpec are computed once above (before lineage,
    // which depends on spec detection). Note: decode is UTF-8, never bare atob
    // (mojibake: ' → â€™ would bake into the persisted spec/HTML).
    if (analysisSpec) {
      artifactType = 'analysis_artifact_spec';
      artifactMeta = {
        ...artifactMeta,
        reportSpecVersion: 1,
      };
    } else if (mimeType === 'application/json') {
      // A file that *declares* itself a report spec but fails strict validation
      // must not vanish silently — it would be captured as plain data and never
      // reach the Reports tab, with no signal to the user (or the model) about
      // why. Flag it with the concrete validation errors instead.
      const specValidationErrors = getDeclaredSpecValidationErrors(decodedTextData);
      if (specValidationErrors) {
        artifactMeta = {
          ...artifactMeta,
          validationReport: {
            valid: false,
            errors: [
              'This file declares itself an analysis_artifact_spec but failed validation, so it was kept as plain data and will NOT appear in Reports. Validation errors:',
              ...specValidationErrors,
            ],
          },
        };
        console.warn(
          `[Analyze] Declared report spec "${data.filename}" failed validation; captured as plain data:`,
          specValidationErrors,
        );
      }
    }

    // The structured report (analysis_artifact_spec) is the deliverable, so it stays
    // visible (output) and is never demoted to report material.
    const isDeliverableSpec = artifactType === 'analysis_artifact_spec';
    const reportMaterialRole = ctx.suppressNonDeliverableData && !isDeliverableSpec
      ? getReportMaterialRole(artifactType, mimeType, data.filename)
      : null;
    const shouldPersistAsReportMaterial = Boolean(
      ctx.suppressNonDeliverableData
      && !isDeliverableSpec
      && shouldRetainReportMaterial(artifactType, mimeType, data.filename)
      && reportMaterialRole
    );

    // When a structured report is the deliverable, it stays as the visible output;
    // report-compatible backing (figures, datasets, the embedded_html HTML) is kept
    // as hidden report material so the report can render it; scratch/debug/temp files
    // are suppressed.
    if (
      ctx.suppressNonDeliverableData
      && !isDeliverableSpec
      && !shouldPersistAsReportMaterial
    ) {
      return;
    }

    let artifactData = artifactType === 'html'
      || artifactType === 'analysis_artifact_spec'
      || isSalesforceArtifactType(artifactType)
      ? decodedTextData
      : data.base64;

    // analysisSpec is parsed (normalized + stable block ids via tryParse). Bake the
    // verifiable fetch provenance into its sources (the run's fetch map is only in
    // hand here; the /data fetch files it describes are never session artifacts) and
    // store the canonical id'd form so render, export, and Phase 3 edits all operate
    // on stable block identity.
    if (analysisSpec) {
      let spec = injectSourceProvenance(analysisSpec, deps.getFetchProvenanceMap());
      // A panel this turn, or one an earlier version of this report recorded (e.g. a
      // post-review revision): the method note stays with the report.
      const teamPanel = deps.getTeamPanel?.() ?? priorSpecVersion?.metadata?.teamPanel ?? null;
      if (teamPanel) {
        spec = injectTeamPanelNote(spec, teamPanel);
        artifactMeta = { ...artifactMeta, teamPanel };
      }
      artifactData = JSON.stringify(spec);
    }

    let policyReport: Artifact['policyReport'];
    const provenanceForArtifact = artifactType === 'html'
      ? (ctx.htmlArtifactProvenance ?? ctx.artifactProvenance)
      : ctx.artifactProvenance;
    if (artifactType === 'html') {
      // Guarantee a provenance-derived Sources section app-side (see extractHtmlArtifacts), then
      // strip hallucinated SRI `integrity` hashes so the stored HTML can actually load its CDN
      // resources (a wrong hash blocks e.g. leaflet.css → scattered map tiles).
      artifactData = repairModelAuthoredHtml(
        injectProvenanceSourcesSection(artifactData, provenanceForArtifact?.sources),
      );
      const htmlClassification = classifyHtmlLikeArtifact('html', artifactData, ctx.outputSelection, {
        provenanceSources: provenanceForArtifact?.sources || [],
      });
      artifactProfile = htmlClassification.profile;
      policyReport = htmlClassification.policyReport;
      const htmlValidation = validateHtmlArtifactContent(artifactData);
      if (!htmlValidation.valid) {
        artifactMeta = { ...artifactMeta, validationReport: htmlValidation };
      }
    }

    if (shouldPersistAsReportMaterial && reportMaterialRole) {
      artifactMeta = reportMaterialMetadata(
        artifactMeta,
        reportMaterialRole,
        ctx.reportMaterialGroupId,
        ctx.sourceOutputArtifactId,
      );
    }

    const artifact: Artifact = {
      id: `artifact-data-${ctx.messageId}-${ctx.execIndex}-${dataIndex}`,
      cellId: ctx.messageId,
      sessionId: ctx.sessionId,
      name: data.filename,
      type: artifactType,
      mimeType,
      data: artifactData,
      createdAt: deps.now(),
      metadata: artifactMeta,
      profile: artifactProfile,
      provenance: provenanceForArtifact,
      policyReport,
    };
    created.push(artifact);

    // Excel files consolidated into session workbook - skip individual dispatch.
    const isExcelFile = mimeType.includes('spreadsheet') || mimeType.includes('ms-excel');
    if (!isExcelFile) {
      persistArtifact(artifact, ctx.sessionId, deps);
    }

    // Keep analysis_artifact_spec as a compatibility artifact only. It previews
    // and exports on demand, but stream completion must not turn it into a
    // public HTML report path for normal Analyze runs.
  });

  return created;
}

// ============================================================================
// Explicit Bundle Artifact Extraction
// ============================================================================

function extractBundleOutputArtifacts(
  bundleOutputs: Array<{ name?: string; manifest: BundleManifest; sourceFiles: string[] }>,
  ctx: {
    messageId: string;
    sessionId: string;
    outputSelection: AnalyzeOutputSelection;
    execIndex: number;
    existingArtifacts: Artifact[];
    artifactProvenance: Artifact['provenance'];
    reportMaterialGroupId?: string;
    sourceOutputArtifactId?: string;
  },
  deps: StreamCompletedDeps,
): Artifact[] {
  const created: Artifact[] = [];

  bundleOutputs.forEach((bundle, bundleIndex) => {
    const manifestJson = JSON.stringify(bundle.manifest);
    const name = bundle.name || bundleArtifactName(bundle.manifest.entryPoint);

    // Regenerating a same-name bundle becomes a new version: keep the prior and
    // tag the new one with lineage so the UI can collapse them to the latest.
    const existingByName = ctx.existingArtifacts.find(
      a => a.type === 'artifact_bundle' && a.name === name
    );
    const lineage: ArtifactLineageFields | undefined = existingByName
      ? deriveArtifactLineage(existingByName, ctx.existingArtifacts)
      : undefined;

    const bundleClassification = classifyHtmlLikeArtifact('artifact_bundle', manifestJson, ctx.outputSelection, {
      provenanceSources: ctx.artifactProvenance?.sources || [],
    });

    const baseMeta: Artifact['metadata'] = {
      bundleSourceFiles: bundle.sourceFiles,
      bundleFileCount: Object.keys(bundle.manifest.files).length,
      ...(lineage ?? {}),
    };
    const metadata = ctx.reportMaterialGroupId
      ? reportMaterialMetadata(baseMeta, 'visual', ctx.reportMaterialGroupId, ctx.sourceOutputArtifactId)
      : baseMeta;
    const artifact: Artifact = {
      id: `artifact-bundle-explicit-${ctx.messageId}-${ctx.execIndex}-${bundleIndex}`,
      cellId: ctx.messageId,
      sessionId: ctx.sessionId,
      name,
      type: 'artifact_bundle',
      mimeType: 'application/json',
      data: manifestJson,
      createdAt: deps.now(),
      metadata,
      profile: bundleClassification.profile,
      provenance: ctx.artifactProvenance,
      policyReport: bundleClassification.policyReport,
    };
    created.push(artifact);
    persistArtifact(artifact, ctx.sessionId, deps);
  });

  return created;
}

// ============================================================================
// Session Workbook Consolidation
// ============================================================================

function consolidateSessionWorkbook(
  createdArtifacts: Artifact[],
  derivedSources: ToolResultProvenance[],
  messageId: string,
  sessionId: string,
  deps: StreamCompletedDeps,
  options?: {
    reportMaterialGroupId?: string;
    sourceOutputArtifactId?: string;
  },
): void {
  const tabularArtifacts = createdArtifacts.filter(isTabularArtifact);
  if (tabularArtifacts.length === 0) return;

  const tabsWithRows = tabularArtifacts
    .map(ta => ({ name: ta.name || 'analysis', rows: parseArtifactRows(ta.data, ta.mimeType) }))
    .filter(t => t.rows.length > 0);

  if (tabsWithRows.length === 0) return;

  const swm = deps.getSessionWorkbookManager();
  if (!swm.initialized && sessionId) {
    swm.reset(sessionId);
  }

  let sessionWorkbookArtifact: Artifact | null = null;
  for (const tab of tabsWithRows) {
    sessionWorkbookArtifact = swm.addDataTab(
      tab.name,
      tab.rows,
      derivedSources,
      messageId,
    );
  }

  if (sessionWorkbookArtifact) {
    // The consolidated data workbook is a first-class DELIVERABLE now (user decision):
    // it lands on the Artifacts tab + the Library as the session's data file for continued
    // iteration. It stays output-visible (not demoted to hidden report-material); the raw
    // per-tool data files it consolidates remain hidden report-material via the main
    // suppress path. Keep the report-group link so it's associated with the run.
    sessionWorkbookArtifact = {
      ...sessionWorkbookArtifact,
      metadata: {
        ...sessionWorkbookArtifact.metadata,
        ...(options?.reportMaterialGroupId ? { artifactGroupId: options.reportMaterialGroupId } : {}),
        artifactDisposition: 'output',
        datasetDeliverable: true,
      },
    };
    persistArtifact(sessionWorkbookArtifact, sessionId, deps);
  }
}

// ============================================================================
// Session-Level Retroactive Bundle Detection
// ============================================================================

function detectSessionLevelBundle(
  messageId: string,
  outputSelection: AnalyzeOutputSelection,
  recentSources: ToolResultProvenance[],
  deps: StreamCompletedDeps,
): void {
  // The browser deferred this with setTimeout so React state included the
  // just-created artifacts; the server's getState already does. The IIFE keeps
  // the original body (and its early returns) unchanged.
  (() => {
    const ASSET_MIME_TYPES_FOR_BUNDLE = new Set([
      'text/css', 'application/javascript', 'image/svg+xml',
      'image/png', 'image/jpeg', 'image/gif', 'image/webp',
    ]);
    const state = deps.getState();
    const allArtifacts = state.artifacts.filter((artifact) => !isReportMaterialArtifact(artifact));
    const sid = state.currentSession?.id || '';

    // ── Collect files from existing bundles ──
    // When the AI writes bundle pages across multiple turns, earlier turns
    // create partial bundles. We need to include those files so we can
    // build a comprehensive merged bundle.
    interface ExistingBundleInfo {
      artifact: Artifact;
      filenames: Set<string>;
    }
    const existingBundles: ExistingBundleInfo[] = [];
    const bundleFileContents = new Map<string, { content: string; mimeType: string; isBase64?: boolean; size: number }>();

    for (const a of allArtifacts) {
      if (a.type === 'artifact_bundle') {
        try {
          const manifest = JSON.parse(a.data) as { files?: Record<string, { content: string; mimeType: string; isBase64?: boolean; size: number }> };
          if (manifest.files) {
            const fns = new Set(Object.keys(manifest.files));
            existingBundles.push({ artifact: a, filenames: fns });
            for (const [fn, file] of Object.entries(manifest.files)) {
              bundleFileContents.set(fn, file);
            }
          }
        } catch { /* invalid manifest */ }
      }
    }

    const alreadyBundled = new Set(bundleFileContents.keys());

    // ── Collect unbundled artifacts ──
    const unbundledHtml = allArtifacts.filter(
      a => a.type === 'html' && a.name && !alreadyBundled.has(a.name)
    );
    const unbundledData = allArtifacts.filter(
      a => (a.type === 'data' || a.type === 'image') && ASSET_MIME_TYPES_FOR_BUNDLE.has(a.mimeType) && a.name && !alreadyBundled.has(a.name)
    );

    // Nothing new to bundle
    if (unbundledHtml.length === 0 && unbundledData.length === 0) return;

    // ── Build comprehensive candidate set (existing bundle files + unbundled) ──
    const allHtmlForDetect: Array<{ content: string; filename: string }> = [];
    const allDataForDetect: Array<{ filename: string; base64: string; size: number }> = [];

    // Add files from existing bundles
    for (const [fn, file] of bundleFileContents) {
      if (file.mimeType === 'text/html') {
        allHtmlForDetect.push({ content: file.content, filename: fn });
      } else {
        const base64 = file.isBase64 ? file.content : (() => { try { return btoa(file.content); } catch { return file.content; } })();
        allDataForDetect.push({ filename: fn, base64, size: file.size });
      }
    }

    // Add unbundled artifacts
    for (const a of unbundledHtml) {
      allHtmlForDetect.push({ content: a.data, filename: a.name });
    }
    for (const a of unbundledData) {
      allDataForDetect.push({ filename: a.name, base64: a.data, size: (a.metadata?.fileSize as number) || a.data.length });
    }

    if (allHtmlForDetect.length < 2) return;

    const sessionBundle = detectBundle({ htmlOutputs: allHtmlForDetect, dataOutputs: allDataForDetect });
    if (!sessionBundle.shouldBundle || !sessionBundle.manifest) return;

    // Only proceed if the new bundle is larger than the biggest existing bundle
    const newFileCount = Object.keys(sessionBundle.manifest.files).length;
    const maxExistingFileCount = existingBundles.reduce((max, b) => Math.max(max, b.filenames.size), 0);
    if (existingBundles.length > 0 && newFileCount <= maxExistingFileCount) return;

    // ── Replace old bundles and individual artifacts with the merged bundle ──
    const bundledFns = new Set(Object.keys(sessionBundle.manifest.files));

    // Remove existing bundle artifacts that are now superseded
    for (const { artifact } of existingBundles) {
      // REMOVE_ARTIFACT also deletes the stored doc when the server applies it.
      deps.dispatch({ type: 'REMOVE_ARTIFACT', payload: artifact.id });
    }

    // Remove individual artifacts that are now bundled
    const toRemove = allArtifacts.filter(
      a => bundledFns.has(a.name) && (
        a.type === 'html' || ((a.type === 'data' || a.type === 'image') && ASSET_MIME_TYPES_FOR_BUNDLE.has(a.mimeType))
      )
    );
    for (const a of toRemove) {
      deps.dispatch({ type: 'REMOVE_ARTIFACT', payload: a.id });
    }

    const sessionBundleSources = dedupeProvenanceSources([
      ...recentSources,
      ...allArtifacts.flatMap((artifact) => artifact.provenance?.sources || []),
    ]);
    const manifestJson = JSON.stringify(sessionBundle.manifest);
    const bundleCls = classifyHtmlLikeArtifact('artifact_bundle', manifestJson, outputSelection, {
      provenanceSources: sessionBundleSources,
    });
    const sessionBundleArtifact: Artifact = {
      id: `artifact-bundle-session-${messageId}`,
      cellId: messageId,
      sessionId: sid,
      name: bundleArtifactName(sessionBundle.manifest.entryPoint),
      type: 'artifact_bundle',
      mimeType: 'application/json',
      data: manifestJson,
      createdAt: deps.now(),
      profile: bundleCls.profile,
      provenance: buildArtifactProvenance('session_level_bundle', sessionBundleSources),
      policyReport: bundleCls.policyReport,
    };

    persistArtifact(sessionBundleArtifact, sid, deps);
  })();
}

// ============================================================================
// Main Handler
// ============================================================================

export function handleStreamCompleted(
  eventData: Record<string, unknown>,
  deps: StreamCompletedDeps,
): void {
  const messageId = eventData.messageId as string;
  const finalContent = eventData.finalContent as string;
  const toolCalls = eventData.toolCalls as StreamCompletedEventData['toolCalls'];
  const toolExecutionResults = eventData.toolExecutionResults as StreamCompletedEventData['toolExecutionResults'];
  const appNotice = eventData.appNotice as StreamCompletedEventData['appNotice'];
  const teamModeSkipped = eventData.teamModeSkipped === true;
  const outputLimitReached = eventData.outputLimitReached === true;
  const outputSelection = deps.getState().outputSelection;

  // ── Pre-process: detect bundles and inline CSS/JS into HTML outputs ──
  let bundleResultsMap = new Map<number, BundleDetectionResult>();
  let crossExecBundle: BundleDetectionResult | null = null;
  let crossExecBundledFilenames = new Set<string>();
  let processedToolExecutionResults = toolExecutionResults;

  if (toolExecutionResults) {
    const preprocessed = preprocessBundles(toolExecutionResults);
    bundleResultsMap = preprocessed.bundleResultsMap;
    crossExecBundle = preprocessed.crossExecBundle;
    crossExecBundledFilenames = preprocessed.crossExecBundledFilenames;
    processedToolExecutionResults = preprocessed.processedToolExecutionResults;
  }

  // Dispatch the message update
  deps.dispatch({
    type: 'UPDATE_MESSAGE',
    payload: {
      id: messageId,
      content: finalContent,
      metadata: toolCalls
        ? { toolCalls, toolExecutionResults: processedToolExecutionResults }
        : appNotice || teamModeSkipped || outputLimitReached
          ? {
            ...(appNotice ? { appNotice } : {}),
            ...(teamModeSkipped ? { teamModeSkipped } : {}),
            ...(outputLimitReached ? { outputLimitReached } : {}),
          }
          : undefined,
    },
  });

  if (!toolCalls || toolCalls.length === 0) {
    deps.setLatestCompletedOperatorMessageId(messageId);
  }

  // ── Artifact extraction ──
  if (processedToolExecutionResults) {
    const state = deps.getState();
    const sessionId = state.currentSession?.id || '';
    const fetchProvenanceByFileKey = new Map(deps.getFetchProvenanceMap());
    const runProvenanceSources = dedupeProvenanceSources(
      processedToolExecutionResults
        .map((result) => result.provenance)
        .filter((source): source is ToolResultProvenance => Boolean(source)),
    );
    const allDerivedSources: ToolResultProvenance[] = [];
    const selectedSalesforceLensIds = getSelectedSalesforceLensIdsForMessage(state.messages, messageId);
    const shouldSuppressSalesforceTextArtifacts = selectedSalesforceLensIds.length > 0
      && hasStructuredReportDeliverable(processedToolExecutionResults);
    // When a run produced a structured report, surface ONLY that report and treat
    // every intermediate (figures/data/dataset/auto session-workbook/HTML) as backing
    // — figures and the embedded_html HTML are kept as hidden report material so the
    // report renders them; scratch is dropped. Falsy when no valid spec was produced,
    // so a failed run still surfaces what it has.
    const suppressIntermediates = hasStructuredReportDeliverable(processedToolExecutionResults);
    const reportGroupId = suppressIntermediates ? reportArtifactGroupId(messageId) : undefined;

    // Update provenance map with new tool call results
    for (let i = 0; i < processedToolExecutionResults.length; i++) {
      const result = processedToolExecutionResults[i];
      const toolCall = toolCalls?.[i];
      if (!result?.provenance || !toolCall?.id) continue;
      fetchProvenanceByFileKey.set(
        sanitizeToolCallIdForFetchPath(toolCall.id),
        result.provenance,
      );
    }
    deps.setFetchProvenanceMap(fetchProvenanceByFileKey);

    // Process each tool execution result
    for (let i = 0; i < processedToolExecutionResults.length; i++) {
      const result = processedToolExecutionResults[i];
      const toolCall = toolCalls?.[i];
      const bundleResult = bundleResultsMap.get(i) || null;

      // Determine which data outputs to process (excluding bundled files)
      const datasToProcess = (bundleResult?.shouldBundle
        ? bundleResult.unbundledData
        : (result.dataOutputs || [])
      ).filter(d => !crossExecBundledFilenames.has(d.filename));
      const hasSalesforceDataOutputs = datasToProcess.some((data) => getSalesforceArtifactRole(data.filename) != null);
      const isSalesforceToolResult = result.toolName === 'salesforce_metadata_audit'
        || result.toolName === 'salesforce_docs_lookup'
        || hasSalesforceDataOutputs;

      // Bridge the AI's org-evidence request from the pure executor to UI state:
      // the transcript card renders off pendingOrgEvidenceRequest.
      if (result.toolName === 'request_salesforce_org_evidence' && result.success) {
        let parsedArgs: Record<string, unknown> = {};
        try {
          parsedArgs = toolCall?.function.arguments
            ? JSON.parse(toolCall.function.arguments) as Record<string, unknown>
            : {};
        } catch {
          parsedArgs = {};
        }
        const requestArgs = normalizeRequestSalesforceOrgEvidenceArgs(parsedArgs);
        deps.dispatch({
          type: 'SET_PENDING_ORG_EVIDENCE_REQUEST',
          payload: {
            id: toolCall?.id || `org-evidence-${messageId}-${i}`,
            requestedAt: deps.now(),
            reason: requestArgs.reason,
            unverifiedClaims: requestArgs.unverified_claims,
            investigationPrompt: requestArgs.investigation_prompt,
          },
        });
      }
      const salesforceOperation = isSalesforceToolResult
        ? getSalesforceOperationFromToolCall(toolCall)
        : undefined;
      const salesforceArtifactGroupId = isSalesforceToolResult
        ? `salesforce-${messageId}-${i}`
        : undefined;
      const salesforceLensIds = isSalesforceToolResult
        ? selectedSalesforceLensIds.length > 0
          ? selectedSalesforceLensIds
          : getSalesforceLensIdsForOperation(salesforceOperation)
        : undefined;
      const suppressSalesforcePacketArtifacts = isSalesforceToolResult
        && !shouldPersistSalesforcePacketArtifacts(outputSelection);
      const suppressSalesforceIncidentalTextArtifacts = shouldSuppressSalesforceTextArtifacts
        && !shouldPersistSalesforcePacketArtifacts(outputSelection);

      const outputImageDataKeys = new Set(
        datasToProcess
          .filter((data) => {
            const ext = data.filename.split('.').pop()?.toLowerCase() || '';
            return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext);
          })
          .map((data) => data.base64.slice(-100))
      );

      // Derive provenance sources
      let derivedSources: ToolResultProvenance[] = [];
      if (result.provenance) {
        derivedSources = [result.provenance];
      } else {
        const code = parseExecutePythonCodeFromToolCall(toolCall);
        if (code) {
          const referencedFetchKeys = extractFetchSourceKeysFromCode(code);
          derivedSources = dedupeProvenanceSources(
            referencedFetchKeys
              .map((key) => fetchProvenanceByFileKey.get(key))
              .filter((source): source is ToolResultProvenance => Boolean(source))
          );
        }
      }
      allDerivedSources.push(...derivedSources);

      const artifactProvenance = buildArtifactProvenance(result.toolName, derivedSources);
      const shouldAttachRunProvenanceToWrittenHtml = result.toolName === 'write_output_file'
        && derivedSources.length === 0
        && runProvenanceSources.length > 0
        && hasHtmlLikeOutputForResult(result, bundleResult);
      const htmlArtifactSources = shouldAttachRunProvenanceToWrittenHtml
        ? runProvenanceSources
        : derivedSources;
      const htmlArtifactProvenance = buildArtifactProvenance(result.toolName, htmlArtifactSources);
      if (shouldAttachRunProvenanceToWrittenHtml) {
        allDerivedSources.push(...htmlArtifactSources);
      }
      const existingArtifacts = deps.getState().artifacts;
      const createdArtifactsForResult: Artifact[] = [];
      let sourceOutputArtifactId: string | undefined;

      if (isSalesforceToolResult) {
        removeExistingArtifactByName('Salesforce Workspace Audit (source)', 'report_spec', existingArtifacts, deps);
      }

      if (result.bundleOutputs && result.bundleOutputs.length > 0) {
        const bundleArtifacts = extractBundleOutputArtifacts(result.bundleOutputs, {
          messageId, sessionId, outputSelection, execIndex: i, existingArtifacts, artifactProvenance: htmlArtifactProvenance, reportMaterialGroupId: reportGroupId, sourceOutputArtifactId,
        }, deps);
        createdArtifactsForResult.push(...bundleArtifacts);
        sourceOutputArtifactId = sourceOutputArtifactId ?? bundleArtifacts[0]?.id;
      }

      // Create per-execution bundle artifact
      if (bundleResult?.shouldBundle && bundleResult.manifest) {
        const manifestJson = JSON.stringify(bundleResult.manifest);
        const bundleClassification = classifyHtmlLikeArtifact('artifact_bundle', manifestJson, outputSelection, {
          provenanceSources: htmlArtifactSources,
        });
        const bundleArtifact: Artifact = {
          id: `artifact-bundle-${messageId}-${i}`,
          cellId: messageId,
          sessionId,
          name: bundleArtifactName(bundleResult.manifest.entryPoint),
          type: 'artifact_bundle',
          mimeType: 'application/json',
          data: manifestJson,
          createdAt: deps.now(),
          metadata: reportGroupId
            ? reportMaterialMetadata(undefined, 'visual', reportGroupId, sourceOutputArtifactId)
            : undefined,
          profile: bundleClassification.profile,
          provenance: htmlArtifactProvenance,
          policyReport: bundleClassification.policyReport,
        };
        createdArtifactsForResult.push(bundleArtifact);
        sourceOutputArtifactId = sourceOutputArtifactId ?? bundleArtifact.id;
        persistArtifact(bundleArtifact, sessionId, deps);
      }

      // Extract HTML artifacts
      const htmlsToProcess = (bundleResult?.shouldBundle
        ? bundleResult.unbundledHtml.map(h => ({ content: h.content, filename: h.filename as string | undefined }))
        : (result.htmlOutputs || [])
      ).filter(h => !h.filename || !crossExecBundledFilenames.has(h.filename));

      if (htmlsToProcess.length > 0) {
        const htmlArtifacts = extractHtmlArtifacts(htmlsToProcess, {
          messageId, sessionId, outputSelection, execIndex: i, existingArtifacts, artifactProvenance: htmlArtifactProvenance, reportMaterialGroupId: reportGroupId, sourceOutputArtifactId,
        }, deps);
        createdArtifactsForResult.push(...htmlArtifacts);
        sourceOutputArtifactId = sourceOutputArtifactId ?? htmlArtifacts[0]?.id;
      }

      // Extract image artifacts from plt.show() auto-captures.
      // Skip if the user explicitly saved image files to /output/ (e.g. plt.savefig);
      // those saved files are higher quality and have meaningful names.
      const hasExplicitImageOutputs = outputImageDataKeys.size > 0;
      if (result.images && result.images.length > 0 && !hasExplicitImageOutputs) {
        const imageArtifacts = extractImageArtifacts(result.images, {
          messageId,
          sessionId,
          execIndex: i,
          outputImageDataKeys,
          existingArtifacts,
          artifactProvenance,
          reportMaterialGroupId: suppressIntermediates ? reportGroupId : undefined,
          sourceOutputArtifactId,
        }, deps);
        createdArtifactsForResult.push(...imageArtifacts);
      }

      // Extract data artifacts
      if (datasToProcess.length > 0) {
        const dataArtifacts = extractDataArtifacts(datasToProcess, {
          messageId,
          sessionId,
          outputSelection,
          execIndex: i,
          existingArtifacts,
          artifactProvenance,
          salesforceArtifactGroupId,
          salesforceLensIds,
          suppressSalesforcePacketArtifacts,
          suppressSalesforceIncidentalTextArtifacts,
          suppressNonDeliverableData: suppressIntermediates,
          htmlArtifactProvenance,
          reportMaterialGroupId: reportGroupId,
          sourceOutputArtifactId,
        }, deps);
        createdArtifactsForResult.push(...dataArtifacts);
        if (dataArtifacts.some((artifact) => artifact.type === 'analysis_artifact_spec')) {
          deps.markReportProduced?.();
        }
      }

      // Consolidate tabular data into a session workbook. In Rich mode the
      // workbook is retained as hidden report material instead of leaking into
      // the visible Artifacts tab.
      consolidateSessionWorkbook(createdArtifactsForResult, derivedSources, messageId, sessionId, deps, {
        reportMaterialGroupId: suppressIntermediates ? reportGroupId : undefined,
        sourceOutputArtifactId,
      });
    }

    // ── Cross-execution bundle ──
    if (crossExecBundle?.shouldBundle && crossExecBundle.manifest) {
      const sessionId = deps.getState().currentSession?.id || '';
      const crossExecSources = dedupeProvenanceSources(allDerivedSources);
      const manifestJson = JSON.stringify(crossExecBundle.manifest);
      const bundleClassification = classifyHtmlLikeArtifact('artifact_bundle', manifestJson, outputSelection, {
        provenanceSources: crossExecSources,
      });
      const bundleArtifact: Artifact = {
        id: `artifact-bundle-cross-${messageId}`,
        cellId: messageId,
        sessionId,
        name: bundleArtifactName(crossExecBundle.manifest.entryPoint),
        type: 'artifact_bundle',
        mimeType: 'application/json',
        data: manifestJson,
        createdAt: deps.now(),
        metadata: reportGroupId
          ? reportMaterialMetadata(undefined, 'visual', reportGroupId, undefined)
          : undefined,
        profile: bundleClassification.profile,
        provenance: buildArtifactProvenance('cross_execution_bundle', crossExecSources),
        policyReport: bundleClassification.policyReport,
      };
      persistArtifact(bundleArtifact, sessionId, deps);
    }

    // ── Session-level retroactive bundle detection ──
    detectSessionLevelBundle(
      messageId,
      outputSelection,
      dedupeProvenanceSources(allDerivedSources),
      deps,
    );
  }

  // Persist the AI message with tool call metadata (inline on the server; the
  // browser waited one tick for UPDATE_MESSAGE to land in React state).
  (() => {
    const state = deps.getState();
    const aiMessage = state.messages.find(m => m.id === messageId);
    if (aiMessage) {
      const updatedMessage: Message = {
        ...aiMessage,
        content: finalContent,
        metadata: {
          ...aiMessage.metadata,
          ...(toolCalls ? {
            toolCalls,
            toolExecutionResults: sanitizeToolExecutionResultsForPersistence(processedToolExecutionResults),
          } : {}),
        },
      };
      deps.persistMessage(updatedMessage);
    }
  })();
}

/**
 * Cap on a single persisted tool result's `content`. Not an arbitrary product
 * limit: the cloud payload store hard-caps one message payload at 25MB, and
 * `content` receives the tool's full stdout (the loop folds
 * `metadata.fullStdout` into it), which is unbounded. 512KB keeps even extreme
 * restored-transcript output readable while making the 25MB cap structurally
 * unreachable; a marker notes the truncation.
 */
const PERSISTED_TOOL_RESULT_CONTENT_MAX = 512 * 1024;

/**
 * Strip payloads from tool results before they are persisted on the message.
 *
 * A Salesforce audit run duplicated ~63MB of base64 dataOutputs + folded-in
 * fullStdout into ONE message's metadata, exceeding the 25MB cloud payload
 * cap — sync failed for the whole message (2026-07-24 live failure). The
 * payloads already live where they are actually consumed: dataOutputs become
 * artifacts at capture, and model history references them by filename only.
 * Keep filenames/sizes (history needs them) and images/htmlOutputs (the
 * transcript re-renders those from restored messages).
 */
export function sanitizeToolExecutionResultsForPersistence(
  results: StreamCompletedEventData['toolExecutionResults'],
): StreamCompletedEventData['toolExecutionResults'] {
  if (!results) return results;
  return results.map((result) => {
    const sanitized = { ...result };
    if (sanitized.dataOutputs && sanitized.dataOutputs.length > 0) {
      sanitized.dataOutputs = sanitized.dataOutputs.map((output) => ({
        ...output,
        base64: '',
      }));
    }
    if (sanitized.content && sanitized.content.length > PERSISTED_TOOL_RESULT_CONTENT_MAX) {
      sanitized.content = `${sanitized.content.slice(0, PERSISTED_TOOL_RESULT_CONTENT_MAX)}\n… [truncated for storage: full output was ${result.content!.length.toLocaleString()} characters; it remains available in the live session]`;
    }
    return sanitized;
  });
}
