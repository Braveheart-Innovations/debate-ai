import { CrashlyticsService } from '../crashlytics';

/**
 * Log levels for filtering and categorization
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

/**
 * Structure of a log entry
 */
export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  source?: string;
}

/**
 * Logger configuration
 */
interface LoggerConfig {
  /** Minimum log level to output */
  minLevel: LogLevel;
  /** Maximum number of entries to keep in buffer */
  maxBufferSize: number;
  /** Whether to output to console */
  consoleOutput: boolean;
  /** Whether to send errors to Crashlytics */
  crashlyticsEnabled: boolean;
}

const DEFAULT_CONFIG: LoggerConfig = {
  minLevel: __DEV__ ? LogLevel.DEBUG : LogLevel.WARN,
  maxBufferSize: 500,
  consoleOutput: __DEV__,
  crashlyticsEnabled: true,
};

/**
 * Logger - Centralized logging service
 *
 * Features:
 * - Log levels (DEBUG, INFO, WARN, ERROR)
 * - In-memory circular buffer for debug menu
 * - Crashlytics integration for error logs
 * - Environment-aware defaults (verbose in dev, minimal in prod)
 */
export class Logger {
  private static instance: Logger;
  private buffer: LogEntry[] = [];
  private config: LoggerConfig;
  private listeners: ((entry: LogEntry) => void)[] = [];

  private constructor(config: Partial<LoggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get the singleton Logger instance
   */
  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  /**
   * Log a debug message (development only by default)
   */
  debug(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  /**
   * Log an informational message
   */
  info(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, context);
  }

  /**
   * Log a warning message
   */
  warn(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, context);
  }

  /**
   * Log an error message with optional Error object
   */
  error(
    message: string,
    error?: Error,
    context?: Record<string, unknown>
  ): void {
    const errorContext = error
      ? {
          ...context,
          errorName: error.name,
          errorMessage: error.message,
          errorStack: error.stack,
        }
      : context;

    this.log(LogLevel.ERROR, message, errorContext);

    // Send to Crashlytics if enabled and we have an Error object
    if (this.config.crashlyticsEnabled && error) {
      CrashlyticsService.recordError(error, {
        logMessage: message,
        ...this.stringifyContext(context),
      });
    }
  }

  /**
   * Core logging method
   */
  private log(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>
  ): void {
    // Check minimum level
    if (level < this.config.minLevel) {
      return;
    }

    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      message,
      context,
    };

    // Add to circular buffer
    this.buffer.push(entry);
    if (this.buffer.length > this.config.maxBufferSize) {
      this.buffer.shift();
    }

    // Console output
    if (this.config.consoleOutput) {
      this.outputToConsole(entry);
    }

    // Notify listeners
    this.listeners.forEach((listener) => listener(entry));

    // Log breadcrumb to Crashlytics for non-error logs
    if (
      this.config.crashlyticsEnabled &&
      level >= LogLevel.INFO &&
      level < LogLevel.ERROR
    ) {
      CrashlyticsService.log(`[${this.getLevelName(level)}] ${message}`);
    }
  }

  /**
   * Output a log entry to console
   */
  private outputToConsole(entry: LogEntry): void {
    const prefix = `[${this.getLevelName(entry.level)}]`;
    const args: unknown[] = [prefix, entry.message];

    if (entry.context) {
      args.push(entry.context);
    }

    switch (entry.level) {
      case LogLevel.DEBUG:
        console.warn(...args); // Use warn since debug not allowed by lint
        break;
      case LogLevel.INFO:
        console.warn(...args); // Use warn since info not allowed by lint
        break;
      case LogLevel.WARN:
        console.warn(...args);
        break;
      case LogLevel.ERROR:
        console.error(...args);
        break;
    }
  }

  /**
   * Get the name of a log level
   */
  private getLevelName(level: LogLevel): string {
    switch (level) {
      case LogLevel.DEBUG:
        return 'DEBUG';
      case LogLevel.INFO:
        return 'INFO';
      case LogLevel.WARN:
        return 'WARN';
      case LogLevel.ERROR:
        return 'ERROR';
      default:
        return 'UNKNOWN';
    }
  }

  /**
   * Convert context to string values for Crashlytics
   */
  private stringifyContext(
    context?: Record<string, unknown>
  ): Record<string, string> {
    if (!context) {
      return {};
    }

    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(context)) {
      result[key] =
        typeof value === 'string' ? value : JSON.stringify(value);
    }
    return result;
  }

  /**
   * Get all entries in the buffer
   */
  getBuffer(): LogEntry[] {
    return [...this.buffer];
  }

  /**
   * Get entries filtered by log level
   */
  getBufferByLevel(minLevel: LogLevel): LogEntry[] {
    return this.buffer.filter((entry) => entry.level >= minLevel);
  }

  /**
   * Clear the buffer
   */
  clearBuffer(): void {
    this.buffer = [];
  }

  /**
   * Set the minimum log level
   */
  setMinLevel(level: LogLevel): void {
    this.config.minLevel = level;
  }

  /**
   * Get the current minimum log level
   */
  getMinLevel(): LogLevel {
    return this.config.minLevel;
  }

  /**
   * Add a listener for log entries
   */
  addListener(listener: (entry: LogEntry) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /**
   * Enable or disable console output
   */
  setConsoleOutput(enabled: boolean): void {
    this.config.consoleOutput = enabled;
  }
}
