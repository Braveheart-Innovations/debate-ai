/**
 * The state actions the capture pipeline dispatches: the subset of the web
 * reducer's AnalyzeAction (symposium-ai-web src/context/analyze/types.ts) that
 * streamCompletedHandler uses, with the same payloads. On the server they are
 * collected and applied to Firestore (captureRound.ts) instead of React state.
 */
import type { Artifact } from '../contract/types/notebook';

/** Ported from symposium-ai-web src/context/analyze/types.ts, unchanged. */
export interface AnalyzeOrgEvidenceRequest {
  /** Tool call id of the request_salesforce_org_evidence call. */
  id: string;
  /** Epoch ms when the AI made the request — the packet preselection recency basis. */
  requestedAt: number;
  reason: string;
  unverifiedClaims: string[];
  /**
   * The AI-authored brief for the org-connected agent — specific questions,
   * why each matters, concrete checks. The copied handoff prompt is this brief
   * plus the app-owned boundary and packet output contract.
   */
  investigationPrompt: string;
}

export type AnalyzeAction =
  | { type: 'UPDATE_MESSAGE'; payload: { id: string; content: string; metadata?: Record<string, unknown> } }
  | { type: 'ADD_ARTIFACT'; payload: Artifact }
  | { type: 'REMOVE_ARTIFACT'; payload: string }
  | { type: 'SET_PENDING_ORG_EVIDENCE_REQUEST'; payload: AnalyzeOrgEvidenceRequest };
