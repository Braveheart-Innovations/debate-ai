/**
 * Type definitions for the debate setup and management system
 */

import { AIConfig, PersonalityConfig } from './index';
import { TopicMode } from '../config/debate/debateSetupConfig';
import { SuggestedTopic, TopicCategory } from '../config/debate/suggestedTopics';

// Debate Configuration Types
export interface DebateConfig {
  topic: string;
  topicMode: TopicMode;
  debaters: AIDebater[];
  personalities: Map<string, Personality>;
  settings: DebateSettings;
  createdAt: number;
  estimatedDuration: number;
}

export interface DebateSettings {
  maxRounds: number;
  turnDuration: number; // in seconds
  allowInterruptions: boolean;
  moderationLevel: 'none' | 'light' | 'strict';
  isPremium: boolean;
}

// AI Debater Types
export interface AIDebater extends AIConfig {
  debatingStyle?: DebatingStyle;
  strengthAreas?: string[];
  weaknessAreas?: string[];
}

export interface DebatingStyle {
  aggression: number; // 0-1
  formality: number; // 0-1
  evidenceBased: number; // 0-1
  emotional: number; // 0-1
}

// Personality Types (extends the base PersonalityConfig)
export interface Personality extends PersonalityConfig {
  debateModifiers?: {
    argumentStyle: 'logical' | 'emotional' | 'balanced';
    interruption: number; // 0-1, likelihood to interrupt
    concession: number; // 0-1, likelihood to concede points
    aggression: number; // 0-1, debate aggression level
  };
}

// Topic Management Types
export interface TopicSelection {
  selectedTopic: string;
  topicMode: TopicMode;
  customTopic: string;
  suggestedTopics: SuggestedTopic[];
}

export interface TopicValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestions?: string[];
}

// Step Management Types
export type DebateStep = 'topic' | 'ai' | 'personality' | 'review';

export interface DebateStepState {
  currentStep: DebateStep;
  completedSteps: DebateStep[];
  canProceedToStep: (step: DebateStep) => boolean;
  stepProgress: number; // 0-100 percentage
}

// Validation Types
export interface ValidationResult {
  isValid: boolean;
  message?: string;
  errors: string[];
  warnings: string[];
}

export interface DebateValidationState {
  topic: ValidationResult;
  aiSelection: ValidationResult;
  personalities: ValidationResult;
  overall: ValidationResult;
}

// Debate Session Types
export interface DebateSession {
  id: string;
  config: DebateConfig;
  status: 'setup' | 'active' | 'paused' | 'completed' | 'cancelled';
  currentRound: number;
  messages: DebateMessage[];
  scores: DebateScore[];
  participants: DebateParticipant[];
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
}

export interface DebateMessage {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: number;
  round: number;
  messageType: 'opening' | 'response' | 'rebuttal' | 'closing' | 'system';
  metadata?: {
    responseTime?: number;
    wordCount?: number;
    sentiment?: number; // -1 to 1
  };
}

export interface DebateScore {
  round: number;
  scores: Record<string, number>; // participantId -> score
  winner?: string;
  totalVotes: number;
}

export interface DebateParticipant {
  id: string;
  ai: AIDebater;
  personality: Personality;
  position: 'pro' | 'con' | 'neutral';
  stats: {
    messagesCount: number;
    totalWords: number;
    averageResponseTime: number;
    score: number;
  };
}

// UI State Types
export interface DebateSetupUIState {
  isLoading: boolean;
  error?: string;
  selectedAIs: AIDebater[];
  topicSelection: TopicSelection;
  personalitySelections: Map<string, Personality>;
  currentStep: DebateStep;
  canProceed: boolean;
  validationState: DebateValidationState;
}

// Configuration Summary Types
export interface DebateConfigurationSummary {
  canStart: boolean;
  missingElements: string[];
  recommendations: string[];
  warnings: string[];
}

export interface DebateValidationSummary {
  topic: {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  };
  aiSelection: {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  };
  personalities: {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  };
  overall: {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  };
  canProceed: boolean;
  nextAction: string | null;
}

// Hook Return Types
export interface UseDebateSetupReturn {
  state: DebateSetupUIState;
  actions: {
    setCurrentStep: (step: DebateStep) => void;
    nextStep: () => void;
    previousStep: () => void;
    resetSetup: () => void;
    startDebate: () => Promise<void>;
    updateTopic: (topic: string, mode: TopicMode) => void;
    toggleAI: (ai: AIDebater) => void;
    setPersonality: (aiId: string, personality: Personality) => void;
  };
  validation: DebateValidationState;
  canProceed: boolean;
  steps: UseDebateStepsReturn;
  topic: UseDebateTopicReturn;
  aiSelection: UseAIDebaterSelectionReturn;
  personalities: UsePersonalitySelectionReturn;
  getConfigurationSummary: () => DebateConfigurationSummary;
  getEstimatedDuration: () => number;
}

export interface UseDebateStepsReturn {
  currentStep: DebateStep;
  totalSteps: number;
  goToStep: (step: DebateStep) => void;
  nextStep: () => void;
  previousStep: () => void;
  isFirstStep: boolean;
  isLastStep: boolean;
  stepProgress: number;
  completedSteps: DebateStep[];
  canProceedToStep: (step: DebateStep) => boolean;
  markStepCompleted: (step: DebateStep) => void;
  resetSteps: () => void;
  getStepLabel: (step: DebateStep) => string;
}

export interface UseAIDebaterSelectionReturn {
  selectedAIs: AIDebater[];
  toggleAI: (ai: AIDebater) => void;
  clearSelection: () => void;
  canProceed: boolean;
  validationMessage: string;
  isValidSelection: boolean;
  maxReached: boolean;
  selectionSummary: {
    count: number;
    providers: string[];
    isValid: boolean;
    canProceed: boolean;
  };
  isAISelected: (aiId: string) => boolean;
  addAI: (ai: AIDebater) => boolean;
  removeAI: (aiId: string) => boolean;
  getRecommendedPairs: (availableAIs: AIDebater[]) => AIDebater[][];
  selectRecommendedPair: (pair: AIDebater[]) => void;
  optimizeForTopic: (topic: string, availableAIs: AIDebater[]) => void;
}

export interface UseDebateTopicReturn {
  selectedTopic: string;
  topicMode: TopicMode;
  customTopic: string;
  setTopicMode: (mode: TopicMode) => void;
  setCustomTopic: (topic: string) => void;
  selectSuggestedTopic: (topic: string) => void;
  generateSurpriseTopic: () => void;
  currentTopic: string;
  isValidTopic: boolean;
  validationMessage: string;
  suggestedTopics: SuggestedTopic[];
  loadSuggestedTopics: () => void;
  getRelatedTopics: (limit?: number) => SuggestedTopic[];
  searchTopics: (query: string) => SuggestedTopic[];
  getTopicCategory: () => TopicCategory | null;
  getEstimatedDuration: () => number;
  topicHistory: string[];
  finalizeTopic: () => string | null;
  resetTopic: () => void;
  validation: TopicValidationResult | ValidationResult;
}

export interface UsePersonalitySelectionReturn {
  selectedPersonalities: Map<string, Personality>;
  setPersonality: (aiId: string, personality: Personality) => void;
  resetPersonalities: () => void;
  hasCustomPersonalities: boolean;
  isPremiumFeature: boolean;
  availablePersonalities: Personality[];
  validation: ValidationResult;
  getPersonalityForAI: (aiId: string) => Personality | null;
  getPersonalityCombinations: () => { name: string; description: string; personalities: string[] }[];
  applyRecommendedCombination: (combination: { personalities: string[] }) => boolean;
  randomizePersonalities: () => void;
  getCompatibilityScore: () => number;
  getSummary: () => {
    totalAssigned: number;
    expectedTotal: number;
    uniqueCount: number;
    hasCustom: boolean;
    compatibilityScore: number;
    isComplete: boolean;
    isValid: boolean;
  };
}

export interface UseDebateValidationReturn {
  validateTopic: (topic: string) => ValidationResult;
  validateAISelection: (ais: AIDebater[]) => ValidationResult;
  validatePersonalities: (personalities: Map<string, Personality>) => ValidationResult;
  canStartDebate: boolean;
  validationErrors: string[];
  overallValidation: ValidationResult;
  topicValidation: ValidationResult;
  aiValidation: ValidationResult;
  personalityValidation: ValidationResult;
  getValidationSummary: () => DebateValidationSummary;
  getNextAction: () => string | null;
  isStepValid: (step: string) => boolean;
}

// Service Types
export interface DebateSetupServiceInterface {
  validateDebateConfiguration(config: DebateConfig): ValidationResult;
  createDebateSession(config: DebateConfig): DebateSession;
  getDefaultConfiguration(): Partial<DebateConfig>;
  calculateEstimatedDuration(topic: string, debaters: AIDebater[]): number;
}

export interface TopicServiceInterface {
  getSuggestedTopics(limit?: number): SuggestedTopic[];
  generateRandomTopic(): SuggestedTopic;
  validateCustomTopic(topic: string): TopicValidationResult;
  getTopicCategory(topic: string): TopicCategory | null;
  getRelatedTopics(topic: string, limit?: number): SuggestedTopic[];
  searchTopics(query: string): SuggestedTopic[];
}

export interface DebaterSelectionServiceInterface {
  validateSelection(debaters: AIDebater[]): ValidationResult;
  getOptimalDebaters(topic: string, availableAIs: AIDebater[]): AIDebater[];
  checkDebaterCompatibility(debaters: AIDebater[]): boolean;
  enforceSelectionLimits(debaters: AIDebater[], min: number, max: number): AIDebater[];
}

export interface PersonalityServiceInterface {
  getDefaultPersonality(): Personality;
  getAvailablePersonalities(isPremium?: boolean): Personality[];
  validatePersonalitySelection(selections: Map<string, Personality>): ValidationResult;
  applyPersonalityToDebater(debater: AIDebater, personality: Personality): AIDebater;
}
