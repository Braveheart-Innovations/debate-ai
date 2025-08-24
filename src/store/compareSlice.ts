import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { AIConfig } from '../types';

// Compare message type
export interface CompareMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  side?: 'left' | 'right';
}

// Compare state
export interface CompareState {
  // AI selection
  leftAI: AIConfig | null;
  rightAI: AIConfig | null;
  
  // Messages
  messages: CompareMessage[];
  
  // Current streaming content
  leftContent: string;
  rightContent: string;
  
  // Streaming states
  leftStreaming: boolean;
  rightStreaming: boolean;
  
  // Session management
  currentSession: {
    id: string;
    startedAt: number;
  } | null;
  
  // UI state
  orientation: 'portrait' | 'landscape';
  syncScroll: boolean;
}

const initialState: CompareState = {
  leftAI: null,
  rightAI: null,
  messages: [],
  leftContent: '',
  rightContent: '',
  leftStreaming: false,
  rightStreaming: false,
  currentSession: null,
  orientation: 'portrait',
  syncScroll: false,
};

const compareSlice = createSlice({
  name: 'compare',
  initialState,
  reducers: {
    // AI selection
    setLeftAI: (state, action: PayloadAction<AIConfig | null>) => {
      state.leftAI = action.payload;
      // Clear content when AI changes
      state.leftContent = '';
    },
    
    setRightAI: (state, action: PayloadAction<AIConfig | null>) => {
      state.rightAI = action.payload;
      // Clear content when AI changes  
      state.rightContent = '';
    },
    
    swapAIs: (state) => {
      const temp = state.leftAI;
      state.leftAI = state.rightAI;
      state.rightAI = temp;
      
      const tempContent = state.leftContent;
      state.leftContent = state.rightContent;
      state.rightContent = tempContent;
    },
    
    // Message management
    addCompareMessage: (state, action: PayloadAction<CompareMessage>) => {
      state.messages.push(action.payload);
    },
    
    clearMessages: (state) => {
      state.messages = [];
      state.leftContent = '';
      state.rightContent = '';
    },
    
    // Streaming actions
    startCompareStreaming: (state, action: PayloadAction<{ 
      promptId: string; 
      side: 'left' | 'right' | 'both';
      aiConfig?: AIConfig;
    }>) => {
      const { side } = action.payload;
      
      if (side === 'left' || side === 'both') {
        state.leftStreaming = true;
        state.leftContent = '';
      }
      
      if (side === 'right' || side === 'both') {
        state.rightStreaming = true;
        state.rightContent = '';
      }
    },
    
    updateCompareStreamingContent: (state, action: PayloadAction<{
      promptId: string;
      side: 'left' | 'right';
      chunk: string;
    }>) => {
      const { side, chunk } = action.payload;
      
      if (side === 'left') {
        state.leftContent += chunk;
      } else {
        state.rightContent += chunk;
      }
    },
    
    endCompareStreaming: (state, action: PayloadAction<{
      promptId: string;
      side: 'left' | 'right';
      finalContent: string;
      metadata?: {
        model: string;
        responseTime?: number;
      };
    }>) => {
      const { side, finalContent } = action.payload;
      
      if (side === 'left') {
        state.leftStreaming = false;
        state.leftContent = finalContent;
      } else {
        state.rightStreaming = false;
        state.rightContent = finalContent;
      }
    },
    
    compareStreamingError: (state, action: PayloadAction<{
      promptId: string;
      side: 'left' | 'right';
      error: string;
    }>) => {
      const { side, error } = action.payload;
      
      if (side === 'left') {
        state.leftStreaming = false;
        state.leftContent = `Error: ${error}`;
      } else {
        state.rightStreaming = false;
        state.rightContent = `Error: ${error}`;
      }
    },
    
    // Session management
    startCompareSession: (state) => {
      state.currentSession = {
        id: `session_${Date.now()}`,
        startedAt: Date.now(),
      };
    },
    
    clearCompareSession: (state) => {
      state.leftAI = null;
      state.rightAI = null;
      state.messages = [];
      state.leftContent = '';
      state.rightContent = '';
      state.leftStreaming = false;
      state.rightStreaming = false;
      state.currentSession = null;
    },
    
    // UI state
    setCompareOrientation: (state, action: PayloadAction<'portrait' | 'landscape'>) => {
      state.orientation = action.payload;
    },
    
    toggleSyncScroll: (state) => {
      state.syncScroll = !state.syncScroll;
    },
  },
});

// Export actions
export const {
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
} = compareSlice.actions;

// Selectors
export const selectCompareState = (state: { compare: CompareState }) => state.compare;
export const selectSelectedAIs = (state: { compare: CompareState }) => ({
  left: state.compare.leftAI,
  right: state.compare.rightAI,
});
export const selectIsComparing = (state: { compare: CompareState }) => 
  state.compare.leftStreaming || state.compare.rightStreaming;
export const selectCompareStreamingStates = (state: { compare: CompareState }) => ({
  leftStreaming: state.compare.leftStreaming,
  rightStreaming: state.compare.rightStreaming,
});

export default compareSlice.reducer;