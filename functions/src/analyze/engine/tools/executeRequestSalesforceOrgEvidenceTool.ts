/** Ported from symposium-ai-web src/services/analyze/orchestrator/tools/executeRequestSalesforceOrgEvidenceTool.ts (Phase 3), logic unchanged. */
import type { ToolResult } from '../../contract/lib/ai/tools/types';
import type { RequestSalesforceOrgEvidenceArgs } from '../../contract/lib/ai/tools/built-in/request-salesforce-org-evidence';

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
    : [];
}

export function normalizeRequestSalesforceOrgEvidenceArgs(args: Record<string, unknown>): Required<RequestSalesforceOrgEvidenceArgs> {
  return {
    reason: typeof args.reason === 'string' ? args.reason.trim() : '',
    unverified_claims: toStringArray(args.unverified_claims),
    investigation_prompt: typeof args.investigation_prompt === 'string' ? args.investigation_prompt.trim() : '',
  };
}

/**
 * Pure executor: it cannot touch session state (executors run in the
 * orchestrator, not React). The UI card is dispatched from the
 * stream-completed handler when it sees this tool's result; the orchestrator
 * ends the turn there to wait for the user.
 */
export function executeRequestSalesforceOrgEvidenceTool(
  toolCallId: string,
  args: Record<string, unknown>,
): ToolResult {
  const normalized = normalizeRequestSalesforceOrgEvidenceArgs(args);

  if (!normalized.reason || normalized.investigation_prompt.length < 80) {
    return {
      toolCallId,
      success: false,
      error: 'request_salesforce_org_evidence requires a reason and a substantive investigation_prompt — the full brief the org-connected agent will follow (specific questions, why each matters, concrete read-only checks).',
    };
  }

  return {
    toolCallId,
    success: true,
    content: [
      'Org evidence request presented to the user with a copyable local-agent handoff prompt targeting your requested checks, an import affordance for the resulting findings packet, and a continue-without-evidence option.',
      'Your turn ends here. Do not call this tool again this session.',
      'The analysis resumes when the user imports the findings packet (verify its claims via salesforce_metadata_audit operation="packet_findings", reusing the existing audit artifacts) or asks you to continue without org evidence (finalize with confidence labels on the unverified claims).',
    ].join('\n'),
  };
}
