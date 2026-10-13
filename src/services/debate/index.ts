/**
 * Debate Services Index
 * Centralized exports for all debate-related services
 */

export { DebateOrchestrator, DebateStatus } from './DebateOrchestrator';
export { DebateRulesEngine } from './DebateRulesEngine';
export { VotingService } from './VotingService';
export { DebatePromptBuilder } from './DebatePromptBuilder';

// Debate Setup Services
export { TopicService } from './TopicService';
export {
  DEBATE_AUDIO_TTS_PROMPT_LIMIT,
  DebateVoiceGenerationError,
  generateDebateVoiceAudio,
} from './DebateVoiceService';
export {
  DEBATE_VOICE_PACK_PAUSE_MS,
  buildDebatePodcastCompilePlan,
  createDebatePodcastGalleryEntry,
  createDebateVoicePackGalleryEntry,
  getDebateVoicePackCandidates,
} from './debateVoicePack';
export { sanitizeDebateSpeechForTTS } from './debateAudioSanitizer';
export {
  buildDebateInterstitialTemplate,
  createDebateInterstitialMessage,
} from './DebateInterstitialService';
export {
  applyDebateOutputTokenCap,
  getDebateSpeechLengthGuidance,
} from './debateSpeechLength';
export {
  buildRematchNavigationParams,
  buildRematchSetupFromSavedDebate,
  type DebateRematchSetup,
} from './debateRematch';

export type { 
  DebateSession,
  DebateError,
  DebateAudienceQuestionsPrompt,
  DebateContinuationPrompt,
  DebateEvent,
  DebateEventHandler,
} from './DebateOrchestrator';

export type {
  DebateRules,
  RoundInfo,
} from './DebateRulesEngine';

export type {
  AudienceDecisionResult,
  AudienceStance,
  AudienceVoteStage,
  VoteRecord,
  ScoreBoard,
  VotingState,
} from './VotingService';

export type {
  PromptContext,
} from './DebatePromptBuilder';

export type {
  DebatePodcastCompilePlan,
  DebateVoicePackCandidate,
  DebateVoicePackCandidateStatus,
} from './debateVoicePack';

export type {
  DebateFormatId,
  FormatSpec,
  MessageSpec,
  OxfordAudienceQuestions,
  PhaseId,
  PresetConfig,
} from '../../config/debate/formats';
