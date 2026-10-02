// Core type definitions for Symposium AI

import type {
  AudienceDecisionResult,
  AudienceStance,
  AudienceVoteStage,
  DebateFormatId,
  DebateSideId,
  OxfordAudienceQuestions,
  PhaseId,
} from '../config/debate/formats';

export type AIProvider = 'claude' | 'openai' | 'chatgpt' | 'google' | 'perplexity' | 'mistral' | 'cohere' | 'deepseek' | 'grok' | 'moonshot' | 'zai';
export type UIMode = 'simple' | 'expert';
export type SubscriptionTier = 'free' | 'pro' | 'business';

export interface User {
  id: string;
  email?: string;
  subscription: SubscriptionTier;
  uiMode: UIMode;
  apiKeyStatuses?: Partial<Record<AIProvider, {
    configured: boolean;
    maskedLabel: string;
    updatedAt: number;
  }>>;
  preferences: {
    theme: 'light' | 'dark' | 'auto';
    fontSize: 'small' | 'medium' | 'large';
  };
}

export interface AIConfig {
  id: string;
  provider: AIProvider;
  name: string;
  model: string;  // Made required, no longer optional
  modelConfig?: {
    displayName: string;
    contextLength: number;
    pricing?: {
      inputPer1M: number;
      outputPer1M: number;
    };
  };
  personality?: string;
  parameters?: ModelParameters;  // For expert mode
  avatar?: string;
  icon?: string | number; // Logo image or letter
  iconType?: 'image' | 'letter';
  color?: string;
}

export interface Citation {
  index: number;
  url: string;
  title?: string;
  snippet?: string;
  domain?: string; // Optional: extracted from URL for display
}

// Image generation types
export type ImageGenerationMode = 'single' | 'compare';

export interface GeneratedImageMetadata {
  url: string;
  // NOTE: base64 is intentionally NOT stored - it bloats AsyncStorage/SQLite
  // For refinement, base64 is loaded from file when needed
  revisedPrompt?: string;
  prompt: string;
  model: string;
  providerId: string;
  // For refinement tracking
  isRefinement?: boolean;
  refinementOf?: string; // Message ID of the original image
}

export interface DebateVoteResult {
  round: number;
  winnerId: string;
  winnerName?: string;
  votingLabel: string;
  criterion: string;
  timestamp: number;
  voteKind?: 'checkpoint' | 'audience_stance';
  audienceVoteStage?: AudienceVoteStage;
  audienceStance?: AudienceStance;
}

export interface DebateSpeechMetadata {
  formatId: DebateFormatId;
  presetId: string;
  messageIndex: number;
  totalMessages: number;
  phase: PhaseId;
  speaker: DebateSideId;
  speakerSlot?: number;
  cxRole?: 'questioner' | 'answerer';
  audienceQuestionTarget?: DebateSideId;
  label: string;
}

export interface DebateVoiceSelection {
  voiceId: string;
  voiceName: string;
}

export type DebateInterstitialKind = 'intro' | 'phase_segue' | 'audience_question' | 'vote_segue' | 'winner';
export type DebatePodcastFlowStep =
  | 'podcast_intro'
  | 'podcast_phase_segue'
  | 'podcast_audience_question'
  | 'podcast_vote_setup'
  | 'podcast_winner';

export interface DebatePodcastMCConfig {
  id: string;
  provider: AIProvider;
  name: string;
  model: string;
}

export interface DebatePodcastConfig {
  enabled: true;
  scriptMode: 'byok_ai';
  outputMode: 'playlist';
  mc: DebatePodcastMCConfig;
  mcVoice: DebateVoiceSelection;
}

export interface DebateVoiceConfig {
  enabled: true;
  providerId: 'elevenlabs';
  ttsModelId?: string;
  debaterVoices: Record<string, DebateVoiceSelection>;
  podcast?: DebatePodcastConfig;
}

export interface DebateAudioMetadata {
  status: 'generating' | 'ready' | 'failed';
  voiceId: string;
  voiceName: string;
  modelId?: string;
  generatedAt?: number;
  mimeType?: string;
  uri?: string;
  error?: string;
  characterCost?: number;
  requestId?: string;
  ttsModelId?: string;
  estimatedCreditCost?: number;
  // True when the spoken/synthesized text was shortened to fit the TTS character budget. The full
  // transcript (message.content) is never mutated — only the generated audio is bounded.
  trimmedForTts?: boolean;
  // Character count of the sanitized speech BEFORE any TTS trim (only set when trimmedForTts).
  untrimmedCharacterCount?: number;
}

export interface DebateInterstitialMetadata {
  kind: DebateInterstitialKind;
  flowStep: DebatePodcastFlowStep;
  label: string;
  generatedByProvider?: AIProvider;
  generatedByModel?: string;
  usedTemplateFallback?: boolean;
  fallbackReason?: string;
  fallbackDetail?: string;
}

export interface MessageMetadata {
  sessionId?: string;
  conversationTurn?: number;
  responseTime?: number;
  wordCount?: number;
  modelUsed?: string; // Track which AI model actually responded
  // Logical AI identity for role/slot mapping, especially when the same provider appears more than once.
  aiId?: string;
  // Which provider generated this AI message.
  providerId?: string;

  // Rich content support
  webSearchEnabled?: boolean; // Whether web search was used for this response
  citations?: Citation[];  // For Perplexity and other providers with sources
  providerMetadata?: Record<string, unknown>; // Flexible field for provider-specific data

  // Image generation metadata
  generatedImage?: GeneratedImageMetadata;

  // Debate vote checkpoint metadata
  debateVote?: DebateVoteResult;

  // Debate speech role metadata
  debateSpeech?: DebateSpeechMetadata;

  // Debate podcast MC/interstitial metadata
  debateInterstitial?: DebateInterstitialMetadata;

  // Oxford audience Q&A checkpoint metadata
  debateAudienceQuestions?: OxfordAudienceQuestions;

  // Debate TTS generation metadata
  debateAudio?: DebateAudioMetadata;

  // Local lifecycle recovery metadata for interrupted, cancelled, failed, or
  // cut-off work. 'truncated' = the provider stopped at its output token limit
  // (finish reason "length"); the partial text is kept and can be continued.
  lifecycle?: {
    status: 'interrupted' | 'cancelled' | 'failed' | 'truncated';
    reason?: string;
    interruptedAt?: number;
    partial?: boolean;
    retryOf?: string;
    retryable?: boolean;
  };
}

export interface MessageAttachment {
  type: 'image' | 'document' | 'video' | 'audio';
  uri: string;
  mimeType: string;
  // NOTE: base64 should only be set for user-uploaded images (temporary, for API calls)
  // Do NOT set base64 for generated images - they're saved to disk via fileCache
  base64?: string;
  fileName?: string;
  fileSize?: number; // in bytes
}

export interface Message {
  id: string;
  sender: string;
  senderType: 'user' | 'ai';
  content: string;
  timestamp: number;
  mentions?: string[];
  metadata?: MessageMetadata;
  attachments?: MessageAttachment[];
}

export interface ChatSession {
  id: string;
  selectedAIs: AIConfig[];
  messages: Message[];
  isActive: boolean;
  createdAt: number;
  startTime?: number;
  lastMessageAt?: number;
  sessionType?: 'chat' | 'comparison' | 'debate'; // New field for history organization
  topic?: string; // For debate sessions to store the debate topic
  // Debate-specific optional configuration snapshot for history/analytics
  debateConfig?: {
    formatId?: 'oxford' | 'lincoln_douglas' | 'policy' | 'socratic';
    presetId?: string;
    rounds?: number;
    tempo?: 'streaming' | 'fixed';
    postStreamPauseMs?: number;
    civility?: 1 | 2 | 3 | 4 | 5; // 1=friendly, 3=neutral, 5=hostile but bounded
    voteResults?: DebateVoteResult[];
    audienceResult?: AudienceDecisionResult;
    audienceQuestions?: OxfordAudienceQuestions;
    voiceConfig?: DebateVoiceConfig;
  };
}

export interface PersonalityConfig {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  traits: {
    formality: number; // 0-1
    humor: number; // 0-1
    technicality: number; // 0-1
    empathy: number; // 0-1
  };
  isPremium: boolean;
}

// Expert mode types
export interface ModelParameters {
  temperature: number;
  maxTokens: number;
  topP?: number;
  topK?: number; // Claude-specific parameter
  frequencyPenalty?: number;
  presencePenalty?: number;
  stopSequences?: string[];
  seed?: number;
  useExtendedContext?: boolean; // Enable 1M context for supported Claude models
  useExtendedOutput?: boolean; // Enable 128K output for supported Claude models
}

export interface ExpertConfig {
  modelSelection: {
    provider: AIProvider;
    model: string;
    parameters: ModelParameters;
  }[];
  systemPrompt: string;
  contextManagement: 'auto' | 'manual';
  turnOrder: 'round-robin' | 'free-for-all' | 'moderated';
}

// Type alias for AI (same as AIConfig for compatibility)
export type AI = AIConfig;

// Navigation types
export type RootStackParamList = {
  Welcome: undefined;
  MainTabs:
    | { screen?: 'Home' | 'DebateTab' | 'Compare' | 'CreateTab' | 'History' }
    | undefined;
  Home: undefined;
  Chat: {
    sessionId: string;
    resuming?: boolean;
    searchTerm?: string;
    initialPrompt?: string;
    userPrompt?: string;
    autoSend?: boolean;
    demoSampleId?: string;
    aiPersonalities?: { [aiId: string]: string };
    selectedModels?: { [aiId: string]: string };
  };
  Settings: undefined;
  APIConfig: undefined;
  Subscription: undefined;
  ExpertMode: { from?: 'settings' } | undefined;
  Debate: {
    selectedAIs: AI[];
    topic?: string;
    personalities?: { [key: string]: string };
    formatId?: 'oxford' | 'lincoln_douglas' | 'policy' | 'socratic';
    rounds?: number;
    exchanges?: number;
    civility?: 1 | 2 | 3 | 4 | 5;
    demoDebateId?: string;
    demoSample?: import('@/types/demo').DemoDebate;
    rematchKey?: string;
    voiceConfig?: DebateVoiceConfig;
  };
  DebateTranscript: { session: ChatSession };
  Compare?: undefined;
  CompareSession: { leftAI: AIConfig; rightAI: AIConfig; sessionId?: string; resuming?: boolean; initialPrompt?: string };
  CreateTab: undefined;
  CreateSession: {
    focusAssetId?: string;
    focusMediaId?: string;
    galleryTab?: 'all' | 'image' | 'video' | 'audio';
  };
  Stats: undefined;
  PrivacyPolicy: undefined;
  TermsOfService: undefined;
  PersonalitySystem: undefined;
};

// Re-export personality types
export * from './personality';
