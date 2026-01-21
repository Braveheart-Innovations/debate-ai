import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { RootState } from './index';
import { ErrorCode, ErrorSeverity } from '../errors/codes/ErrorCodes';

/**
 * Represents an error entry in the error queue.
 */
export interface ErrorEntry {
  /** Unique identifier for this error instance */
  id: string;
  /** Error code for categorization and lookup */
  code: ErrorCode;
  /** User-friendly error message */
  message: string;
  /** Severity level affecting display style */
  severity: ErrorSeverity;
  /** When the error occurred */
  timestamp: number;
  /** Whether the error is recoverable */
  recoverable: boolean;
  /** Whether retry is available */
  retryable: boolean;
  /** Feature/area where error occurred */
  feature?: string;
  /** Whether user has dismissed this error */
  dismissed: boolean;
}

/**
 * Redux state for error management.
 */
export interface ErrorState {
  /** Queue of errors for display */
  errorQueue: ErrorEntry[];
  /** Currently displayed toast error */
  activeToast: ErrorEntry | null;
  /** Per-feature error tracking */
  featureErrors: Record<string, ErrorEntry | null>;
  /** Last error timestamp for deduplication */
  lastErrorTimestamp: number;
  /** Auto-dismiss duration in ms (default 4000) */
  toastDuration: number;
  /** Maximum queue size */
  maxQueueSize: number;
}

const initialState: ErrorState = {
  errorQueue: [],
  activeToast: null,
  featureErrors: {},
  lastErrorTimestamp: 0,
  toastDuration: 6000, // Increased from 4000 to give users more time to read error messages
  maxQueueSize: 5,
};

/**
 * Generate a unique error ID.
 */
function generateErrorId(): string {
  return `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

const errorSlice = createSlice({
  name: 'errors',
  initialState,
  reducers: {
    /**
     * Add an error to the queue and show as toast if none active.
     * Deduplicates errors with same code within 2 seconds.
     */
    addError: (state, action: PayloadAction<Omit<ErrorEntry, 'id'>>) => {
      const error: ErrorEntry = {
        ...action.payload,
        id: generateErrorId(),
      };

      // Deduplication: skip if same code within 2 seconds
      const isDuplicate = state.errorQueue.some(
        e => e.code === error.code &&
          !e.dismissed &&
          Date.now() - e.timestamp < 2000
      );

      if (isDuplicate) {
        return;
      }

      // Add to queue
      state.errorQueue.push(error);

      // Trim queue if too large (keep most recent)
      if (state.errorQueue.length > state.maxQueueSize) {
        state.errorQueue = state.errorQueue.slice(-state.maxQueueSize);
      }

      // Set as active toast if no current toast
      if (!state.activeToast) {
        state.activeToast = error;
      }

      // Track per-feature
      if (error.feature) {
        state.featureErrors[error.feature] = error;
      }

      state.lastErrorTimestamp = error.timestamp;
    },

    /**
     * Dismiss a specific error by ID.
     * Shows next undismissed error if the active one was dismissed.
     */
    dismissError: (state, action: PayloadAction<string>) => {
      const errorId = action.payload;

      // Mark as dismissed in queue
      const error = state.errorQueue.find(e => e.id === errorId);
      if (error) {
        error.dismissed = true;
      }

      // Clear active toast if it's the one being dismissed
      if (state.activeToast?.id === errorId) {
        state.activeToast = null;

        // Show next undismissed error from queue
        const nextError = state.errorQueue.find(e => !e.dismissed);
        if (nextError) {
          state.activeToast = nextError;
        }
      }
    },

    /**
     * Clear the active toast and show next error if available.
     */
    clearActiveToast: (state) => {
      if (state.activeToast) {
        const error = state.errorQueue.find(e => e.id === state.activeToast?.id);
        if (error) {
          error.dismissed = true;
        }
      }

      state.activeToast = null;

      // Show next undismissed error
      const nextError = state.errorQueue.find(e => !e.dismissed);
      if (nextError) {
        state.activeToast = nextError;
      }
    },

    /**
     * Explicitly show the next undismissed error.
     */
    showNextError: (state) => {
      const nextError = state.errorQueue.find(e => !e.dismissed);
      state.activeToast = nextError || null;
    },

    /**
     * Clear all errors from queue and active toast.
     */
    clearErrors: (state) => {
      state.errorQueue = [];
      state.activeToast = null;
    },

    /**
     * Clear error for a specific feature.
     */
    clearFeatureError: (state, action: PayloadAction<string>) => {
      delete state.featureErrors[action.payload];
    },

    /**
     * Clear all feature-specific errors.
     */
    clearAllFeatureErrors: (state) => {
      state.featureErrors = {};
    },

    /**
     * Update the default toast duration.
     */
    setToastDuration: (state, action: PayloadAction<number>) => {
      state.toastDuration = action.payload;
    },
  },
});

// Actions
export const {
  addError,
  dismissError,
  clearActiveToast,
  showNextError,
  clearErrors,
  clearFeatureError,
  clearAllFeatureErrors,
  setToastDuration,
} = errorSlice.actions;

// Selectors
export const selectActiveToast = (state: RootState): ErrorEntry | null =>
  state.errors?.activeToast ?? null;

export const selectErrorQueue = (state: RootState): ErrorEntry[] =>
  state.errors?.errorQueue ?? [];

export const selectFeatureError = (feature: string) => (state: RootState): ErrorEntry | null =>
  state.errors?.featureErrors[feature] ?? null;

export const selectHasErrors = (state: RootState): boolean =>
  (state.errors?.errorQueue.filter(e => !e.dismissed).length ?? 0) > 0;

export const selectToastDuration = (state: RootState): number =>
  state.errors?.toastDuration ?? 4000;

export const selectUndismissedErrorCount = (state: RootState): number =>
  state.errors?.errorQueue.filter(e => !e.dismissed).length ?? 0;

export default errorSlice.reducer;
