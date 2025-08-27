// History Screen type definitions
import { ChatSession, AIConfig, Message } from './index';

// Extended session types for different interaction modes
export interface ComparisonSessionData extends Partial<ChatSession> {
  sessionType: 'comparison';
  hasDiverged: boolean;
  divergedAt?: number;
  continuedWithAI?: string; // ID of AI that was selected if diverged
  leftAI: AIConfig;
  rightAI: AIConfig;
  leftThread: Message[]; // Messages from left AI
  rightThread: Message[]; // Messages from right AI
  sharedPrompts: string[]; // User prompts sent to both AIs
}

export interface DebateSessionData extends Partial<ChatSession> {
  sessionType: 'debate';
  topic: string;
  winner: string; // AI ID of winner
  scores: Record<string, { points: number; roundWins: number }>;
  transcript: Message[];
  duration?: number; // Duration in seconds
  roundCount: number;
}

// Search and Filter Types
export interface SearchOptions {
  query: string;
  searchInAINames: boolean;
  searchInMessages: boolean;
  caseSensitive: boolean;
  matchWholeWord: boolean;
}

export interface FilterOptions {
  dateRange?: {
    start: Date;
    end: Date;
  };
  aiProviders?: string[];
  messageCountRange?: {
    min: number;
    max: number;
  };
}

export interface SortOptions {
  field: 'createdAt' | 'lastMessageAt' | 'messageCount' | 'aiCount';
  direction: 'asc' | 'desc';
}

// Session Management Types
export interface SessionSearchMatch {
  sessionId: string;
  matchType: 'aiName' | 'messageContent';
  matchText: string;
  matchIndex: number;
}

export interface SessionStats {
  totalSessions: number;
  totalMessages: number;
  averageMessagesPerSession: number;
  mostActiveSession?: ChatSession;
  oldestSession?: ChatSession;
  newestSession?: ChatSession;
  usageByProvider: Record<string, number>;
}

export interface SessionValidationErrorInfo {
  sessionId: string;
  error: string;
  severity: 'warning' | 'error';
}

export interface SessionValidationResult {
  isValid: boolean;
  errors: SessionValidationErrorInfo[];
  recoveredSessions: ChatSession[];
  corruptedCount: number;
}

// Component Props Types
export interface SessionCardProps {
  session: ChatSession;
  onPress: (session: ChatSession) => void;
  searchTerm?: string;
  isHighlighted: boolean;
  index: number;
  testID?: string;
}

export interface SessionPreviewProps {
  text: string;
  searchTerm?: string;
  maxLines?: number;
  style?: object;
}

export interface SwipeableActionsProps {
  onDelete: () => void;
  onArchive?: () => void;
  onShare?: () => void;
}

export interface FilterChipProps {
  label: string;
  isActive: boolean;
  onPress: () => void;
  count?: number;
}

export interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: string;
  color?: string;
  onPress?: () => void;
}

// Organism Component Props
export interface HistoryHeaderProps {
  title: string;
  sessionCount: number;
  maxSessions: number;
  isPremium: boolean;
  onInfoPress?: () => void;
}

export interface HistorySearchBarProps {
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
  onClear?: () => void;
  autoFocus?: boolean;
}

export interface HistoryListProps {
  sessions: ChatSession[];
  onSessionPress: (session: ChatSession) => void;
  onSessionDelete: (sessionId: string) => void;
  searchTerm?: string;
  refreshing?: boolean;
  onRefresh?: () => void;
  ListEmptyComponent?: React.ReactElement;
  testID?: string;
  // Pagination props
  onLoadMore?: () => void;
  hasMorePages?: boolean;
  isLoadingMore?: boolean;
  totalSessions?: number; // Total count for pagination display
}

export interface HistoryStatsProps {
  sessionCount: number;
  messageCount: number;
  visible: boolean;
  onPress?: () => void;
}

export interface EmptyHistoryStateProps {
  type: 'no-sessions' | 'no-results' | 'loading-error';
  searchTerm?: string;
  onRetry?: () => void;
  onStartChat?: () => void;
  onClearSearch?: () => void;
  emptyStateConfig?: {
    icon?: string;
    iconLibrary?: 'ionicons' | 'material-community';
    title?: string;
    message?: string;
    actionText?: string;
  };
}

// Hook Return Types
export interface UseSessionHistoryReturn {
  sessions: ChatSession[];
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  clearHistory: () => Promise<void>;
  validationResult?: SessionValidationResult;
}

export interface UseSessionSearchReturn {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  filteredSessions: ChatSession[];
  searchMatches: SessionSearchMatch[];
  hasActiveFilters: boolean;
  clearSearch: () => void;
  searchStats?: {
    totalSessions: number;
    filteredCount: number;
    matchCount: number;
    hasResults: boolean;
    filteredPercentage: number;
  };
  advancedSearch?: (options: Record<string, unknown>) => ChatSession[];
  smartSearch?: (query: string) => ChatSession[];
  isSearching?: boolean;
}

export interface UseSessionActionsReturn {
  deleteSession: (sessionId: string) => Promise<void>;
  resumeSession: (session: ChatSession) => void;
  shareSession: (session: ChatSession) => Promise<void>;
  archiveSession: (sessionId: string) => Promise<void>;
  bulkDelete: (sessionIds: string[]) => Promise<void>;
  isProcessing: boolean;
}

export interface UseSessionStatsReturn {
  stats: SessionStats;
  isCalculating: boolean;
  refresh: () => void;
  formattedStats?: {
    sessionsText: string;
    messagesText: string;
    averageText: string;
    summaryText: string;
  };
  activityInsights?: Record<string, unknown>;
  usagePatterns?: Record<string, unknown>;
}

export interface UseSubscriptionLimitsReturn {
  maxSessions: number;
  isLimited: boolean;
  canCreateMore: boolean;
  sessionCount: number;
  limitWarning?: string;
  upgradePrompt?: string;
  usagePercentage?: number;
  statusInfo?: Record<string, unknown>;
  nextTierBenefits?: Record<string, unknown> | null;
  shouldShowUpgradeNudge?: boolean;
  subscriptionName?: string;
  subscriptionFeatures?: string[];
}

// Service Types
export interface SessionStorageOptions {
  validateData: boolean;
  performMigration: boolean;
  backupBeforeSave: boolean;
}

export interface SessionSortStrategy {
  name: string;
  field: keyof ChatSession | 'messageCount' | 'aiCount';
  direction: 'asc' | 'desc';
  compareFn?: (a: ChatSession, b: ChatSession) => number;
}

export interface SessionFilterStrategy {
  name: string;
  predicate: (session: ChatSession, options?: unknown) => boolean;
}

export interface DateFormatOptions {
  style: 'relative' | 'absolute' | 'smart';
  includeTime: boolean;
  includeYear: boolean;
  locale?: string;
}

// Error Types
export class SessionStorageError extends Error {
  constructor(
    message: string,
    public code: 'STORAGE_UNAVAILABLE' | 'PARSE_ERROR' | 'SAVE_ERROR' | 'DELETE_ERROR',
    public sessionId?: string
  ) {
    super(message);
    this.name = 'SessionStorageError';
  }
}

export class SessionValidationError extends Error {
  constructor(
    message: string,
    public sessionId: string,
    public field?: string
  ) {
    super(message);
    this.name = 'SessionValidationError';
  }
}

// Migration Types
export interface MigrationResult {
  success: boolean;
  migratedCount: number;
  errorCount: number;
  backupCreated: boolean;
  errors: string[];
}

export interface DataMigration {
  version: string;
  description: string;
  migrate: (sessions: unknown[]) => ChatSession[];
  rollback?: (sessions: ChatSession[]) => unknown[];
}

// Navigation Types (extending from main types)
export interface HistoryScreenNavigationProps {
  navigate: (screen: string, params?: Record<string, unknown>) => void;
  goBack: () => void;
  setParams: (params: Record<string, unknown>) => void;
}

export interface HistoryScreenRouteParams {
  sessionId?: string;
  resuming?: boolean;
  searchTerm?: string;
  highlightSessionId?: string;
}

// Analytics Types
export interface SessionAnalytics {
  averageSessionDuration: number;
  messagesPerDay: number;
  mostUsedAIs: Array<{ name: string; count: number; percentage: number }>;
  peakUsageHours: number[];
  sessionTrends: Array<{ date: string; count: number }>;
}