import errorReducer, {
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
  ErrorState,
  ErrorEntry,
} from '../errorSlice';
import { ErrorCode } from '../../errors/codes/ErrorCodes';

describe('errorSlice', () => {
  const createErrorEntry = (overrides: Partial<ErrorEntry> = {}): Omit<ErrorEntry, 'id'> => ({
    code: ErrorCode.UNKNOWN,
    message: 'Test error',
    severity: 'error',
    timestamp: Date.now(),
    recoverable: true,
    retryable: false,
    dismissed: false,
    ...overrides,
  });

  const initialState: ErrorState = {
    errorQueue: [],
    activeToast: null,
    featureErrors: {},
    lastErrorTimestamp: 0,
    toastDuration: 6000,
    maxQueueSize: 5,
  };

  describe('addError', () => {
    it('adds error to queue', () => {
      const error = createErrorEntry();
      const state = errorReducer(initialState, addError(error));

      expect(state.errorQueue).toHaveLength(1);
      expect(state.errorQueue[0].code).toBe(ErrorCode.UNKNOWN);
      expect(state.errorQueue[0].id).toBeDefined();
    });

    it('sets active toast when no current toast', () => {
      const error = createErrorEntry();
      const state = errorReducer(initialState, addError(error));

      expect(state.activeToast).not.toBeNull();
      expect(state.activeToast?.code).toBe(ErrorCode.UNKNOWN);
    });

    it('does not change active toast when one already exists', () => {
      // Use different error codes to avoid deduplication
      const firstError = createErrorEntry({ message: 'First error', code: ErrorCode.NETWORK_OFFLINE });
      const stateWithToast = errorReducer(initialState, addError(firstError));

      const secondError = createErrorEntry({ message: 'Second error', code: ErrorCode.API_SERVER_ERROR });
      const finalState = errorReducer(stateWithToast, addError(secondError));

      expect(finalState.errorQueue).toHaveLength(2);
      expect(finalState.activeToast?.message).toBe('First error');
    });

    it('tracks error by feature', () => {
      const error = createErrorEntry({ feature: 'chat' });
      const state = errorReducer(initialState, addError(error));

      expect(state.featureErrors.chat).not.toBeNull();
      expect(state.featureErrors.chat?.code).toBe(ErrorCode.UNKNOWN);
    });

    it('deduplicates errors with same code within 2 seconds', () => {
      const now = Date.now();
      const error1 = createErrorEntry({
        code: ErrorCode.NETWORK_OFFLINE,
        timestamp: now,
      });
      const stateWithFirst = errorReducer(initialState, addError(error1));

      const error2 = createErrorEntry({
        code: ErrorCode.NETWORK_OFFLINE,
        timestamp: now + 1000, // Within 2 seconds
      });
      const finalState = errorReducer(stateWithFirst, addError(error2));

      expect(finalState.errorQueue).toHaveLength(1);
    });

    it('does not deduplicate errors with different codes', () => {
      const error1 = createErrorEntry({ code: ErrorCode.NETWORK_OFFLINE });
      const stateWithFirst = errorReducer(initialState, addError(error1));

      const error2 = createErrorEntry({ code: ErrorCode.API_RATE_LIMITED });
      const finalState = errorReducer(stateWithFirst, addError(error2));

      expect(finalState.errorQueue).toHaveLength(2);
    });

    it('trims queue when exceeding max size', () => {
      let state = initialState;
      // Use different error codes to avoid deduplication
      const errorCodes = [
        ErrorCode.NETWORK_OFFLINE,
        ErrorCode.NETWORK_TIMEOUT,
        ErrorCode.API_SERVER_ERROR,
        ErrorCode.API_RATE_LIMITED,
        ErrorCode.AUTH_SESSION_EXPIRED,
        ErrorCode.VALIDATION_REQUIRED,
      ];

      // Add 6 errors (max is 5)
      for (let i = 0; i < 6; i++) {
        const error = createErrorEntry({ message: `Error ${i}`, code: errorCodes[i] });
        state = errorReducer(state, addError(error));
      }

      expect(state.errorQueue).toHaveLength(5);
      expect(state.errorQueue[0].message).toBe('Error 1'); // First error trimmed
      expect(state.errorQueue[4].message).toBe('Error 5');
    });

    it('updates lastErrorTimestamp', () => {
      const timestamp = Date.now();
      const error = createErrorEntry({ timestamp });
      const state = errorReducer(initialState, addError(error));

      expect(state.lastErrorTimestamp).toBe(timestamp);
    });
  });

  describe('dismissError', () => {
    it('marks error as dismissed', () => {
      const error = createErrorEntry();
      const stateWithError = errorReducer(initialState, addError(error));
      const errorId = stateWithError.errorQueue[0].id;

      const state = errorReducer(stateWithError, dismissError(errorId));

      expect(state.errorQueue[0].dismissed).toBe(true);
    });

    it('clears active toast when dismissed', () => {
      const error = createErrorEntry();
      const stateWithError = errorReducer(initialState, addError(error));
      const errorId = stateWithError.activeToast!.id;

      const state = errorReducer(stateWithError, dismissError(errorId));

      expect(state.activeToast).toBeNull();
    });

    it('shows next undismissed error after dismissing active', () => {
      // Use different error codes to avoid deduplication
      const error1 = createErrorEntry({ message: 'First', code: ErrorCode.NETWORK_OFFLINE });
      let state = errorReducer(initialState, addError(error1));

      const error2 = createErrorEntry({ message: 'Second', code: ErrorCode.API_SERVER_ERROR });
      state = errorReducer(state, addError(error2));

      const firstErrorId = state.activeToast!.id;
      state = errorReducer(state, dismissError(firstErrorId));

      expect(state.activeToast?.message).toBe('Second');
    });

    it('does nothing for unknown error id', () => {
      const error = createErrorEntry();
      const stateWithError = errorReducer(initialState, addError(error));

      const state = errorReducer(stateWithError, dismissError('unknown-id'));

      expect(state.activeToast).not.toBeNull();
      expect(state.errorQueue[0].dismissed).toBe(false);
    });
  });

  describe('clearActiveToast', () => {
    it('clears active toast and marks as dismissed', () => {
      const error = createErrorEntry();
      const stateWithError = errorReducer(initialState, addError(error));

      const state = errorReducer(stateWithError, clearActiveToast());

      expect(state.activeToast).toBeNull();
      expect(state.errorQueue[0].dismissed).toBe(true);
    });

    it('shows next undismissed error', () => {
      // Use different error codes to avoid deduplication
      const error1 = createErrorEntry({ message: 'First', code: ErrorCode.NETWORK_OFFLINE });
      let state = errorReducer(initialState, addError(error1));

      const error2 = createErrorEntry({ message: 'Second', code: ErrorCode.API_SERVER_ERROR });
      state = errorReducer(state, addError(error2));

      state = errorReducer(state, clearActiveToast());

      expect(state.activeToast?.message).toBe('Second');
    });
  });

  describe('showNextError', () => {
    it('shows next undismissed error', () => {
      // Use different error codes to avoid deduplication
      const error1 = createErrorEntry({ message: 'First', code: ErrorCode.NETWORK_OFFLINE });
      let state = errorReducer(initialState, addError(error1));

      const error2 = createErrorEntry({ message: 'Second', code: ErrorCode.API_SERVER_ERROR });
      state = errorReducer(state, addError(error2));

      // Dismiss the first error properly using the reducer
      state = errorReducer(state, clearActiveToast());
      // Now activeToast should be Second

      // Clear active toast to set up the test condition (no active toast)
      // We need to create a state where both errors exist but no active toast
      state = {
        ...state,
        activeToast: null,
      };

      state = errorReducer(state, showNextError());

      // Second error should be shown (First is dismissed)
      expect(state.activeToast?.message).toBe('Second');
    });

    it('sets activeToast to null when no undismissed errors', () => {
      const error = createErrorEntry();
      let state = errorReducer(initialState, addError(error));

      // Manually mark the error as dismissed
      state = {
        ...state,
        errorQueue: state.errorQueue.map(e => ({ ...e, dismissed: true })),
      };
      state = errorReducer(state, showNextError());

      expect(state.activeToast).toBeNull();
    });
  });

  describe('clearErrors', () => {
    it('clears all errors and active toast', () => {
      const error1 = createErrorEntry({ message: 'First' });
      let state = errorReducer(initialState, addError(error1));

      const error2 = createErrorEntry({ message: 'Second' });
      state = errorReducer(state, addError(error2));

      state = errorReducer(state, clearErrors());

      expect(state.errorQueue).toHaveLength(0);
      expect(state.activeToast).toBeNull();
    });
  });

  describe('clearFeatureError', () => {
    it('clears error for specific feature', () => {
      const error = createErrorEntry({ feature: 'chat' });
      let state = errorReducer(initialState, addError(error));

      expect(state.featureErrors.chat).not.toBeNull();

      state = errorReducer(state, clearFeatureError('chat'));

      expect(state.featureErrors.chat).toBeUndefined();
    });

    it('does nothing for non-existent feature', () => {
      const error = createErrorEntry({ feature: 'chat' });
      const state = errorReducer(initialState, addError(error));

      const newState = errorReducer(state, clearFeatureError('unknown'));

      expect(newState.featureErrors).toEqual(state.featureErrors);
    });
  });

  describe('clearAllFeatureErrors', () => {
    it('clears all feature errors', () => {
      const error1 = createErrorEntry({ feature: 'chat' });
      let state = errorReducer(initialState, addError(error1));

      const error2 = createErrorEntry({ feature: 'debate' });
      state = errorReducer(state, addError(error2));

      state = errorReducer(state, clearAllFeatureErrors());

      expect(state.featureErrors).toEqual({});
    });
  });

  describe('setToastDuration', () => {
    it('updates toast duration', () => {
      const state = errorReducer(initialState, setToastDuration(6000));

      expect(state.toastDuration).toBe(6000);
    });
  });

  describe('selectors', () => {
    // Use unknown to allow partial mock state for selector testing
    const createMockState = (errors: ErrorState) => ({
      errors,
    } as unknown);

    describe('selectActiveToast', () => {
      it('returns active toast', () => {
        const error = createErrorEntry();
        const state = errorReducer(initialState, addError(error));
        const mockState = createMockState(state);

        const activeToast = selectActiveToast(mockState as Parameters<typeof selectActiveToast>[0]);

        expect(activeToast).not.toBeNull();
        expect(activeToast?.code).toBe(ErrorCode.UNKNOWN);
      });

      it('returns null when no active toast', () => {
        const mockState = createMockState(initialState);

        const activeToast = selectActiveToast(mockState as Parameters<typeof selectActiveToast>[0]);

        expect(activeToast).toBeNull();
      });
    });

    describe('selectErrorQueue', () => {
      it('returns error queue', () => {
        const error = createErrorEntry();
        const state = errorReducer(initialState, addError(error));
        const mockState = createMockState(state);

        const queue = selectErrorQueue(mockState as Parameters<typeof selectActiveToast>[0]);

        expect(queue).toHaveLength(1);
      });
    });

    describe('selectFeatureError', () => {
      it('returns error for specific feature', () => {
        const error = createErrorEntry({ feature: 'chat' });
        const state = errorReducer(initialState, addError(error));
        const mockState = createMockState(state);

        const featureError = selectFeatureError('chat')(mockState as Parameters<typeof selectActiveToast>[0]);

        expect(featureError).not.toBeNull();
        expect(featureError?.feature).toBe('chat');
      });

      it('returns null for unknown feature', () => {
        const mockState = createMockState(initialState);

        const featureError = selectFeatureError('unknown')(mockState as Parameters<typeof selectActiveToast>[0]);

        expect(featureError).toBeNull();
      });
    });

    describe('selectHasErrors', () => {
      it('returns true when undismissed errors exist', () => {
        const error = createErrorEntry();
        const state = errorReducer(initialState, addError(error));
        const mockState = createMockState(state);

        expect(selectHasErrors(mockState as Parameters<typeof selectActiveToast>[0])).toBe(true);
      });

      it('returns false when no errors', () => {
        const mockState = createMockState(initialState);

        expect(selectHasErrors(mockState as Parameters<typeof selectActiveToast>[0])).toBe(false);
      });

      it('returns false when all errors dismissed', () => {
        const error = createErrorEntry();
        let state = errorReducer(initialState, addError(error));
        state = errorReducer(state, clearActiveToast());
        const mockState = createMockState(state);

        expect(selectHasErrors(mockState as Parameters<typeof selectActiveToast>[0])).toBe(false);
      });
    });

    describe('selectToastDuration', () => {
      it('returns toast duration', () => {
        const mockState = createMockState(initialState);

        expect(selectToastDuration(mockState as Parameters<typeof selectActiveToast>[0])).toBe(6000);
      });
    });

    describe('selectUndismissedErrorCount', () => {
      it('returns count of undismissed errors', () => {
        // Use different error codes to avoid deduplication
        const error1 = createErrorEntry({ message: 'First', code: ErrorCode.NETWORK_OFFLINE });
        let state = errorReducer(initialState, addError(error1));

        const error2 = createErrorEntry({ message: 'Second', code: ErrorCode.API_SERVER_ERROR });
        state = errorReducer(state, addError(error2));

        // Dismiss first
        state = errorReducer(state, clearActiveToast());

        const mockState = createMockState(state);

        expect(selectUndismissedErrorCount(mockState as Parameters<typeof selectActiveToast>[0])).toBe(1);
      });
    });
  });
});
