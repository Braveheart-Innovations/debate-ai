// Redux store configuration
import { configureStore, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { User, ChatSession, Message, UIMode, SubscriptionTier, AIConfig } from '../types';
import debateStatsReducer from './debateStatsSlice';
import streamingReducer from './streamingSlice';
import authReducer from './authSlice';
import navigationReducer from './navigationSlice';

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

const chatSlice = createSlice({
  name: 'chat',
  initialState: initialChatState,
  reducers: {
    startSession: (state, action: PayloadAction<{ 
      selectedAIs: AIConfig[]; 
      aiPersonalities?: { [aiId: string]: string };
      selectedModels?: { [aiId: string]: string };
    }>) => {
      const newSession: ChatSession = {
        id: `session_${Date.now()}`,
        selectedAIs: action.payload.selectedAIs,
        messages: [],
        isActive: true,
        createdAt: Date.now(),
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
      }
    },
    updateMessage: (state, action: PayloadAction<{ id: string; content: string }>) => {
      if (state.currentSession) {
        const messageIndex = state.currentSession.messages.findIndex(m => m.id === action.payload.id);
        if (messageIndex !== -1) {
          state.currentSession.messages[messageIndex].content = action.payload.content;
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
      state.currentSession = action.payload;
      state.currentSession.isActive = true;
      const existingIndex = state.sessions.findIndex(s => s.id === action.payload.id);
      if (existingIndex >= 0) {
        state.sessions[existingIndex] = action.payload;
      } else {
        state.sessions.push(action.payload);
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

interface SettingsState {
  theme: 'light' | 'dark' | 'auto';
  fontSize: 'small' | 'medium' | 'large';
  apiKeys: {
    claude?: string;
    openai?: string;
    google?: string;
    nomi?: string;
    mistral?: string;
    perplexity?: string;
    [key: string]: string | undefined; // Allow any provider
  };
  verifiedProviders: string[]; // List of provider IDs that have been verified
  verificationTimestamps: {
    [key: string]: number; // Unix timestamp of when each provider was verified
  };
  verificationModels: {
    [key: string]: string; // Model name/ID that was verified for each provider
  };
  expertMode: {
    claude?: ExpertModeConfig;
    openai?: ExpertModeConfig;
    google?: ExpertModeConfig;
  };
  hasCompletedOnboarding: boolean;
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
      state.apiKeys[action.payload.provider] = action.payload.key;
    },
    updateApiKeys: (state, action: PayloadAction<Record<string, string | undefined>>) => {
      // If payload is empty object, clear all keys
      if (Object.keys(action.payload).length === 0) {
        state.apiKeys = {};
      } else {
        state.apiKeys = { ...state.apiKeys, ...action.payload };
      }
      // Remove providers from verified list if their keys are removed
      const verifiedToRemove: string[] = [];
      Object.entries(action.payload).forEach(([provider, key]) => {
        if (!key && state.verifiedProviders.includes(provider)) {
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
    updateExpertMode: (state, action: PayloadAction<{ 
      provider: 'claude' | 'openai' | 'google'; 
      config: ExpertModeConfig 
    }>) => {
      state.expertMode[action.payload.provider] = action.payload.config;
    },
  },
});

// Configure store
export const store = configureStore({
  reducer: {
    user: userSlice.reducer,
    chat: chatSlice.reducer,
    settings: settingsSlice.reducer,
    debateStats: debateStatsReducer,
    streaming: streamingReducer,
    auth: authReducer,
    navigation: navigationReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

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
  updateExpertMode 
} = settingsSlice.actions;

// Export auth actions
export { 
  setUser as setAuthUser,
  setUserProfile,
  setPremiumStatus,
  setAuthLoading,
  setAuthModalVisible,
  setProfileSheetVisible,
  logout as authLogout 
} from './authSlice';

export { startDebate, recordRoundWinner, recordOverallWinner, clearStats, preserveTopic, clearPreservedTopic } from './debateStatsSlice';
export { 
  startStreaming, 
  updateStreamingContent, 
  endStreaming, 
  streamingError,
  clearStreamingMessage,
  clearCompletedStreams,
  setProviderStreamingPreference,
  setGlobalStreaming,
  setStreamingSpeed,
  cancelAllStreams,
  selectStreamingMessage,
  selectIsStreaming,
  selectStreamingContent,
  selectProviderStreamingEnabled,
  selectStreamingSpeed,
  selectActiveStreamCount,
} from './streamingSlice';

export {
  showSheet,
  hideSheet,
  clearSheet,
  setHeaderTitle,
  setHeaderSubtitle,
  setShowHeaderActions,
  setShowProfileIcon,
  setNavigationLoading,
  setLastNavigatedTab,
  resetNavigationState,
} from './navigationSlice';