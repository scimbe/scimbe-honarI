/**
 * Correlation ID middleware for request tracing across services
 */

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { PlatformLogger, LogContext } from '../utils/logger';

export interface CorrelationContext extends LogContext {
  requestId: string;
  traceId: string;
  spanId: string;
  userId?: string;
  sessionId?: string;
  parentSpanId?: string;
}

/**
 * Correlation headers
 */
export const CORRELATION_HEADERS = {
  REQUEST_ID: 'x-request-id',
  TRACE_ID: 'x-trace-id',
  SPAN_ID: 'x-span-id',
  PARENT_SPAN_ID: 'x-parent-span-id',
  USER_ID: 'x-user-id',
  SESSION_ID: 'x-session-id',
} as const;

/**
 * Extract correlation context from request headers
 */
export function extractCorrelationContext(req: Request): CorrelationContext {
  const requestId = (req.headers[CORRELATION_HEADERS.REQUEST_ID] as string) || uuidv4();
  const traceId = (req.headers[CORRELATION_HEADERS.TRACE_ID] as string) || uuidv4();
  const spanId = (req.headers[CORRELATION_HEADERS.SPAN_ID] as string) || uuidv4();
  const parentSpanId = req.headers[CORRELATION_HEADERS.PARENT_SPAN_ID] as string;
  const userId = req.headers[CORRELATION_HEADERS.USER_ID] as string;
  const sessionId = req.headers[CORRELATION_HEADERS.SESSION_ID] as string;

  return {
    requestId,
    traceId,
    spanId,
    ...(parentSpanId && { parentSpanId }),
    ...(userId && { userId }),
    ...(sessionId && { sessionId }),
  };
}

/**
 * Add correlation context to response headers
 */
export function addCorrelationHeaders(res: Response, context: CorrelationContext): void {
  res.setHeader(CORRELATION_HEADERS.REQUEST_ID, context.requestId);
  res.setHeader(CORRELATION_HEADERS.TRACE_ID, context.traceId);
  res.setHeader(CORRELATION_HEADERS.SPAN_ID, context.spanId);

  if (context.parentSpanId) {
    res.setHeader(CORRELATION_HEADERS.PARENT_SPAN_ID, context.parentSpanId);
  }
  if (context.userId) {
    res.setHeader(CORRELATION_HEADERS.USER_ID, context.userId);
  }
  if (context.sessionId) {
    res.setHeader(CORRELATION_HEADERS.SESSION_ID, context.sessionId);
  }
}

/**
 * Correlation middleware factory
 */
export function createCorrelationMiddleware(logger?: PlatformLogger) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const startTime = Date.now();
    const context = extractCorrelationContext(req);

    // Add correlation context to request
    (req as Request & { correlation: CorrelationContext }).correlation = context;

    // Add correlation headers to response
    addCorrelationHeaders(res, context);

    // Log request start
    if (logger) {
      logger.withContext(context).info(
        {
          method: req.method,
          url: req.url,
          userAgent: req.get('User-Agent'),
          ip: req.ip,
          type: 'request_start',
        },
        `${req.method} ${req.url} - Request started`
      );
    }

    // Hook into response finish to log completion
    const originalSend = res.send;
    res.send = function (body: unknown) {
      const duration = Date.now() - startTime;

      if (logger) {
        logger.withContext(context).info(
          {
            method: req.method,
            url: req.url,
            statusCode: res.statusCode,
            duration,
            type: 'request_complete',
          },
          `${req.method} ${req.url} - ${res.statusCode} - ${duration}ms`
        );
      }

      return originalSend.call(this, body);
    };

    next();
  };
}

/**
 * Extract correlation context from Express request
 */
export function getCorrelationContext(req: Request): CorrelationContext | undefined {
  return (req as Request & { correlation?: CorrelationContext }).correlation;
}

/**
 * Create headers for downstream service calls
 */
export function createDownstreamHeaders(context: CorrelationContext): Record<string, string> {
  return {
    [CORRELATION_HEADERS.REQUEST_ID]: context.requestId,
    [CORRELATION_HEADERS.TRACE_ID]: context.traceId,
    [CORRELATION_HEADERS.PARENT_SPAN_ID]: context.spanId,
    [CORRELATION_HEADERS.SPAN_ID]: uuidv4(), // New span for downstream call
    ...(context.userId && { [CORRELATION_HEADERS.USER_ID]: context.userId }),
    ...(context.sessionId && { [CORRELATION_HEADERS.SESSION_ID]: context.sessionId }),
  };
}