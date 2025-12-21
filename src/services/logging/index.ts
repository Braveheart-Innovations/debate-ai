import { Logger as LoggerClass } from './Logger';

export { Logger, LogLevel } from './Logger';
export type { LogEntry } from './Logger';

// Convenience singleton export
export const logger = LoggerClass.getInstance();
