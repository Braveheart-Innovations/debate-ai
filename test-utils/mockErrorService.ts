/**
 * Shared ErrorService Mock Utility
 *
 * Usage in test files:
 *
 * ```typescript
 * import { createErrorServiceMock, ErrorServiceMocks } from '../../test-utils/mockErrorService';
 *
 * // At the top of test file (before imports that use ErrorService)
 * const errorMocks = createErrorServiceMock();
 *
 * // In beforeEach
 * beforeEach(() => {
 *   errorMocks.resetAll();
 * });
 *
 * // In tests
 * expect(errorMocks.showWarning).toHaveBeenCalledWith('message', 'feature');
 * ```
 */

export interface ErrorServiceMocks {
  handleError: jest.Mock;
  handleWithToast: jest.Mock;
  handleSilent: jest.Mock;
  showSuccess: jest.Mock;
  showInfo: jest.Mock;
  showWarning: jest.Mock;
  getUserMessage: jest.Mock;
  createAppError: jest.Mock;
  getSeverityLevel: jest.Mock;
  isRetryable: jest.Mock;
  isRecoverable: jest.Mock;
  resetAll: () => void;
}

/**
 * Creates mock functions and sets up the ErrorService mock.
 * Call this at the top of your test file, before any imports that use ErrorService.
 *
 * @returns Object with all mock functions and a resetAll method
 */
export function createErrorServiceMock(): ErrorServiceMocks {
  const handleError = jest.fn();
  const handleWithToast = jest.fn();
  const handleSilent = jest.fn();
  const showSuccess = jest.fn();
  const showInfo = jest.fn();
  const showWarning = jest.fn();
  const getUserMessage = jest.fn().mockReturnValue('An error occurred');
  const createAppError = jest.fn();
  const getSeverityLevel = jest.fn().mockReturnValue('error');
  const isRetryable = jest.fn().mockReturnValue(false);
  const isRecoverable = jest.fn().mockReturnValue(true);

  // Setup the mock
  jest.mock('@/services/errors/ErrorService', () => ({
    ErrorService: {
      handleError,
      handleWithToast,
      handleSilent,
      showSuccess,
      showInfo,
      showWarning,
      getUserMessage,
      createAppError,
      getSeverityLevel,
      isRetryable,
      isRecoverable,
    },
  }));

  return {
    handleError,
    handleWithToast,
    handleSilent,
    showSuccess,
    showInfo,
    showWarning,
    getUserMessage,
    createAppError,
    getSeverityLevel,
    isRetryable,
    isRecoverable,
    resetAll: () => {
      handleError.mockClear();
      handleWithToast.mockClear();
      handleSilent.mockClear();
      showSuccess.mockClear();
      showInfo.mockClear();
      showWarning.mockClear();
      getUserMessage.mockClear();
      createAppError.mockClear();
      getSeverityLevel.mockClear();
      isRetryable.mockClear();
      isRecoverable.mockClear();
    },
  };
}

/**
 * Inline mock setup for use at the top of test files.
 * Returns the mock objects that can be used in assertions.
 *
 * Usage:
 * ```typescript
 * const { mockShowWarning, mockHandleWithToast } = setupErrorServiceMock();
 * ```
 */
export function setupErrorServiceMock() {
  const mockHandleError = jest.fn();
  const mockHandleWithToast = jest.fn();
  const mockHandleSilent = jest.fn();
  const mockShowSuccess = jest.fn();
  const mockShowInfo = jest.fn();
  const mockShowWarning = jest.fn();

  return {
    mockHandleError,
    mockHandleWithToast,
    mockHandleSilent,
    mockShowSuccess,
    mockShowInfo,
    mockShowWarning,
    getMockConfig: () => ({
      ErrorService: {
        handleError: mockHandleError,
        handleWithToast: mockHandleWithToast,
        handleSilent: mockHandleSilent,
        showSuccess: mockShowSuccess,
        showInfo: mockShowInfo,
        showWarning: mockShowWarning,
        getUserMessage: jest.fn().mockReturnValue('An error occurred'),
        createAppError: jest.fn(),
        getSeverityLevel: jest.fn().mockReturnValue('error'),
        isRetryable: jest.fn().mockReturnValue(false),
        isRecoverable: jest.fn().mockReturnValue(true),
      },
    }),
    resetAll: () => {
      mockHandleError.mockClear();
      mockHandleWithToast.mockClear();
      mockHandleSilent.mockClear();
      mockShowSuccess.mockClear();
      mockShowInfo.mockClear();
      mockShowWarning.mockClear();
    },
  };
}

/**
 * Example jest.mock call that can be copied into test files.
 * This is exported as a comment template since jest.mock must be called
 * at the module level and cannot be dynamically generated.
 */
export const ERROR_SERVICE_MOCK_TEMPLATE = `
// Copy this to the top of your test file:
const mockShowSuccess = jest.fn();
const mockShowInfo = jest.fn();
const mockShowWarning = jest.fn();
const mockHandleWithToast = jest.fn();
const mockHandleError = jest.fn();
const mockHandleSilent = jest.fn();

jest.mock('@/services/errors/ErrorService', () => ({
  ErrorService: {
    showSuccess: (...args: unknown[]) => mockShowSuccess(...args),
    showInfo: (...args: unknown[]) => mockShowInfo(...args),
    showWarning: (...args: unknown[]) => mockShowWarning(...args),
    handleWithToast: (...args: unknown[]) => mockHandleWithToast(...args),
    handleError: (...args: unknown[]) => mockHandleError(...args),
    handleSilent: (...args: unknown[]) => mockHandleSilent(...args),
    getUserMessage: jest.fn().mockReturnValue('An error occurred'),
    createAppError: jest.fn(),
    getSeverityLevel: jest.fn().mockReturnValue('error'),
    isRetryable: jest.fn().mockReturnValue(false),
    isRecoverable: jest.fn().mockReturnValue(true),
  },
}));

// In beforeEach:
beforeEach(() => {
  jest.clearAllMocks();
  // or individually:
  mockShowSuccess.mockClear();
  mockShowWarning.mockClear();
  // etc.
});
`;
