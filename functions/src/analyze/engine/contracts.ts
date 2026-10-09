/**
 * Session shapes shared by the ported loop modules.
 * Ported from symposium-ai-web src/services/analyze/orchestrator/contracts.ts
 * (AnalyzeSession, AnalyzeStatus); the client-only dependency types stay behind.
 */
import type { AI, Message } from '../contract/types';

export interface AnalyzeSession {
  id: string;
  ai: AI;
  messages: Message[];
  startTime: number;
  status: AnalyzeStatus;
}

export enum AnalyzeStatus {
  IDLE = 'idle',
  SENDING = 'sending',
  STREAMING = 'streaming',
  TOOL_CALLING = 'tool_calling',
  TOOL_EXECUTING = 'tool_executing',
  COMPLETED = 'completed',
  ERROR = 'error',
}
