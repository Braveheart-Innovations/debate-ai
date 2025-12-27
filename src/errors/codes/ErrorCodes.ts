/**
 * Error codes for categorized error handling.
 * Format: EXXXX where X is a digit
 * - E1xxx: Network errors
 * - E2xxx: API errors
 * - E3xxx: Authentication errors
 * - E4xxx: Validation errors
 * - E5xxx: Application errors
 * - E9xxx: Unknown/system errors
 */
export enum ErrorCode {
  // Network Errors (1xxx)
  NETWORK_OFFLINE = 'E1001',
  NETWORK_TIMEOUT = 'E1002',
  NETWORK_DNS_FAILURE = 'E1003',
  NETWORK_SSL_ERROR = 'E1004',
  NETWORK_CONNECTION_REFUSED = 'E1005',

  // API Errors (2xxx)
  API_UNAUTHORIZED = 'E2001',
  API_FORBIDDEN = 'E2002',
  API_NOT_FOUND = 'E2003',
  API_RATE_LIMITED = 'E2004',
  API_SERVER_ERROR = 'E2005',
  API_SERVICE_UNAVAILABLE = 'E2006',
  API_BAD_REQUEST = 'E2007',
  API_STREAMING_FAILED = 'E2008',
  API_PROVIDER_OVERLOADED = 'E2009',
  API_VERIFICATION_REQUIRED = 'E2010',
  API_INVALID_RESPONSE = 'E2011',
  API_CONTENT_FILTERED = 'E2012',

  // Auth Errors (3xxx)
  AUTH_INVALID_CREDENTIALS = 'E3001',
  AUTH_SESSION_EXPIRED = 'E3002',
  AUTH_USER_DISABLED = 'E3003',
  AUTH_EMAIL_IN_USE = 'E3004',
  AUTH_WEAK_PASSWORD = 'E3005',
  AUTH_SOCIAL_AUTH_FAILED = 'E3006',
  AUTH_APPLE_SIGN_IN_FAILED = 'E3007',
  AUTH_GOOGLE_SIGN_IN_FAILED = 'E3008',
  AUTH_USER_NOT_FOUND = 'E3009',
  AUTH_NETWORK_ERROR = 'E3010',

  // Validation Errors (4xxx)
  VALIDATION_REQUIRED = 'E4001',
  VALIDATION_INVALID_FORMAT = 'E4002',
  VALIDATION_API_KEY_INVALID = 'E4003',
  VALIDATION_MESSAGE_TOO_LONG = 'E4004',
  VALIDATION_ATTACHMENT_TOO_LARGE = 'E4005',
  VALIDATION_UNSUPPORTED_FORMAT = 'E4006',

  // App Errors (5xxx)
  APP_STORAGE_FULL = 'E5001',
  APP_PERMISSIONS_DENIED = 'E5002',
  APP_FEATURE_NOT_AVAILABLE = 'E5003',
  APP_PREMIUM_REQUIRED = 'E5004',
  APP_ADAPTER_NOT_FOUND = 'E5005',
  APP_SESSION_NOT_FOUND = 'E5006',
  APP_INITIALIZATION_FAILED = 'E5007',

  // Unknown/System
  UNKNOWN = 'E9999',
}

export type ErrorSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface ErrorContext {
  provider?: string;
  screen?: string;
  action?: string;
  messageId?: string;
  sessionId?: string;
  feature?: string;
  statusCode?: number;
  [key: string]: unknown;
}
