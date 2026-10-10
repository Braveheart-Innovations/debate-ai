/**
 * Export Pipeline Types
 *
 * Mirrors the web repo's report-spec and notebook types for the
 * server-side export pipeline. Kept in sync manually since the
 * functions repo is a separate codebase.
 */

// ============================================================================
// Artifact Types (mirrors web repo src/types/notebook.ts)
// ============================================================================

export type ArtifactType =
  | 'code'
  | 'image'
  | 'table'
  | 'data'
  | 'html'
  | 'dataset'
  | 'vega_lite_spec'
  | 'map_spec'
  | 'artifact_bundle'
  | 'analysis_artifact_spec'
  | 'report_spec'
  | 'document_pdf'
  | 'document_pptx'
  | 'document_docx'
  | 'document_html'
  | 'salesforce_audit_report'
  | 'salesforce_component_index'
  | 'salesforce_dependency_map'
  | 'salesforce_vscode_handoff';

// ============================================================================
// Report Theme
// ============================================================================

export interface ReportTheme {
  pageSize: 'A4' | 'LETTER';
  landscape?: boolean;
  margins: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  fonts: {
    heading: string;
    body: string;
    mono: string;
  };
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    text: string;
    background: string;
  };
}

// ============================================================================
// Block Types (discriminated union on `kind`)
// ============================================================================

export interface ReportSource {
  id: string;
  label: string;
  title?: string;
  url?: string;
  retrievedAt?: string;
  sourceArtifactId?: string;
  note?: string;
}

export interface CitableReportBlock {
  /** Normalized report source IDs cited by this block. */
  citations?: string[];
}

export interface HeadingBlock extends CitableReportBlock {
  kind: 'heading';
  level: 1 | 2 | 3;
  text: string;
}

export interface ParagraphBlock extends CitableReportBlock {
  kind: 'paragraph';
  markdown: string;
}

export type RenderIntent =
  | 'vega'
  | 'map'
  | 'image'
  | 'dataset_preview'
  | 'json_document'
  | 'text_document'
  | 'html_snapshot';

export interface ArtifactBlock extends CitableReportBlock {
  kind: 'artifact';
  artifactId: string;
  renderIntent: RenderIntent;
  caption?: string;
  options?: {
    maxWidth?: number;
    maxHeight?: number;
    maxRows?: number;
  };
}

export interface TableBlock extends CitableReportBlock {
  kind: 'table';
  headers: string[];
  rows: string[][];
  caption?: string;
}

export interface PageBreakBlock extends CitableReportBlock {
  kind: 'page_break';
}

export interface SpacerBlock extends CitableReportBlock {
  kind: 'spacer';
  height: number; // in pt
}

export type ExplanationSize = 's' | 'm' | 'l';

export interface ArtifactExplanationBlock extends CitableReportBlock {
  kind: 'artifact_explanation';
  artifactId: string;
  size: ExplanationSize;
  text: string;
}

export type ReportBlock =
  | HeadingBlock
  | ParagraphBlock
  | ArtifactBlock
  | TableBlock
  | PageBreakBlock
  | SpacerBlock
  | ArtifactExplanationBlock;

// ============================================================================
// Report Page & Spec
// ============================================================================

export interface ReportPage {
  blocks: ReportBlock[];
}

export type CitationStyle = 'none' | 'numeric_endnotes';
export type ProvenanceDetailLevel = 'brief' | 'full';
export type ArtifactBrandingVisibility = 'visible' | 'metadata' | 'off';

export interface ArtifactBrandingOptions {
  visibility?: ArtifactBrandingVisibility;
  includeLogo?: boolean;
  includeUrl?: boolean;
}

export interface ArtifactBrandingRecord {
  version: 1;
  visibility: ArtifactBrandingVisibility;
  brandName: string;
  attribution: string;
  url: string;
  logoPath: string;
  appliedAt: string;
}

export interface ReportChromeSlot {
  enabled?: boolean;
  left?: string;
  center?: string;
  right?: string;
}

export interface ReportSpecOptions {
  includeProvenanceAttachment?: boolean;
  citationStyle?: CitationStyle;
  includeProvenanceAppendix?: boolean;
  provenanceDetailLevel?: ProvenanceDetailLevel;
  header?: ReportChromeSlot;
  footer?: ReportChromeSlot;
  branding?: ArtifactBrandingOptions;
}

export interface ReportSpecV1 {
  version: 1;
  profile: 'ARCHIVE_PORTABLE';
  title: string;
  authors: string[];
  abstract?: string;
  createdAt: number;
  modifiedAt: number;
  sessionId: string;
  theme: ReportTheme;
  pages: ReportPage[];
  sources?: ReportSource[];
  options?: ReportSpecOptions;
}

// ============================================================================
// Render Intent ↔ Artifact Type Mapping
// ============================================================================

export const RENDER_INTENT_VALID_TYPES: Record<RenderIntent, readonly ArtifactType[]> = {
  vega: ['vega_lite_spec'],
  map: ['map_spec'],
  image: ['image'],
  dataset_preview: ['dataset', 'data', 'table'],
  json_document: [
    'data',
    'dataset',
    'table',
    'salesforce_audit_report',
    'salesforce_component_index',
    'salesforce_dependency_map',
    'salesforce_vscode_handoff',
  ],
  text_document: ['data', 'salesforce_vscode_handoff'],
  html_snapshot: ['html', 'artifact_bundle'],
} as const;

/** Types allowed for export without warnings */
export const POLICY_GATE_ALLOWED_TYPES: readonly ArtifactType[] = [
  'vega_lite_spec',
  'map_spec',
  'dataset',
  'data',
  'table',
  'image',
] as const;

// ============================================================================
// Export Job Document (Firestore shape)
// ============================================================================

export type ExportJobPhase =
  | 'queued'
  | 'processing'
  | 'rendering'
  | 'completed'
  | 'failed';

export type ExportJobMode = 'report_spec' | 'html_direct';

export interface HtmlDirectOptions {
  pageSize?: 'A4' | 'LETTER';
  margins?: { top: number; right: number; bottom: number; left: number };
  landscape?: boolean;
  printBackground?: boolean;
  branding?: ArtifactBrandingOptions;
}

export interface ExportJobDoc {
  id: string;
  createdAt: string;
  createdBy: string;
  reportSpecArtifactId: string;
  sessionId: string;
  phase: ExportJobPhase;
  progress?: number;
  downloadUrl?: string;
  outputArtifactId?: string;
  outputArtifactType?: 'document_pdf';
  error?: string;
  updatedAt: string;
  pdfHash?: string;
  provenanceHash?: string;
  /** Defaults to 'report_spec' for backward compatibility */
  mode?: ExportJobMode;
  /** For html_direct mode: the artifact to convert directly to PDF */
  artifactId?: string;
  /** For html_direct mode: PDF generation options */
  options?: HtmlDirectOptions;
}

// ============================================================================
// Provenance Manifest
// ============================================================================

export interface ProvenanceInputArtifact {
  id: string;
  type: ArtifactType;
  hash: string;
}

export interface ProvenanceMapDetails {
  boundarySystemId?: string;
  boundaryManifestHash?: string;
  dataMatchRate: number;
  coverageRate: number;
  exportWarningOverridden: boolean;
}

export interface ProvenanceManifest {
  reportSpecId: string;
  reportSpecHash: string;
  inputArtifacts: ProvenanceInputArtifact[];
  rendererVersions: {
    puppeteer: string;
    chromium: string;
    vegaEmbed?: string;
    vegaLite?: string;
    vega?: string;
  };
  mapDetails?: Record<string, ProvenanceMapDetails>;
  warnings: string[];
  exportedAt: string;
}

// ============================================================================
// Cloud Payload Offloading (mirrors web repo CloudPayloadStorageService)
// ============================================================================

export type CloudPayloadRef = {
  version: 1;
  provider: 'firebase_storage';
  path: string;
  bytes: number;
  sha256: string;
  contentType: string;
  offloadedAt: number;
};

export type CloudPayloadRefs = {
  data?: CloudPayloadRef;
  content?: CloudPayloadRef;
  metadata?: CloudPayloadRef;
};

export const PAYLOAD_SENTINEL = '__PAYLOAD_OFFLOADED__';

// ============================================================================
// Artifact Document (Firestore shape, subset of web Artifact)
// ============================================================================

export interface ArtifactDoc {
  id: string;
  cellId: string;
  sessionId: string;
  name: string;
  type: ArtifactType;
  mimeType: string;
  data: string;
  createdAt: number;
  metadata?: Record<string, unknown>;
  profile?: string;
  provenance?: Record<string, unknown>;
  dependencies?: Array<{ artifactId: string; relationship: string }>;
  payloadRefs?: CloudPayloadRefs;
}

// ============================================================================
// Rendered Block (internal pipeline type)
// ============================================================================

export interface RenderedBlock {
  kind: ReportBlock['kind'];
  html: string;
}
