/**
 * Reviewer, Check independently, and review hand-off texts. Ported from
 * symposium-ai-web src/services/analyze/ReviewService.ts (Phase 3 Step 4),
 * logic unchanged except that item ids and createdAt can be supplied, so a
 * redelivered reviewer pass rewrites the same reviewItems docs.
 */
import type { AIConfig } from '../contract/types';
import type {
  AnalyzeVerificationVerdict,
  AnalyzeReviewActionType,
  AnalyzeReviewCost,
  AnalyzeReviewItem,
  AnalyzeReviewPriority,
} from '../contract/types/analyze';
import type { Artifact } from '../contract/types/notebook';
import type { Message } from '../contract/types';

const MAX_REVIEW_ITEMS_PER_REVIEWER = 5;
const MAX_ARTIFACT_CONTEXT = 12;
const MAX_OPERATOR_RESPONSE_CHARS = 8000;
const MAX_USER_PROMPT_CHARS = 2000;

// Reviewer stance: a fixed, balanced analytical focus (salvaged from the retired
// 'general_analyst' perspective). The report type now carries authoring emphasis; the reviewer
// critiques the produced report against this general standard — no selectable per-reviewer lens.
const REVIEWER_FOCUS_GUIDANCE =
  'Review with balanced analytical judgment: weigh evidence quality, assumptions, methodology, '
  + 'risks, and decision-ready takeaways, and make uncertainty visible.';

const PRIORITY_ORDER: Record<AnalyzeReviewPriority, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
};

const VALID_PRIORITIES: AnalyzeReviewPriority[] = ['P0', 'P1', 'P2', 'P3'];
const VALID_ACTIONS: AnalyzeReviewActionType[] = ['verify', 'expand', 'revise', 'countercheck', 'reject_claim'];
const VALID_COSTS: AnalyzeReviewCost[] = ['low', 'med', 'high'];

export interface ReviewerPromptInput {
  reviewerName: string;
  /** The user's latest message before the reviewed answer. */
  userPrompt: string;
  /**
   * Everything said before the reviewed answer: user messages and the operator's
   * replies (e.g. a clarifying question and the user's answer to it). Without it
   * a reply like "yes" reaches the reviewer as the whole request.
   */
  conversation?: ConversationTurn[];
  operatorName: string;
  operatorResponse: string;
  artifacts: Artifact[];
  manualRequest?: string;
}

export interface ConversationTurn {
  role: 'user' | 'operator';
  content: string;
}

/**
 * The user ↔ operator conversation in messages[0, endExclusive): user messages and
 * the operator's prose replies. Tool traffic, empty tool-call turns, and reviewer /
 * verifier messages are left out — they aren't part of what was asked and answered.
 */
export function buildConversationTurns(messages: Message[], endExclusive: number): ConversationTurn[] {
  const turns: ConversationTurn[] = [];
  for (const message of messages.slice(0, endExclusive)) {
    const content = (message.content || '').trim();
    if (!content) continue;
    if (message.senderType === 'user') {
      turns.push({ role: 'user', content });
      continue;
    }
    if (message.senderType !== 'ai' || message.metadata?.toolCalls?.length) continue;
    const meta = message.metadata?.providerMetadata as Record<string, unknown> | undefined;
    if (meta?.analyzeReviewer === true || meta?.analyzeVerification === true) continue;
    turns.push({ role: 'operator', content });
  }
  return turns;
}

function formatConversation(turns: ConversationTurn[], operatorName: string): string {
  return turns
    .map((turn) => `${turn.role === 'user' ? 'User' : operatorName}: ${turn.content}`)
    .join('\n\n');
}

interface RawReviewItem {
  priority?: unknown;
  confidence?: unknown;
  actionType?: unknown;
  title?: unknown;
  details?: unknown;
  artifactRefs?: unknown;
  expectedOutcome?: unknown;
  estimatedCost?: unknown;
}

interface RawReviewPayload {
  items?: unknown;
}

function safeString(value: unknown, fallback = ''): string {
  if (typeof value !== 'string') return fallback;
  return value.trim();
}

function toPriority(value: unknown): AnalyzeReviewPriority {
  if (typeof value !== 'string') return 'P2';
  const normalized = value.toUpperCase();
  return VALID_PRIORITIES.includes(normalized as AnalyzeReviewPriority)
    ? normalized as AnalyzeReviewPriority
    : 'P2';
}

function toActionType(value: unknown): AnalyzeReviewActionType {
  if (typeof value !== 'string') return 'verify';
  const normalized = value.trim().toLowerCase().replace(/\s+/g, '_');
  return VALID_ACTIONS.includes(normalized as AnalyzeReviewActionType)
    ? normalized as AnalyzeReviewActionType
    : 'verify';
}

function toCost(value: unknown): AnalyzeReviewCost {
  if (typeof value !== 'string') return 'med';
  const normalized = value.trim().toLowerCase();
  return VALID_COSTS.includes(normalized as AnalyzeReviewCost)
    ? normalized as AnalyzeReviewCost
    : 'med';
}

function toConfidence(value: unknown): number {
  const raw = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(raw)) return 0.5;
  return Math.max(0, Math.min(1, raw));
}

function extractJsonCandidate(response: string): string | null {
  const trimmed = response.trim();
  if (!trimmed) return null;

  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    return trimmed;
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const objectStart = trimmed.indexOf('{');
  const objectEnd = trimmed.lastIndexOf('}');
  if (objectStart !== -1 && objectEnd > objectStart) {
    return trimmed.slice(objectStart, objectEnd + 1);
  }

  const arrayStart = trimmed.indexOf('[');
  const arrayEnd = trimmed.lastIndexOf(']');
  if (arrayStart !== -1 && arrayEnd > arrayStart) {
    return trimmed.slice(arrayStart, arrayEnd + 1);
  }

  return null;
}

function parsePayloadItems(response: string): RawReviewItem[] {
  const candidate = extractJsonCandidate(response);
  if (!candidate) return [];

  try {
    const parsed = JSON.parse(candidate) as RawReviewPayload | RawReviewItem[];
    if (Array.isArray(parsed)) {
      return parsed as RawReviewItem[];
    }
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as RawReviewPayload).items)) {
      return (parsed as RawReviewPayload).items as RawReviewItem[];
    }
  } catch {
    return [];
  }

  return [];
}

function buildArtifactContext(artifacts: Artifact[]): string {
  if (artifacts.length === 0) return 'None';
  return artifacts
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_ARTIFACT_CONTEXT)
    .map((artifact) => `- ${artifact.id} | ${artifact.name} | ${artifact.type}`)
    .join('\n');
}

/** Item ids and creation time; the defaults are the browser's. */
export interface ReviewItemIdentity {
  makeId?: (index: number) => string;
  now?: number;
}

function normalizeRawItem(
  reviewer: AIConfig,
  raw: RawReviewItem,
  allowedArtifactIds: Set<string>,
  index: number,
  identity: ReviewItemIdentity,
): AnalyzeReviewItem | null {
  const title = safeString(raw.title);
  const details = safeString(raw.details);
  const expectedOutcome = safeString(raw.expectedOutcome);

  if (!title || !details || !expectedOutcome) {
    return null;
  }

  const artifactRefs = Array.isArray(raw.artifactRefs)
    ? raw.artifactRefs
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim())
      .filter((value) => value.length > 0 && allowedArtifactIds.has(value))
      .slice(0, 5)
    : [];

  return {
    id: identity.makeId ? identity.makeId(index) : `review-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    reviewerId: reviewer.id,
    reviewerName: reviewer.name,
    priority: toPriority(raw.priority),
    confidence: toConfidence(raw.confidence),
    actionType: toActionType(raw.actionType),
    title,
    details,
    artifactRefs,
    expectedOutcome,
    estimatedCost: toCost(raw.estimatedCost),
    selected: false,
    status: 'pending',
    createdAt: identity.now ?? Date.now(),
  };
}

export function getAnalyzeReviewerSystemPrompt(): string {
  return [
    'You are a reviewer in Analyze mode.',
    'You are critique-only. Never call tools. Never invent data.',
    REVIEWER_FOCUS_GUIDANCE,
    'Return strict JSON only. No markdown fences.',
    'Schema:',
    '{ "items": [{ "priority": "P0|P1|P2|P3", "confidence": 0-1, "actionType": "verify|expand|revise|countercheck|reject_claim", "title": "...", "details": "...", "artifactRefs": ["artifact-id"], "expectedOutcome": "...", "estimatedCost": "low|med|high" }] }',
    `Return at most ${MAX_REVIEW_ITEMS_PER_REVIEWER} items.`,
  ].join('\n');
}

export function buildAnalyzeReviewerPrompt(input: ReviewerPromptInput): string {
  const userPrompt = input.userPrompt.slice(0, MAX_USER_PROMPT_CHARS);
  const operatorResponse = input.operatorResponse.slice(0, MAX_OPERATOR_RESPONSE_CHARS);
  const manualRequest = safeString(input.manualRequest);

  const conversation = input.conversation && input.conversation.length > 0
    ? formatConversation(input.conversation, input.operatorName)
    : '';

  return [
    `Reviewing output from operator: ${input.operatorName}.`,
    manualRequest ? `User reviewer request: ${manualRequest}` : '',
    '',
    ...(conversation
      ? ['Conversation before this response (the user\'s request and any clarifications):', conversation]
      : ['Original user prompt:', userPrompt || '(empty)']),
    '',
    'Operator response:',
    operatorResponse || '(empty)',
    '',
    'Available artifact references (use IDs exactly as listed when relevant):',
    buildArtifactContext(input.artifacts),
    '',
    'Provide prioritized, actionable follow-up suggestions only.',
    'Do not repeat obvious operator steps unless there is clear risk or missing evidence.',
  ].filter(Boolean).join('\n');
}

export function parseAnalyzeReviewItemsFromResponse(
  reviewer: AIConfig,
  response: string,
  artifacts: Artifact[],
  identity: ReviewItemIdentity = {},
): AnalyzeReviewItem[] {
  const allowedArtifactIds = new Set(artifacts.map((artifact) => artifact.id));
  const rawItems = parsePayloadItems(response).slice(0, MAX_REVIEW_ITEMS_PER_REVIEWER);

  const items = rawItems
    .map((raw, index) => normalizeRawItem(reviewer, raw, allowedArtifactIds, index, identity))
    .filter((item): item is AnalyzeReviewItem => item !== null);

  return sortAnalyzeReviewItems(items);
}

export function sortAnalyzeReviewItems(items: AnalyzeReviewItem[]): AnalyzeReviewItem[] {
  return items
    .slice()
    .sort((a, b) => {
      const priorityDelta = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      if (priorityDelta !== 0) return priorityDelta;
      if (a.confidence !== b.confidence) return b.confidence - a.confidence;
      return a.createdAt - b.createdAt;
    });
}

export function mergeAnalyzeReviewItems(
  existing: AnalyzeReviewItem[],
  incoming: AnalyzeReviewItem[],
): AnalyzeReviewItem[] {
  const map = new Map<string, AnalyzeReviewItem>();
  for (const item of existing) {
    map.set(item.id, item);
  }
  for (const item of incoming) {
    map.set(item.id, item);
  }
  return sortAnalyzeReviewItems(Array.from(map.values()));
}

// ---------------------------------------------------------------------------
// Check independently: a different model independently re-derives a review item.
// ---------------------------------------------------------------------------

const VERIFIABLE_ACTIONS = new Set<AnalyzeReviewActionType>(['verify', 'countercheck', 'reject_claim']);

export function isVerifiableReviewItem(item: AnalyzeReviewItem): boolean {
  return VERIFIABLE_ACTIONS.has(item.actionType);
}

export interface VerificationEvidence {
  /** Python the operator ran in the reviewed turn. */
  code: string[];
  /** URLs and endpoints the operator fetched. */
  sources: string[];
}

export function buildVerificationTask(input: {
  item: AnalyzeReviewItem;
  userPrompt: string;
  conversation?: ConversationTurn[];
  operatorName: string;
  operatorResponse: string;
  evidence: VerificationEvidence;
}): { task: string } {
  const { item, evidence } = input;
  const sections = [
    `Independently check this point raised by ${item.reviewerName} about ${input.operatorName}'s analysis.`,
    `## Point to check\n${item.title}\n\n${item.details}${item.expectedOutcome ? `\n\nWhat resolving it looks like: ${item.expectedOutcome}` : ''}`,
    input.conversation && input.conversation.length > 0
      ? `## The conversation (the user's request and any clarifications)\n${formatConversation(input.conversation, input.operatorName)}`
      : `## The user's request\n${input.userPrompt || '(not available)'}`,
    `## ${input.operatorName}'s answer (the claims under review)\n${input.operatorResponse || '(not available)'}`,
  ];
  if (evidence.sources.length > 0) {
    sections.push(`## Sources ${input.operatorName} used\n${evidence.sources.map((source) => `- ${source}`).join('\n')}`);
  }
  if (evidence.code.length > 0) {
    sections.push(`## Code ${input.operatorName} ran (for diagnosing discrepancies only — do not just re-run it)\n${evidence.code.map((code) => `\`\`\`python\n${code}\n\`\`\``).join('\n\n')}`);
  }
  if (item.artifactRefs.length > 0) {
    sections.push(`Relevant files may be in /output or /data (artifact references: ${item.artifactRefs.join(', ')}).`);
  }
  return { task: sections.join('\n\n') };
}

export function parseVerificationVerdict(answer: string): { verdict: AnalyzeVerificationVerdict; summary: string } {
  const match = answer.match(/VERDICT:\s*\**\s*(CONFIRMED|DISPUTED|UNVERIFIABLE)\b/i);
  // No explicit verdict = nothing was established; never assume confirmation.
  const verdict = (match ? match[1].toLowerCase() : 'unverifiable') as AnalyzeVerificationVerdict;
  const summary = (match ? answer.replace(match[0], '') : answer).replace(/^[\s*:.-]+/, '').trim();
  return { verdict, summary };
}

const VERDICT_INSTRUCTIONS: Record<AnalyzeVerificationVerdict, string> = {
  confirmed: 'Required: no correction needed — the claim was independently confirmed; keep it.',
  disputed: 'Required: correct this claim in the report using the verifier\'s evidence and corrected value. If you still believe the original is right, re-derive it and explain why in your chat reply.',
  unverifiable: 'Required: find stronger evidence for this claim. If you cannot, mark it as uncertain in the report (say what could not be verified) or remove it.',
};

export function buildOperatorReviewHandoffPrompt(
  operatorName: string,
  selectedItems: AnalyzeReviewItem[],
): string {
  const lines = selectedItems.map((item, index) => {
    const artifactRefText = item.artifactRefs.length > 0
      ? item.artifactRefs.join(', ')
      : 'none';
    return [
      `${index + 1}. [${item.id}] ${item.title}`,
      `Priority: ${item.priority} | Confidence: ${item.confidence.toFixed(2)} | Cost: ${item.estimatedCost}`,
      `Action: ${item.actionType}`,
      `Details: ${item.details}`,
      `Artifacts: ${artifactRefText}`,
      `Expected outcome: ${item.expectedOutcome}`,
      ...(item.verification?.status === 'done' && item.verification.verdict
        ? [
          `Independent verification by ${item.verification.verifierName}: ${item.verification.verdict.toUpperCase()}\n${item.verification.summary ?? ''}`.trimEnd(),
          VERDICT_INSTRUCTIONS[item.verification.verdict],
        ]
        : []),
    ].join('\n');
  });

  return [
    `@${operatorName.toLowerCase()} execute the selected review items below.`,
    'For each item, provide status: completed | skipped | needs_user_input.',
    'Keep the response concise and structured by item ID.',
    // Without this, the operator dutifully baked the item-id/status bookkeeping
    // into the report spec as a "review log" table (raw internal ids in a live
    // ARB deck). The status report belongs in chat; the report gets content.
    'Item ids and statuses go in your CHAT REPLY ONLY — never into the report spec. Do NOT add review logs, revision histories, QA/status tables, or internal ids (review-*, block ids, page slugs) to the report. Apply each change to the affected report content itself; if a review materially changed a finding, reflect that in the affected blocks’ prose.',
    '',
    ...lines,
  ].join('\n');
}
