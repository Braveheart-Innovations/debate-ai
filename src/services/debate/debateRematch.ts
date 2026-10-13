import { getRoundsForPresetId, type DebateFormatId } from '@/config/debate/formats';
import type { AIConfig, ChatSession, DebateVoiceConfig } from '@/types';

/**
 * Everything Debate setup needs to stage a debate again: the user lands on setup
 * with it pre-filled and can start as-is or adjust it first.
 */
export interface DebateRematchSetup {
  /** Debater slots in speaking order, each carrying its model and personality. */
  selectedAIs: AIConfig[];
  topic: string;
  formatId: DebateFormatId;
  /** The setup length choice (3, 5 or 7). */
  exchanges: number;
  voiceConfig?: DebateVoiceConfig;
}

/** Params for `navigate('MainTabs', ...)` that open Debate setup pre-filled for a rematch. */
export const buildRematchNavigationParams = (rematch: DebateRematchSetup) => ({
  screen: 'DebateTab' as const,
  params: { rematch, rematchKey: `${Date.now()}` },
});

/** Rebuilds the setup of a debate saved to History, or null when it lacks a motion or debaters. */
export const buildRematchSetupFromSavedDebate = (session: ChatSession): DebateRematchSetup | null => {
  if (!session.topic || session.selectedAIs.length === 0) return null;
  const config = session.debateConfig;

  return {
    selectedAIs: session.selectedAIs,
    topic: session.topic,
    formatId: config?.formatId || 'oxford',
    exchanges: getRoundsForPresetId(config?.presetId),
    voiceConfig: config?.voiceConfig,
  };
};
