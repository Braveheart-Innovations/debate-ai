import { ErrorCode } from '../codes/ErrorCodes';

/**
 * User-friendly error messages mapped to error codes.
 * These messages are shown to users in the UI.
 */
export const UserFriendlyMessages: Record<ErrorCode, string> = {
  // Network Errors
  [ErrorCode.NETWORK_OFFLINE]: 'You appear to be offline. Please check your internet connection.',
  [ErrorCode.NETWORK_TIMEOUT]: 'The request took too long. Please try again.',
  [ErrorCode.NETWORK_DNS_FAILURE]: 'Unable to reach the server. Please check your connection.',
  [ErrorCode.NETWORK_SSL_ERROR]: 'Secure connection failed. Please try again.',
  [ErrorCode.NETWORK_CONNECTION_REFUSED]: 'Unable to connect to the server. Please try again later.',

  // API Errors
  [ErrorCode.API_UNAUTHORIZED]: 'Your API key is invalid or expired. Please check your settings.',
  [ErrorCode.API_FORBIDDEN]: "You don't have permission to perform this action.",
  [ErrorCode.API_NOT_FOUND]: 'The requested resource was not found.',
  [ErrorCode.API_RATE_LIMITED]: "You've made too many requests. Please wait a moment and try again.",
  [ErrorCode.API_SERVER_ERROR]: 'The AI service encountered an error. Please try again.',
  [ErrorCode.API_SERVICE_UNAVAILABLE]: 'The AI service is temporarily unavailable. Please try again later.',
  [ErrorCode.API_BAD_REQUEST]: 'There was an issue with your request. Please try again.',
  [ErrorCode.API_STREAMING_FAILED]: 'Streaming was interrupted. Switching to standard mode.',
  [ErrorCode.API_PROVIDER_OVERLOADED]: 'This AI is currently busy. Please try again in a moment.',
  [ErrorCode.API_VERIFICATION_REQUIRED]: 'Organization verification is required for streaming.',
  [ErrorCode.API_INVALID_RESPONSE]: 'Received an unexpected response. Please try again.',
  [ErrorCode.API_CONTENT_FILTERED]: 'The response was filtered due to content policies.',

  // Auth Errors
  [ErrorCode.AUTH_INVALID_CREDENTIALS]: 'Invalid email or password. Please try again.',
  [ErrorCode.AUTH_SESSION_EXPIRED]: 'Your session has expired. Please sign in again.',
  [ErrorCode.AUTH_USER_DISABLED]: 'This account has been disabled. Please contact support.',
  [ErrorCode.AUTH_EMAIL_IN_USE]: 'This email is already in use. Please sign in or use a different email.',
  [ErrorCode.AUTH_WEAK_PASSWORD]: 'Password is too weak. Please use a stronger password.',
  [ErrorCode.AUTH_SOCIAL_AUTH_FAILED]: 'Social sign-in failed. Please try again.',
  [ErrorCode.AUTH_APPLE_SIGN_IN_FAILED]: 'Apple Sign-In failed. Please try again or use another method.',
  [ErrorCode.AUTH_GOOGLE_SIGN_IN_FAILED]: 'Google Sign-In failed. Please try again or use another method.',
  [ErrorCode.AUTH_USER_NOT_FOUND]: 'No account found with this email address.',
  [ErrorCode.AUTH_NETWORK_ERROR]: 'Network error during authentication. Please check your connection.',

  // Validation Errors
  [ErrorCode.VALIDATION_REQUIRED]: 'This field is required.',
  [ErrorCode.VALIDATION_INVALID_FORMAT]: 'Invalid format. Please check your input.',
  [ErrorCode.VALIDATION_API_KEY_INVALID]: 'Invalid API key. Please check and try again.',
  [ErrorCode.VALIDATION_MESSAGE_TOO_LONG]: 'Your message is too long. Please shorten it.',
  [ErrorCode.VALIDATION_ATTACHMENT_TOO_LARGE]: 'Attachment is too large. Maximum size is 10MB.',
  [ErrorCode.VALIDATION_UNSUPPORTED_FORMAT]: 'This file format is not supported.',

  // App Errors
  [ErrorCode.APP_STORAGE_FULL]: 'Storage is full. Please free up some space.',
  [ErrorCode.APP_PERMISSIONS_DENIED]: 'Required permissions were denied. Please enable them in settings.',
  [ErrorCode.APP_FEATURE_NOT_AVAILABLE]: 'This feature is not available on your device.',
  [ErrorCode.APP_PREMIUM_REQUIRED]: 'This feature requires a premium subscription.',
  [ErrorCode.APP_ADAPTER_NOT_FOUND]: 'AI provider configuration not found. Please check settings.',
  [ErrorCode.APP_SESSION_NOT_FOUND]: 'Session not found. Please start a new conversation.',
  [ErrorCode.APP_INITIALIZATION_FAILED]: 'App initialization failed. Please restart the app.',

  // Unknown
  [ErrorCode.UNKNOWN]: 'An unexpected error occurred. Please try again.',
};

/**
 * Get a user-friendly message for an error code.
 * Falls back to unknown error message if code not found.
 */
export function getUserFriendlyMessage(code: ErrorCode): string {
  return UserFriendlyMessages[code] || UserFriendlyMessages[ErrorCode.UNKNOWN];
}
