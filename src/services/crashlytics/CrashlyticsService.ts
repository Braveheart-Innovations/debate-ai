import crashlytics from '@react-native-firebase/crashlytics';

/**
 * CrashlyticsService - Centralized crash and error reporting
 *
 * Provides methods for:
 * - Recording non-fatal errors with context
 * - Logging breadcrumbs for debugging
 * - Setting user identification for error tracking
 * - Setting custom attributes for filtering
 */
export class CrashlyticsService {
  private static initialized = false;

  /**
   * Initialize Crashlytics
   * Should be called once during app startup after Firebase init
   */
  static async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Enable Crashlytics collection
      await crashlytics().setCrashlyticsCollectionEnabled(true);
      this.initialized = true;

      if (__DEV__) {
        console.warn('[Crashlytics] Initialized successfully');
      }
    } catch (error) {
      console.error('[Crashlytics] Failed to initialize:', error);
    }
  }

  /**
   * Log a message as a breadcrumb for crash context
   * These appear in crash reports to help understand what led to a crash
   */
  static log(message: string): void {
    if (!this.initialized) {
      if (__DEV__) {
        console.warn('[Crashlytics] Not initialized, skipping log:', message);
      }
      return;
    }

    try {
      crashlytics().log(message);
    } catch (error) {
      console.error('[Crashlytics] Failed to log:', error);
    }
  }

  /**
   * Record a non-fatal error with optional context
   * Use this for caught exceptions that don't crash the app
   */
  static recordError(
    error: Error,
    context?: Record<string, string>
  ): void {
    if (!this.initialized) {
      if (__DEV__) {
        console.warn('[Crashlytics] Not initialized, skipping error record');
      }
      return;
    }

    try {
      // Log context as attributes if provided
      if (context) {
        Object.entries(context).forEach(([key, value]) => {
          crashlytics().setAttribute(key, value);
        });
      }

      // Record the error
      crashlytics().recordError(error);

      if (__DEV__) {
        console.warn('[Crashlytics] Recorded error:', error.message);
      }
    } catch (err) {
      console.error('[Crashlytics] Failed to record error:', err);
    }
  }

  /**
   * Set the user ID for error attribution
   * Call this when user signs in/out
   */
  static setUserId(userId: string | null): void {
    if (!this.initialized) {
      return;
    }

    try {
      if (userId) {
        crashlytics().setUserId(userId);
      } else {
        // Clear user ID on sign out
        crashlytics().setUserId('');
      }
    } catch (error) {
      console.error('[Crashlytics] Failed to set user ID:', error);
    }
  }

  /**
   * Set custom attributes for filtering and analysis
   * Common attributes: membership status, app version, demo mode
   */
  static setAttributes(attributes: Record<string, string>): void {
    if (!this.initialized) {
      return;
    }

    try {
      crashlytics().setAttributes(attributes);
    } catch (error) {
      console.error('[Crashlytics] Failed to set attributes:', error);
    }
  }

  /**
   * Set a single custom attribute
   */
  static setAttribute(key: string, value: string): void {
    if (!this.initialized) {
      return;
    }

    try {
      crashlytics().setAttribute(key, value);
    } catch (error) {
      console.error('[Crashlytics] Failed to set attribute:', error);
    }
  }

  /**
   * Force a crash for testing purposes
   * Only works in production builds, not in __DEV__
   */
  static crash(): void {
    if (__DEV__) {
      console.warn('[Crashlytics] Crash test is only available in production builds');
      return;
    }

    crashlytics().crash();
  }

  /**
   * Check if Crashlytics is initialized
   */
  static isInitialized(): boolean {
    return this.initialized;
  }
}
