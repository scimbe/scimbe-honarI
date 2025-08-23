/**
 * Centralized logging utility for Temporal AI Workflow Platform
 */

import pino, { Logger, LoggerOptions } from 'pino';

export interface LoggerConfig {
  service: string;
  level?: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
  environment?: string;
  pretty?: boolean;
  destination?: string;
}

export interface LogContext {
  workflowId?: string;
  runId?: string;
  activityId?: string;
  userId?: string;
  requestId?: string;
  traceId?: string;
  spanId?: string;
  sessionId?: string;
  [key: string]: unknown;
}

/**
 * Creates a structured logger instance with platform-specific configuration
 */
export function createLogger(config: LoggerConfig): Logger {
  const options: LoggerOptions = {
    name: config.service,
    level: config.level || (config.environment === 'production' ? 'info' : 'debug'),
    base: {
      service: config.service,
      environment: config.environment || 'development',
      version: process.env.npm_package_version || '2.0.0',
      hostname: process.env.HOSTNAME || 'unknown',
      pid: process.pid,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ level: label }),
      log: (object) => {
        // Add correlation IDs and context
        const { workflowId, runId, activityId, userId, requestId, traceId, spanId, ...rest } =
          object as LogContext;

        return {
          ...rest,
          ...(workflowId && { workflowId }),
          ...(runId && { runId }),
          ...(activityId && { activityId }),
          ...(userId && { userId }),
          ...(requestId && { requestId }),
          ...(traceId && { traceId }),
          ...(spanId && { spanId }),
        };
      },
    },
    serializers: {
      error: pino.stdSerializers.err,
      req: pino.stdSerializers.req,
      res: pino.stdSerializers.res,
    },
  };

  // Pretty printing for development
  if (config.pretty && config.environment !== 'production') {
    return pino(options, pino.destination({ sync: false }));
  }

  // Custom destination
  if (config.destination) {
    return pino(options, pino.destination(config.destination));
  }

  return pino(options);
}

/**
 * Platform-specific logger instances
 */
export class PlatformLogger {
  private logger: Logger;

  constructor(config: LoggerConfig) {
    this.logger = createLogger(config);
  }

  /**
   * Log with context information
   */
  withContext(context: LogContext): Logger {
    return this.logger.child(context);
  }

  /**
   * Workflow-specific logging
   */
  workflow(workflowId: string, runId?: string): Logger {
    return this.logger.child({ workflowId, runId });
  }

  /**
   * Activity-specific logging
   */
  activity(activityId: string, workflowId?: string): Logger {
    return this.logger.child({ activityId, workflowId });
  }

  /**
   * Request-specific logging
   */
  request(requestId: string, userId?: string): Logger {
    return this.logger.child({ requestId, userId });
  }

  /**
   * Performance monitoring logging
   */
  performance(operation: string, duration: number, context?: LogContext): void {
    this.logger.info(
      {
        ...context,
        operation,
        duration,
        type: 'performance',
      },
      `Operation ${operation} completed in ${duration}ms`
    );
  }

  /**
   * Error logging with stack trace
   */
  error(error: Error, context?: LogContext, message?: string): void {
    this.logger.error(
      {
        ...context,
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
        type: 'error',
      },
      message || error.message
    );
  }

  /**
   * Security event logging
   */
  security(event: string, context?: LogContext, severity: 'low' | 'medium' | 'high' = 'medium'): void {
    this.logger.warn(
      {
        ...context,
        securityEvent: event,
        severity,
        type: 'security',
      },
      `Security event: ${event}`
    );
  }

  /**
   * Audit logging
   */
  audit(action: string, resource: string, context?: LogContext): void {
    this.logger.info(
      {
        ...context,
        action,
        resource,
        type: 'audit',
        timestamp: new Date().toISOString(),
      },
      `Audit: ${action} on ${resource}`
    );
  }

  /**
   * Metrics logging
   */
  metric(name: string, value: number, tags?: Record<string, string>): void {
    this.logger.info(
      {
        metric: name,
        value,
        tags,
        type: 'metric',
        timestamp: Date.now(),
      },
      `Metric: ${name} = ${value}`
    );
  }

  /**
   * Get the underlying pino logger
   */
  getLogger(): Logger {
    return this.logger;
  }
}

/**
 * Create service-specific logger instances
 */
export function createServiceLogger(serviceName: string, config?: Partial<LoggerConfig>): PlatformLogger {
  return new PlatformLogger({
    service: serviceName,
    environment: process.env.NODE_ENV || 'development',
    level: (process.env.LOG_LEVEL as LoggerConfig['level']) || 'info',
    pretty: process.env.NODE_ENV !== 'production',
    ...config,
  });
}