// Core type definitions for Symposium AI

export type AIProvider = 'claude' | 'openai' | 'chatgpt' | 'google' | 'perplexity' | 'mistral' | 'cohere' | 'together' | 'deepseek' | 'grok';
export type UIMode = 'simple' | 'expert';
export type SubscriptionTier = 'free' | 'pro' | 'business';

export interface User {
  id: string;
  email?: string;
  subscription: SubscriptionTier;
  uiMode: UIMode;
  apiKeys?: {
    claude?: string;
    openai?: string;
    google?: string;
    perplexity?: string;
    mistral?: string;
    cohere?: string;
    together?: string;
    deepseek?: string;
    grok?: string;
  };
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
}

export interface MessageMetadata {
  sessionId?: string;
  conversationTurn?: number;
  responseTime?: number;
  wordCount?: number;
  modelUsed?: string; // Track which AI model actually responded
  
  // Rich content support
  citations?: Citation[];  // For Perplexity and other providers with sources
  providerMetadata?: Record<string, unknown>; // Flexible field for provider-specific data
}

export interface MessageAttachment {
  type: 'image' | 'document';
  uri: string;
  mimeType: string;
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
  MainTabs: undefined;
  Home: undefined;
  Chat: { 
    sessionId: string; 
    initialPrompt?: string;
    selectedAIs?: AIConfig[];
    initialMessages?: Message[];
    aiPersonalities?: { [aiId: string]: string };
    selectedModels?: { [aiId: string]: string };
  };
  Settings: undefined;
  APIConfig: undefined;
  Subscription: undefined;
  ExpertMode: undefined;
  Debate: { selectedAIs: AI[]; topic?: string; personalities?: { [key: string]: string } };
  Compare?: undefined;
  CompareSession: { leftAI: AIConfig; rightAI: AIConfig };
  Stats: undefined;
};