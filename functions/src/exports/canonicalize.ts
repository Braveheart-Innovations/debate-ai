/**
 * Server-Side Canonicalization & Validation
 *
 * Mirrors the web repo's reportSpecSchema.ts + content-hash.ts algorithms
 * to ensure identical hashing behavior. Must stay in sync with:
 *   - symposium-ai-web/src/services/reports/reportSpecSchema.ts
 *   - symposium-ai-web/src/lib/content-hash.ts
 *
 * Canonicalization pipeline:
 *   1. Pre-process: deep-merge theme defaults into raw input
 *   2. Validate with Zod (structure + hard limits)
 *   3. Normalize markdown (CRLF → LF, trim trailing whitespace)
 *   4. Return canonical spec
 */
import { z } from 'zod';
import type { ArtifactBrandingOptions, ReportSpecV1, ReportTheme } from './types';
import { sha256Hex, stableSerialize } from './utils';
import {
  formatBrandingLine,
  normalizeArtifactBrandingOptions,
} from './artifactBranding';

// ============================================================================
// Constants (must match web repo)
// ============================================================================

export const DEFAULT_THEME: ReportTheme = {
  pageSize: 'A4',
  landscape: false,
  margins: { top: 40, right: 40, bottom: 40, left: 40 },
  fonts: {
    heading: 'Helvetica',
    body: 'Helvetica',
    mono: 'Courier',
  },
  colors: {
    primary: '#6366f1',
    secondary: '#8b5cf6',
    accent: '#06b6d4',
    text: '#1f2937',
    background: '#ffffff',
  },
};

// ============================================================================
// Zod Schemas (must match web repo)
// ============================================================================

const citableBlockFields = {
  citations: z.array(z.string().min(1)).optional(),
};

const headingBlockSchema = z.object({
  kind: z.literal('heading'),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  text: z.string().min(1),
  ...citableBlockFields,
});

const paragraphBlockSchema = z.object({
  kind: z.literal('paragraph'),
  markdown: z.string(),
  ...citableBlockFields,
});

const renderIntentSchema = z.enum([
  'vega',
  'map',
  'image',
  'dataset_preview',
  'json_document',
  'text_document',
  'html_snapshot',
]);

const artifactBlockSchema = z.object({
  kind: z.literal('artifact'),
  artifactId: z.string().min(1),
  renderIntent: renderIntentSchema,
  caption: z.string().optional(),
  options: z.object({
    maxWidth: z.number().positive().optional(),
    maxHeight: z.number().positive().optional(),
    maxRows: z.number().int().positive().optional(),
  }).optional(),
  ...citableBlockFields,
});

const tableBlockSchema = z.object({
  kind: z.literal('table'),
  headers: z.array(z.string()).min(1),
  rows: z.array(z.array(z.string())),
  caption: z.string().optional(),
  ...citableBlockFields,
});

const pageBreakBlockSchema = z.object({
  kind: z.literal('page_break'),
  ...citableBlockFields,
});

const spacerBlockSchema = z.object({
  kind: z.literal('spacer'),
  height: z.number().positive(),
  ...citableBlockFields,
});

const explanationSizeSchema = z.enum(['s', 'm', 'l']);

const artifactExplanationBlockSchema = z.object({
  kind: z.literal('artifact_explanation'),
  artifactId: z.string().min(1),
  size: explanationSizeSchema,
  text: z.string(),
  ...citableBlockFields,
});

const reportBlockSchema = z.discriminatedUnion('kind', [
  headingBlockSchema,
  paragraphBlockSchema,
  artifactBlockSchema,
  tableBlockSchema,
  pageBreakBlockSchema,
  spacerBlockSchema,
  artifactExplanationBlockSchema,
]);

const reportThemeSchema = z.object({
  pageSize: z.enum(['A4', 'LETTER']),
  landscape: z.boolean().optional(),
  margins: z.object({
    top: z.number().nonnegative(),
    right: z.number().nonnegative(),
    bottom: z.number().nonnegative(),
    left: z.number().nonnegative(),
  }),
  fonts: z.object({
    heading: z.string().min(1),
    body: z.string().min(1),
    mono: z.string().min(1),
  }),
  colors: z.object({
    primary: z.string().min(1),
    secondary: z.string().min(1),
    accent: z.string().min(1),
    text: z.string().min(1),
    background: z.string().min(1),
  }),
});

const reportPageSchema = z.object({
  blocks: z.array(reportBlockSchema),
});

const reportSourceSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  title: z.string().optional(),
  url: z.string().url().optional(),
  retrievedAt: z.string().optional(),
  sourceArtifactId: z.string().optional(),
  note: z.string().optional(),
});

const artifactBrandingOptionsSchema = z.object({
  visibility: z.enum(['visible', 'metadata', 'off']).optional(),
  includeLogo: z.boolean().optional(),
  includeUrl: z.boolean().optional(),
}).optional();

const reportSpecOptionsSchema = z.object({
  includeProvenanceAttachment: z.boolean().optional(),
  citationStyle: z.enum(['none', 'numeric_endnotes']).optional(),
  includeProvenanceAppendix: z.boolean().optional(),
  provenanceDetailLevel: z.enum(['brief', 'full']).optional(),
  header: z.object({
    enabled: z.boolean().optional(),
    left: z.string().optional(),
    center: z.string().optional(),
    right: z.string().optional(),
  }).optional(),
  footer: z.object({
    enabled: z.boolean().optional(),
    left: z.string().optional(),
    center: z.string().optional(),
    right: z.string().optional(),
  }).optional(),
  branding: artifactBrandingOptionsSchema,
});

export const reportSpecV1Schema = z.object({
  version: z.literal(1),
  profile: z.literal('ARCHIVE_PORTABLE'),
  title: z.string().min(1),
  authors: z.array(z.string()),
  abstract: z.string().optional(),
  createdAt: z.number(),
  modifiedAt: z.number(),
  sessionId: z.string().min(1),
  theme: reportThemeSchema,
  pages: z.array(reportPageSchema).min(1),
  sources: z.array(reportSourceSchema).optional(),
  options: reportSpecOptionsSchema.optional(),
});

// ============================================================================
// Parse & Validate
// ============================================================================

/**
 * Parse and validate a ReportSpecV1. Throws on failure.
 */
export function parseReportSpec(data: unknown): ReportSpecV1 {
  return reportSpecV1Schema.parse(data) as ReportSpecV1;
}

/**
 * Safe parse with error messages.
 */
export function validateReportSpec(data: unknown): { success: boolean; errors?: string[] } {
  const result = reportSpecV1Schema.safeParse(data);
  if (result.success) {
    return { success: true };
  }
  return {
    success: false,
    errors: result.error.issues.map(
      (issue) => `${issue.path.join('.')}: ${issue.message}`,
    ),
  };
}

// ============================================================================
// Canonicalization (must match web repo algorithm exactly)
// ============================================================================

/**
 * Normalize markdown: CRLF → LF, trim trailing whitespace per line,
 * strip trailing empty lines.
 */
function normalizeMarkdown(md: string): string {
  return md
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n+$/, '');
}

/**
 * Deep-merge a partial theme with DEFAULT_THEME.
 * Merges at the nested object level (margins, fonts, colors).
 */
function deepMergeTheme(
  defaults: ReportTheme,
  partial?: Record<string, unknown>,
): ReportTheme {
  if (!partial) return { ...defaults };

  return {
    pageSize: (partial.pageSize as ReportTheme['pageSize']) ?? defaults.pageSize,
    landscape: typeof partial.landscape === 'boolean' ? partial.landscape : defaults.landscape,
    margins: {
      ...defaults.margins,
      ...((partial.margins as Partial<ReportTheme['margins']>) ?? {}),
    },
    fonts: {
      ...defaults.fonts,
      ...((partial.fonts as Partial<ReportTheme['fonts']>) ?? {}),
    },
    colors: {
      ...defaults.colors,
      ...((partial.colors as Partial<ReportTheme['colors']>) ?? {}),
    },
  };
}

/**
 * Pre-process raw input: deep-merge theme defaults and fill options.
 */
function applyDefaults(input: unknown): unknown {
  if (!input || typeof input !== 'object') return input;
  const data = { ...(input as Record<string, unknown>) };

  data.theme = deepMergeTheme(
    DEFAULT_THEME,
    data.theme as Record<string, unknown> | undefined,
  );

  const existingOptions = (data.options as Record<string, unknown>) ?? {};
  const existingHeader = (
    existingOptions.header && typeof existingOptions.header === 'object'
      ? existingOptions.header
      : {}
  ) as Record<string, unknown>;
  const existingFooter = (
    existingOptions.footer && typeof existingOptions.footer === 'object'
      ? existingOptions.footer
      : {}
  ) as Record<string, unknown>;
  const existingBranding = (
    existingOptions.branding && typeof existingOptions.branding === 'object'
      ? existingOptions.branding
      : {}
  ) as ArtifactBrandingOptions;
  const resolvedBranding = normalizeArtifactBrandingOptions(existingBranding);
  const defaultFooterRight = resolvedBranding.visibility === 'visible'
    ? formatBrandingLine(resolvedBranding)
    : '';

  data.options = {
    includeProvenanceAttachment: false,
    citationStyle: 'none',
    includeProvenanceAppendix: false,
    provenanceDetailLevel: 'brief',
    ...existingOptions,
    header: {
      enabled: false,
      left: '',
      center: '',
      right: '',
      ...existingHeader,
    },
    footer: {
      enabled: true,
      left: '',
      center: '{{pageNumber}} / {{totalPages}}',
      right: defaultFooterRight,
      ...existingFooter,
    },
    branding: resolvedBranding,
  };

  return data;
}

/**
 * Normalize all markdown content in the spec (abstract + paragraph blocks).
 */
function normalizeAllMarkdown(spec: ReportSpecV1): ReportSpecV1 {
  return {
    ...spec,
    abstract: spec.abstract ? normalizeMarkdown(spec.abstract) : spec.abstract,
    pages: spec.pages.map(page => ({
      blocks: page.blocks.map(block =>
        block.kind === 'paragraph'
          ? { ...block, markdown: normalizeMarkdown(block.markdown) }
          : block,
      ),
    })),
  };
}

/**
 * Canonicalize a report spec:
 * 1. Pre-process: deep-merge defaults
 * 2. Parse with Zod (validate structure + hard limits)
 * 3. Normalize markdown
 * 4. Return canonical spec
 *
 * Throws ZodError on invalid input.
 */
export function canonicalizeReportSpecV1(input: unknown): ReportSpecV1 {
  const withDefaults = applyDefaults(input);
  const parsed = reportSpecV1Schema.parse(withDefaults) as ReportSpecV1;
  return normalizeAllMarkdown(parsed);
}

// ============================================================================
// Canonical Hash Input (must match web repo)
// ============================================================================

/**
 * Strip createdAt from spec for deterministic hashing.
 * createdAt is set once and should not affect content hash.
 * modifiedAt IS included.
 */
export function canonicalHashInput(
  spec: ReportSpecV1,
): Omit<ReportSpecV1, 'createdAt'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { createdAt, ...rest } = spec;
  return rest;
}

/**
 * Compute the content-addressed ID for a canonical report spec.
 * Returns the same hash as the web repo's contentAddressReportSpec().
 *
 * ID format: report_spec:<sha256>
 */
export function contentAddressReportSpec(
  spec: ReportSpecV1,
): { id: string; hash: string; serialized: string } {
  const hashInput = canonicalHashInput(spec);
  const hashSerialized = stableSerialize(hashInput);
  const hash = sha256Hex(hashSerialized);

  const fullSerialized = stableSerialize(spec);

  return {
    id: `report_spec:${hash}`,
    hash,
    serialized: fullSerialized,
  };
}
