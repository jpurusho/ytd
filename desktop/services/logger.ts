/**
 * Structured logging service for the main process
 * Uses winston for file and console logging with rotation
 */
import * as path from 'path';
import * as os from 'os';
import * as winston from 'winston';
import { getSetting } from './database';

const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

class Logger {
  private logger: winston.Logger;
  private initialized = false;

  constructor() {
    // Initialize with console-only logger until we know the log directory
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          ),
        }),
      ],
    });
  }

  /**
   * Initialize file logging (call after database is ready)
   */
  init(): void {
    if (this.initialized) return;

    try {
      const outputDir = getSetting('output_dir') || path.join(os.homedir(), 'Downloads');
      const logDir = path.join(outputDir, 'ytd-logs');

      // Add file transports with rotation
      this.logger.add(
        new winston.transports.File({
          filename: path.join(logDir, 'error.log'),
          level: 'error',
          maxsize: 5242880, // 5MB
          maxFiles: 5,
        })
      );

      this.logger.add(
        new winston.transports.File({
          filename: path.join(logDir, 'combined.log'),
          maxsize: 10485760, // 10MB
          maxFiles: 5,
        })
      );

      this.initialized = true;
      this.info('Logger initialized', { logDir });
    } catch (error) {
      console.error('Failed to initialize file logging:', error);
    }
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.logger.debug(message, meta);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.logger.info(message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.logger.warn(message, meta);
  }

  error(message: string, error?: unknown, meta?: Record<string, unknown>): void {
    if (error instanceof Error) {
      this.logger.error(message, { ...meta, error: error.message, stack: error.stack });
    } else {
      this.logger.error(message, { ...meta, error });
    }
  }

  /**
   * Log with custom level
   */
  log(level: keyof typeof LOG_LEVELS, message: string, meta?: Record<string, unknown>): void {
    this.logger.log(level, message, meta);
  }
}

// Singleton instance
export const logger = new Logger();

// Convenience exports
export const { debug, info, warn, error, log } = logger;
