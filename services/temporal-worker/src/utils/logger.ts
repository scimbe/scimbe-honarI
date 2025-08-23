/**
 * Logger utility for temporal worker
 */

export interface Logger {
  info: (message: string, ...args: any[]) => void;
  error: (message: string, ...args: any[]) => void;
  warn: (message: string, ...args: any[]) => void;
  debug: (message: string, ...args: any[]) => void;
}

export function createServiceLogger(serviceName: string): Logger {
  return {
    info: (message: string, ...args: any[]) => {
      console.log(`[${new Date().toISOString()}] [${serviceName}] INFO: ${message}`, ...args);
    },
    error: (message: string, ...args: any[]) => {
      console.error(`[${new Date().toISOString()}] [${serviceName}] ERROR: ${message}`, ...args);
    },
    warn: (message: string, ...args: any[]) => {
      console.warn(`[${new Date().toISOString()}] [${serviceName}] WARN: ${message}`, ...args);
    },
    debug: (message: string, ...args: any[]) => {
      console.debug(`[${new Date().toISOString()}] [${serviceName}] DEBUG: ${message}`, ...args);
    },
  };
}