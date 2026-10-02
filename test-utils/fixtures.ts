import type {
  AIConfig,
  ChatSession,
  DebateSpeechMetadata,
  Message,
  MessageAttachment,
  User,
} from '@/types';
import type { ScaledSize } from 'react-native';
import type { useFeatureAccess } from '@/hooks/useFeatureAccess';
import type { RootState } from '@/store';
import type { ScoreBoard } from '@/services/debate/VotingService';

/**
 * Typed fixture builders for the domain objects tests construct most often.
 * Each returns a complete, valid object; pass only the fields a test cares
 * about. Because defaults are typed against the real interfaces, a type
 * change breaks the builder (one place) rather than every hand-written
 * fixture — the drift behind most of the test typecheck budget.
 */

export const createMockAIConfig = (overrides: Partial<AIConfig> = {}): AIConfig => ({
  id: 'claude',
  provider: 'claude',
  name: 'Claude',
  model: 'claude-sonnet-5-5',
  ...overrides,
});

export const createMockMessage = (overrides: Partial<Message> = {}): Message => ({
  id: 'msg-1',
  sender: 'You',
  senderType: 'user',
  content: 'Hello',
  timestamp: 1_700_000_000_000,
  ...overrides,
});

/** An AI reply from `ai` (defaults to Claude), attributed via metadata like real replies. */
export const createMockAIMessage = (
  overrides: Partial<Message> = {},
  ai: AIConfig = createMockAIConfig()
): Message =>
  createMockMessage({
    id: 'msg-ai-1',
    sender: ai.name,
    senderType: 'ai',
    content: 'Hi there',
    metadata: { aiId: ai.id, providerId: ai.provider, modelUsed: ai.model },
    ...overrides,
  });

export const createMockAttachment = (
  overrides: Partial<MessageAttachment> = {}
): MessageAttachment => ({
  type: 'image',
  uri: 'file:///mock/image.png',
  mimeType: 'image/png',
  fileName: 'image.png',
  fileSize: 1024,
  ...overrides,
});

export const createMockChatSession = (overrides: Partial<ChatSession> = {}): ChatSession => ({
  id: 'session-1',
  selectedAIs: [createMockAIConfig()],
  messages: [],
  isActive: true,
  createdAt: 1_700_000_000_000,
  sessionType: 'chat',
  ...overrides,
});

export const createMockDebateSpeech = (
  overrides: Partial<DebateSpeechMetadata> = {}
): DebateSpeechMetadata => ({
  formatId: 'oxford',
  presetId: 'oxford-standard',
  messageIndex: 0,
  totalMessages: 6,
  phase: 'opening',
  speaker: 'aff',
  label: 'Opening — Proposition',
  ...overrides,
});

/** One scoreboard row per AI; override rows by id. */
export const createMockScoreBoard = (
  rows: Record<string, Partial<ScoreBoard[string]>> = {
    'ai-1': { name: 'Claude' },
    'ai-2': { name: 'ChatGPT' },
  }
): ScoreBoard =>
  Object.fromEntries(
    Object.entries(rows).map(([aiId, row]) => [
      aiId,
      { name: aiId, roundWins: 0, roundsWon: [], isOverallWinner: false, ...row },
    ])
  );

export const createMockUser = (overrides: Partial<User> = {}): User => ({
  id: 'user-1',
  email: 'user@example.com',
  subscription: 'free',
  uiMode: 'simple',
  preferences: { theme: 'auto', fontSize: 'medium' },
  ...overrides,
});

type AuthState = RootState['auth'];
type UserProfile = NonNullable<AuthState['userProfile']>;

export const createMockUserProfile = (overrides: Partial<UserProfile> = {}): UserProfile => ({
  email: 'user@example.com',
  displayName: 'Test User',
  photoURL: null,
  createdAt: 1_700_000_000_000,
  membershipStatus: 'free',
  ...overrides,
});

/** Signed-out auth state by default; pass `isAuthenticated`/`userProfile` etc. to sign in. */
export const createMockAuthState = (overrides: Partial<AuthState> = {}): AuthState => ({
  user: null,
  isAuthenticated: false,
  isPremium: false,
  authLoading: false,
  authModalVisible: false,
  userProfile: null,
  lastAuthMethod: null,
  socialAuthLoading: false,
  socialAuthError: null,
  ...overrides,
});

/** A complete `useWindowDimensions()` result, e.g. phone `(375, 812)` or tablet `(820, 1180)`. */
export const createMockWindowSize = (width: number, height: number): ScaledSize => ({
  width,
  height,
  scale: 2,
  fontScale: 1,
});

type FeatureAccess = ReturnType<typeof useFeatureAccess>;

/** `useFeatureAccess()` for a demo user by default; override fields for premium/trial cases. */
export const createMockFeatureAccess = (overrides: Partial<FeatureAccess> = {}): FeatureAccess => ({
  loading: false,
  membershipStatus: 'demo',
  trialDaysRemaining: null,
  hasUsedTrial: false,
  canStartTrial: false,
  canAccessLiveAI: false,
  isEmailVerified: true,
  requiresEmailVerification: false,
  isInTrial: false,
  isPremium: false,
  isDemo: true,
  refresh: async () => {},
  ...overrides,
});
