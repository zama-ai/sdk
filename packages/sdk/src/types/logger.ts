/**
 * Optional logger for SDK observability.
 * Pass via config to observe operation lifecycle (start, success, error, timeout).
 */
export interface GenericLogger {
  /** Log at info level. */
  info: (message: string, data?: Record<string, unknown>) => void;
  /** Log at debug level. */
  debug: (message: string, data?: Record<string, unknown>) => void;
  /** Log at warn level. */
  warn: (message: string, data?: Record<string, unknown>) => void;
  /** Log at error level. */
  error: (message: string, data?: Record<string, unknown>) => void;
}
