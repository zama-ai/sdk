/**
 * Optional logger for SDK observability.
 * Pass via config to observe operation lifecycle (start, success, error, timeout).
 */
export interface GenericLogger {
  info: (message: string, data?: Record<string, unknown>) => void;
  debug: (message: string, data?: Record<string, unknown>) => void;
  warn: (message: string, data?: Record<string, unknown>) => void;
  error: (message: string, data?: Record<string, unknown>) => void;
}
