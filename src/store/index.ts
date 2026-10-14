// Redux store configuration
import { configureStore, createSlice, PayloadAction, combineReducers } from '@reduxjs/toolkit';
import { User, ChatSession, Message, UIMode, SubscriptionTier, AIConfig, MessageAttachment, MessageMetadata, type DebateSpeechLength } from '../types';
import debateStatsReducer from './debateStatsSlice';
import streamingReducer from './streamingSlice';
import authReducer from './authSlice';
import navigationReducer from './navigationSlice';
import compareReducer from './compareSlice';
import errorReducer from './errorSlice';
import createReducer from './createSlice';
import pricesReducer from './pricesSlice';
import aiSelectionReducer from './aiSelectionSlice';
import createSelectionReducer from './createSelectionSlice';
import composerAttachmentsReducer from './composerAttachmentsSlice';
import { isValidProviderId } from '../utils/typeGuards';

// User slice
interface UserState {
  currentUser: User | null;
  isAuthenticated: boolean;
  uiMode: UIMode;
}

const initialUserState: UserState = {
  currentUser: null,
  isAuthenticated: false,
  uiMode: 'simple',
};

const userSlice = createSlice({
  name: 'user',
  initialState: initialUserState,
  reducers: {
    setUser: (state, action: PayloadAction<User>) => {
      state.currentUser = action.payload;
      state.isAuthenticated = true;
      state.uiMode = action.payload.uiMode;
    },
    updateUIMode: (state, action: PayloadAction<UIMode>) => {
      state.uiMode = action.payload;
      if (state.currentUser) {
        state.currentUser.uiMode = action.payload;
      }
    },
    updateSubscription: (state, action: PayloadAction<SubscriptionTier>) => {
      if (state.currentUser) {
        state.currentUser.subscription = action.payload;
      }
    },
    logout: (state) => {
      state.currentUser = null;
      state.isAuthenticated = false;
      state.uiMode = 'simple';
    },
  },
});

// Chat slice
interface ChatState {
  currentSession: ChatSession | null;
  sessions: ChatSession[];
  typingAIs: string[];
  isLoading: boolean;
  aiPersonalities: { [aiId: string]: string };
  selectedModels: { [aiId: string]: string };
}

const initialChatState: ChatState = {
  currentSession: null,
  sessions: [],
  typingAIs: [],
  isLoading: false,
  aiPersonalities: {},
  selectedModels: {},
};

const filterSupportedSelectedAIs = (selectedAIs: AIConfig[] = []): AIConfig[] =>
  selectedAIs.filter(ai => ai?.provider && isValidProviderId(ai.provider));

const sanitizeSession = (session: ChatSession): ChatSession => ({
  ...session,
  selectedAIs: filterSupportedSelectedAIs(session.selectedAIs),
});

const chatSlice = createSlice({
  name: 'chat',
  initialState: initialChatState,
  reducers: {
    startSession: (state, action: PayloadAction<{ 
      selectedAIs: AIConfig[]; 
      aiPersonalities?: { [aiId: string]: string };
      selectedModels?: { [aiId: string]: string };
      sessionType?: 'chat' | 'comparison' | 'debate';
    }>) => {
      const newSession: ChatSession = {
        id: `session_${Date.now()}`,
        selectedAIs: filterSupportedSelectedAIs(action.payload.selectedAIs),
        messages: [],
        isActive: true,
        createdAt: Date.now(),
        sessionType: action.payload.sessionType || 'chat', // Default to chat if not specified
      };
      // console.log('Redux - Starting new session:', newSession.id);
      state.currentSession = newSession;
      state.sessions.push(newSession);
      state.aiPersonalities = action.payload.aiPersonalities || {};
      state.selectedModels = action.payload.selectedModels || {};
    },
    addMessage: (state, action: PayloadAction<Message>) => {
      if (state.currentSession) {
        state.currentSession.messages.push(action.payload);
        state.currentSession.lastMessageAt = action.payload.timestamp || Date.now();
      }
    },
    updateMessage: (state, action: PayloadAction<{ id: string; content?: string; attachments?: MessageAttachment[]; metadata?: Partial<MessageMetadata> }>) => {
      if (state.currentSession) {
        const messageIndex = state.currentSession.messages.findIndex(m => m.id === action.payload.id);
        if (messageIndex !== -1) {
          if (action.payload.content !== undefined) {
            state.currentSession.messages[messageIndex].content = action.payload.content;
          }
          if (action.payload.attachments !== undefined) {
            state.currentSession.messages[messageIndex].attachments = action.payload.attachments;
          }
          if (action.payload.metadata !== undefined) {
            const currentMeta = state.currentSession.messages[messageIndex].metadata || {} as MessageMetadata;
            state.currentSession.messages[messageIndex].metadata = { ...currentMeta, ...action.payload.metadata } as MessageMetadata;
          }
          state.currentSession.lastMessageAt = Date.now();
        }
      }
    },
    setTypingAI: (state, action: PayloadAction<{ ai: string; isTyping: boolean }>) => {
      if (action.payload.isTyping) {
        if (!state.typingAIs.includes(action.payload.ai)) {
          state.typingAIs.push(action.payload.ai);
        }
      } else {
        state.typingAIs = state.typingAIs.filter(ai => ai !== action.payload.ai);
      }
    },
    endSession: (state) => {
      if (state.currentSession) {
        state.currentSession.isActive = false;
        state.currentSession = null;
        state.typingAIs = [];
      }
    },
    loadSession: (state, action: PayloadAction<ChatSession>) => {
      state.currentSession = sanitizeSession(action.payload);
      state.currentSession.isActive = true;
      const existingIndex = state.sessions.findIndex(s => s.id === action.payload.id);
      if (existingIndex >= 0) {
        state.sessions[existingIndex] = state.currentSession;
      } else {
        state.sessions.push(state.currentSession);
      }
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    setAIPersonality: (state, action: PayloadAction<{ aiId: string; personalityId: string }>) => {
      state.aiPersonalities[action.payload.aiId] = action.payload.personalityId;
    },
    setAIModel: (state, action: PayloadAction<{ aiId: string; modelId: string }>) => {
      state.selectedModels[action.payload.aiId] = action.payload.modelId;
    },
    clearPersonalities: (state) => {
      state.aiPersonalities = {};
    },
    clearModels: (state) => {
      state.selectedModels = {};
    },
  },
});

// Settings slice
interface ExpertModeConfig {
  enabled: boolean;
  selectedModel?: string;
  parameters?: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    topK?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
  };
}

export interface ApiKeyStatus {
  configured: boolean;
  maskedLabel: string;
  updatedAt: number;
}

type ApiKeyStatusInput = ApiKeyStatus | string | null | undefined;

const maskApiKeyForStatus = (key: string): string => {
  const trimmed = key.trim();
  if (!trimmed) return '';
  if (trimmed.length <= 8) return '••••••••';
  return `${trimmed.slice(0, 4)}${'•'.repeat(Math.min(trimmed.length - 8, 12))}${trimmed.slice(-4)}`;
};

export const buildApiKeyStatus = (key: string): ApiKeyStatus => ({
  configured: key.trim().length > 0,
  maskedLabel: maskApiKeyForStatus(key),
  updatedAt: Date.now(),
});

export const isApiKeyConfigured = (status: unknown): boolean => {
  if (typeof status === 'string') {
    return status.trim().length > 0;
  }
  if (status && typeof status === 'object' && 'configured' in status) {
    return (status as ApiKeyStatus).configured === true;
  }
  return false;
};

export const getApiKeyMaskedLabel = (status: unknown): string => {
  if (typeof status === 'string') {
    return maskApiKeyForStatus(status);
  }
  if (status && typeof status === 'object' && 'maskedLabel' in status) {
    return (status as ApiKeyStatus).maskedLabel || '';
  }
  return '';
};

const normalizeApiKeyStatus = (status: ApiKeyStatusInput): ApiKeyStatus | undefined => {
  if (!status) return undefined;
  if (typeof status === 'string') {
    return status.trim() ? buildApiKeyStatus(status) : undefined;
  }
  return status.configured ? status : undefined;
};

interface SettingsState {
  theme: 'light' | 'dark' | 'auto';
  fontSize: 'small' | 'medium' | 'large';
  apiKeys: Record<string, ApiKeyStatus | undefined>;
  verifiedProviders: string[]; // List of provider IDs that have been verified
  verificationTimestamps: {
    [key: string]: number; // Unix timestamp of when each provider was verified
  };
  verificationModels: {
    [key: string]: string; // Model name/ID that was verified for each provider
  };
  expertMode: {
    [providerId: string]: ExpertModeConfig | undefined;
  };
  hasCompletedOnboarding: boolean;
  // Dev-only: enable recording controls in headers
  recordModeEnabled?: boolean;
  /** Debate setup's last Speech length choice; persisted by DebateSetupPreferencesService. */
  debateSpeechLength?: DebateSpeechLength;
}

const initialSettingsState: SettingsState = {
  theme: 'auto',
  fontSize: 'medium',
  apiKeys: {},
  verifiedProviders: [],
  verificationTimestamps: {},
  verificationModels: {},
  expertMode: {},
  hasCompletedOnboarding: false,
  recordModeEnabled: false,
  debateSpeechLength: 'default',
};

const settingsSlice = createSlice({
  name: 'settings',
  initialState: initialSettingsState,
  reducers: {
    updateTheme: (state, action: PayloadAction<'light' | 'dark' | 'auto'>) => {
      state.theme = action.payload;
    },
    updateFontSize: (state, action: PayloadAction<'small' | 'medium' | 'large'>) => {
      state.fontSize = action.payload;
    },
    setAPIKey: (state, action: PayloadAction<{ provider: 'claude' | 'openai' | 'google'; key: string }>) => {
      const status = normalizeApiKeyStatus(action.payload.key);
      if (status) {
        state.apiKeys[action.payload.provider] = status;
      } else {
        delete state.apiKeys[action.payload.provider];
      }
    },
    updateApiKeys: (state, action: PayloadAction<Record<string, ApiKeyStatusInput>>) => {
      // If payload is empty object, clear all keys
      if (Object.keys(action.payload).length === 0) {
        state.apiKeys = {};
      } else {
        Object.entries(action.payload).forEach(([provider, value]) => {
          const status = normalizeApiKeyStatus(value);
          if (status) {
            state.apiKeys[provider] = status;
          } else {
            delete state.apiKeys[provider];
          }
        });
      }
      // Remove providers from verified list if their keys are removed
      const verifiedToRemove: string[] = [];
      Object.entries(action.payload).forEach(([provider, status]) => {
        if (!isApiKeyConfigured(status) && state.verifiedProviders.includes(provider)) {
          verifiedToRemove.push(provider);
        }
      });
      state.verifiedProviders = state.verifiedProviders.filter(p => !verifiedToRemove.includes(p));
    },
    setVerifiedProviders: (state, action: PayloadAction<string[]>) => {
      state.verifiedProviders = action.payload;
      // Clear all timestamps and models, only keep ones for verified providers
      state.verificationTimestamps = {};
      state.verificationModels = {};
      action.payload.forEach(provider => {
        state.verificationTimestamps[provider] = Date.now();
      });
    },
    addVerifiedProvider: (state, action: PayloadAction<{ providerId: string; model?: string }>) => {
      const providerId = typeof action.payload === 'string' ? action.payload : action.payload.providerId;
      const model = typeof action.payload === 'object' ? action.payload.model : undefined;
      
      if (!state.verifiedProviders.includes(providerId)) {
        state.verifiedProviders.push(providerId);
      }
      // Store verification timestamp and model
      state.verificationTimestamps[providerId] = Date.now();
      if (model) {
        state.verificationModels[providerId] = model;
      }
    },
    removeVerifiedProvider: (state, action: PayloadAction<string>) => {
      state.verifiedProviders = state.verifiedProviders.filter(p => p !== action.payload);
      // Remove verification timestamp and model
      delete state.verificationTimestamps[action.payload];
      delete state.verificationModels[action.payload];
    },
    restoreVerificationData: (state, action: PayloadAction<{
      verifiedProviders: string[];
      verificationTimestamps: Record<string, number>;
      verificationModels: Record<string, string>;
    }>) => {
      state.verifiedProviders = action.payload.verifiedProviders;
      state.verificationTimestamps = action.payload.verificationTimestamps;
      state.verificationModels = action.payload.verificationModels;
    },
    completeOnboarding: (state) => {
      state.hasCompletedOnboarding = true;
    },
    restoreOnboarding: (state, action: PayloadAction<boolean>) => {
      state.hasCompletedOnboarding = action.payload;
    },
    updateExpertMode: (state, action: PayloadAction<{ provider: string; config: ExpertModeConfig }>) => {
      state.expertMode[action.payload.provider] = action.payload.config;
    },
    setRecordModeEnabled: (state, action: PayloadAction<boolean>) => {
      state.recordModeEnabled = !!action.payload;
    },
    setDebateSpeechLength: (state, action: PayloadAction<DebateSpeechLength>) => {
      state.debateSpeechLength = action.payload;
    },
  },
});

const rootReducer = combineReducers({
  user: userSlice.reducer,
  chat: chatSlice.reducer,
  settings: settingsSlice.reducer,
  debateStats: debateStatsReducer,
  streaming: streamingReducer,
  auth: authReducer,
  navigation: navigationReducer,
  compare: compareReducer,
  errors: errorReducer,
  create: createReducer,
  prices: pricesReducer,
  aiSelection: aiSelectionReducer,
  createSelection: createSelectionReducer,
  composerAttachments: composerAttachmentsReducer,
});

export type RootState = ReturnType<typeof rootReducer>;

const DEV_STATE_INVARIANT_WARN_AFTER_MS = 256;

export const createAppStore = (preloadedState?: Partial<RootState>) =>
  configureStore({
    reducer: rootReducer,
    preloadedState: preloadedState as RootState | undefined,
    middleware: getDefaultMiddleware =>
      getDefaultMiddleware({
        immutableCheck: {
          warnAfter: DEV_STATE_INVARIANT_WARN_AFTER_MS,
        },
        serializableCheck: {
          warnAfter: DEV_STATE_INVARIANT_WARN_AFTER_MS,
        },
      }),
  });

export const store = createAppStore();

export type AppStore = typeof store;
export type AppDispatch = AppStore['dispatch'];

// Export actions
export const { setUser, updateUIMode, updateSubscription, logout } = userSlice.actions;
export const { startSession, addMessage, updateMessage, setTypingAI, endSession, loadSession, setLoading, setAIPersonality, setAIModel, clearPersonalities, clearModels } = chatSlice.actions;
export const {
  updateTheme,
  updateFontSize,
  setAPIKey,
  updateApiKeys,
  setVerifiedProviders,
  addVerifiedProvider,
  removeVerifiedProvider,
  restoreVerificationData,
  completeOnboarding,
  restoreOnboarding,
  updateExpertMode,
  setRecordModeEnabled,
  setDebateSpeechLength,
} = settingsSlice.actions;

// Export auth actions
export { 
  setAuthUser,
  setUserProfile,
  setPremiumStatus,
  setAuthLoading,
  setAuthModalVisible,
  logout as authLogout 
} from './authSlice';

export { startDebate, recordRoundWinner, recordOverallWinner, clearStats, preserveTopic, clearPreservedTopic, restoreStats } from './debateStatsSlice';
export { 
  startStreaming, 
  updateStreamingContent, 
  endStreaming, 
  streamingError,
  clearStreamingMessage,
  clearCompletedStreams,
  setProviderStreamingPreference,
  setGlobalStreaming,
  cancelAllStreams,
  selectStreamingMessage,
  selectIsStreaming,
  selectStreamingContent,
  selectProviderStreamingEnabled,
  selectActiveStreamCount,
} from './streamingSlice';

export {
  showSheet,
  hideSheet,
  clearSheet,
  showHelpWebView,
  hideHelpWebView,
  registerHelpModalHost,
  unregisterHelpModalHost,
  setHeaderTitle,
  setHeaderSubtitle,
  setShowHeaderActions,
  setShowProfileIcon,
  setNavigationLoading,
  setLastNavigatedTab,
  resetNavigationState,
} from './navigationSlice';

export {
  setLeftAI,
  setRightAI,
  swapAIs,
  addCompareMessage,
  clearMessages,
  startCompareStreaming,
  updateCompareStreamingContent,
  endCompareStreaming,
  compareStreamingError,
  startCompareSession,
  clearCompareSession,
  setCompareOrientation,
  toggleSyncScroll,
  selectCompareState,
  selectSelectedAIs,
  selectIsComparing,
  selectCompareStreamingStates,
} from './compareSlice';

// Error handling exports
export {
  addError,
  dismissError,
  clearActiveToast,
  showNextError,
  clearErrors,
  clearFeatureError,
  clearAllFeatureErrors,
  setToastDuration,
  selectActiveToast,
  selectErrorQueue,
  selectFeatureError,
  selectHasErrors,
  selectToastDuration,
  selectUndismissedErrorCount,
} from './errorSlice';
export type { ErrorEntry, ErrorState } from './errorSlice';

// Create mode exports
export {
  setActiveCreateTab,
  markCreateActivitySeen,
  startImageGeneration,
  updateImageGeneration,
  completeImageGeneration,
  failImageGeneration,
  startGeneration,
  updateGenerationProgress,
  completeGeneration,
  generationError,
  clearGenerationError,
  addToGallery,
  addToGalleryWithCleanup,
  removeFromGallery,
  removeFromGalleryWithCleanup,
  clearGallery,
  clearGalleryWithCleanup,
  resetCreateState,
  hydrateGallery,
  persistGallery,
  hydrateMediaGallery,
  persistMediaGallery,
  addToMediaGallery,
  addToMediaGalleryWithCleanup,
  removeFromMediaGallery,
  removeFromMediaGalleryWithCleanup,
  clearMediaGallery,
  clearMediaGalleryWithCleanup,
  generateCreateVideo,
  generateCreateAudio,
  generateCreateImages,
  resumeCreateMediaTasks,
  selectCreateState,
  selectGallery,
  selectMediaGallery,
  selectIsGenerating,
  selectGenerationProgress,
  selectCreateActivity,
  selectImageGeneration,
  selectMediaGeneration,
} from './createSlice';
export type {
  StylePreset,
  SizeOption,
  QualityOption,
  GenerationProgress,
  GeneratedImageEntry,
  GeneratedMediaEntry,
  ImageGenerationState,
  ImageGenerationResultStatus,
  ImageProviderGenerationStatus,
  ImageModelSettings,
  CreateImageSourceInput,
  GenerateCreateImagesPayload,
  MediaGenerationState,
  ActiveRunwayTask,
  CreateActivityState,
  CreateState,
} from './createSlice';

// Prices exports
export { setPrices } from './pricesSlice';

// Composer AI selection exports
export {
  hydrateAISelection,
  setModeSelection,
  addModeSelection,
  updateModeSelection,
  removeModeSelection,
} from './aiSelectionSlice';
export type { AISelectionState } from './aiSelectionSlice';

// Create (Studio) composer selection exports
export {
  hydrateCreateSelection,
  setImageSelection,
  addImageSelection,
  updateImageSelection,
  removeImageSelection,
  setImageOptions,
  setVideoOptions,
  setAudioOptions,
  setAttachments,
  addAttachment,
  removeAttachment,
  clearAttachments,
  MAX_IMAGE_PROVIDERS,
} from './createSelectionSlice';
export type { CreateSelectionState, PersistedCreateSelection } from './createSelectionSlice';

// Entry-composer staged attachments (chat/compare first-message payloads)
export {
  stageComposerAttachments,
  clearComposerAttachments,
} from './composerAttachmentsSlice';
export type { ComposerAttachmentsState } from './composerAttachmentsSlice';
