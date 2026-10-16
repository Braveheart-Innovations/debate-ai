/**
 * Salesforce docs grounding (2.9.5) for review: the Reviewer sees each
 * Salesforce claim in the reviewed report beside the passage its citation
 * points to, and the "check independently" verifier is told which docs pages
 * the operator read. Both see stored tool results, not the sandbox, so the
 * passages come from the docs lookups' results in the session's messages.
 */
import type { Message } from '../contract/types';
import type { Artifact } from '../contract/types/notebook';
import type { AnalysisArtifactSpecV1 } from '../contract/types/analysis-artifact-spec';
import { tryParseAnalysisArtifactSpecText } from '../contract/services/analyze/artifacts/AnalysisArtifactSpecService';
import type { SalesforceDocQuotedPage } from '../engine/tools/executeSalesforceDocsLookupTool';
import { attributesToSalesforce, salesforcePageKey, splitSentences } from '../engine/tools/salesforceGroundingCheck';
import { docsPagesRead } from '../engine/tools/salesforceDocsRead';

/** The Reviewer's prompt is bounded; this is the share for Salesforce claims and their passages. */
const CLAIM_EVIDENCE_BUDGET_CHARS = 16_000;
const PASSAGE_CHARS_PER_CLAIM = 1_500;

function isSalesforceUrl(urlValue: string | undefined): boolean {
  return Boolean(urlValue && salesforcePageKey(urlValue) && !/\.my\.salesforce\.com/i.test(urlValue));
}

function texts(spec: AnalysisArtifactSpecV1): Array<{ where: string; text: string; citations: string[] }> {
  const found: Array<{ where: string; text: string; citations: string[] }> = [{ where: 'Summary', text: spec.summary || '', citations: [] }];
  for (const page of spec.pages || []) {
    found.push({ where: `${page.title} (summary)`, text: page.summary || '', citations: [] });
    for (const block of page.blocks || []) {
      const where = block.title ? `${page.title} › ${block.title}` : page.title;
      const citations = block.citations || [];
      if (block.kind === 'markdown') found.push({ where, text: block.markdown, citations });
      else if (block.kind === 'callout') found.push({ where, text: block.body, citations });
      else if (block.kind === 'table') block.rows.forEach((row) => found.push({ where, text: row.join(' | '), citations }));
      else if (block.kind === 'metric_grid') block.metrics.forEach((metric) => found.push({ where, text: `${metric.label}: ${metric.value}. ${metric.detail || ''}`, citations }));
    }
  }
  return found.filter((entry) => entry.text.trim());
}

/**
 * The report's Salesforce claims, each with what its citation points to: the
 * passage read, or a note that the page was never read.
 */
export function salesforceClaimsWithPassages(spec: AnalysisArtifactSpecV1, pages: Map<string, SalesforceDocQuotedPage>): string {
  const sourcesById = new Map((spec.sources || []).map((source) => [source.id, source]));
  const lines: string[] = [];
  let budget = CLAIM_EVIDENCE_BUDGET_CHARS;
  for (const entry of texts(spec)) {
    const blockHasInlineMarkers = /\[S\d+\]/.test(entry.text);
    for (const sentence of splitSentences(entry.text)) {
      const inline = Array.from(sentence.matchAll(/\[(S\d+)\]/g), (match) => match[1]);
      const cited = inline.length > 0 ? inline : blockHasInlineMarkers ? [] : entry.citations;
      const salesforceSources = cited.map((id) => sourcesById.get(id)).filter((source) => source && isSalesforceUrl(source.url));
      if (salesforceSources.length === 0 && !attributesToSalesforce(sentence)) continue;
      const claim: string[] = [`- ${entry.where}: "${sentence}"`];
      if (salesforceSources.length === 0) claim.push('  Cites no Salesforce documentation.');
      for (const source of salesforceSources) {
        const page = pages.get(salesforcePageKey(source!.url!)!);
        if (!page) {
          claim.push(`  ${source!.id} ${source!.url}: no docs lookup in this session read this page.`);
        } else if (page.passages.length === 0) {
          claim.push(`  ${source!.id} [${page.citationId}] ${page.title}: read, but its passages weren't shown inline (they are in the lookup's file).`);
        } else {
          const passage = page.passages.join('\n...\n');
          claim.push(`  ${source!.id} [${page.citationId}] ${page.title} — passage read:`);
          claim.push(`    ${(passage.length > PASSAGE_CHARS_PER_CLAIM ? `${passage.slice(0, PASSAGE_CHARS_PER_CLAIM)}...` : passage).replace(/\n/g, '\n    ')}`);
        }
      }
      const text = claim.join('\n');
      if (text.length > budget) {
        lines.push('- (more Salesforce claims not shown: past this brief\'s length)');
        return lines.join('\n');
      }
      budget -= text.length;
      lines.push(text);
    }
  }
  return lines.join('\n');
}

/** Index of the user message that opened the reviewed turn. */
function turnStart(messages: Message[], operatorIndex: number): number {
  let start = operatorIndex;
  while (start > 0 && messages[start - 1].senderType !== 'user') start -= 1;
  return Math.max(0, start - 1);
}

/** The Reviewer's Salesforce section for the reviewed turn, or '' when its report makes no Salesforce claims. */
export function buildSalesforceReviewEvidence(messages: Message[], artifacts: Artifact[], operatorIndex: number): string {
  const start = turnStart(messages, operatorIndex);
  const turnStartedAt = messages[start]?.timestamp ?? 0;
  const report = artifacts
    .filter((artifact) => artifact.type === 'analysis_artifact_spec' && artifact.createdAt >= turnStartedAt)
    .sort((a, b) => b.createdAt - a.createdAt)[0];
  const spec = report ? tryParseAnalysisArtifactSpecText(report.data) : null;
  if (!spec) return '';
  const claims = salesforceClaimsWithPassages(spec, docsPagesRead(messages.slice(0, operatorIndex + 1)));
  if (!claims) return '';
  return [
    `Salesforce documentation claims in the report "${spec.title}", each with the passage its citation points to:`,
    claims,
    'For each claim, check the passage says what the report says. A claim its passage does not support, one citing a page no lookup read, or one attributing behaviour to Salesforce with no passage is a reject_claim or revise item (P0 when the report\'s recommendations rest on it).',
  ].join('\n');
}

/** "[SF-D…] title - url" for each docs page the operator read in the turn, for the verifier's brief. */
export function docsPagesReadInTurn(messages: Message[], operatorIndex: number): string[] {
  const start = turnStart(messages, operatorIndex);
  return Array.from(docsPagesRead(messages.slice(start, operatorIndex + 1)).values())
    .map((page) => `[${page.citationId}] ${page.title} - ${page.url}`);
}
