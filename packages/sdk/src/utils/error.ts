import { ZamaErrorCode } from "../errors/base";

/** Coerce an unknown caught value to an Error instance. */
export function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  if (typeof error === "object" && error !== null && "message" in error) {
    return new Error(String(error.message));
  }
  return new Error(String(error));
}

/**
 * Returns true if the error is a contract call revert (as opposed to a network/transport error).
 * Detects viem's ContractFunctionExecutionError / ContractFunctionRevertedError
 * and ethers' CALL_EXCEPTION.
 */
export function isContractCallError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  // viem: ContractFunctionExecutionError, ContractFunctionRevertedError
  if (
    error.name === "ContractFunctionExecutionError" ||
    error.name === "ContractFunctionRevertedError"
  ) {
    return true;
  }
  // ethers: error.code === "CALL_EXCEPTION"
  if ("code" in error && error.code === "CALL_EXCEPTION") {
    return true;
  }
  // Fallback: common revert message patterns from various providers
  const msg = error.message.toLowerCase();
  return msg.includes("execution reverted") || msg.includes("call revert exception");
}

/** JSON-RPC error code providers use for rate limiting ("limit exceeded"). */
const JSON_RPC_LIMIT_EXCEEDED = -32005;

/** Properties that may nest a lower-level cause across viem / ethers / fetch. */
const NESTED_ERROR_KEYS = ["cause", "error", "info"] as const;

/**
 * Walk an error and its nested causes (`cause` / `error` / `info`, as used by
 * viem, ethers, and fetch wrappers), applying `predicate` to each object node.
 * Returns the first node for which `predicate` returns true, or `undefined`.
 * Depth-bounded to avoid pathological / cyclic structures.
 */
function findInErrorChain(
  error: unknown,
  predicate: (node: Record<string, unknown>) => boolean,
  depth = 6,
): Record<string, unknown> | undefined {
  if (depth < 0 || error === null || error === undefined || typeof error !== "object") {
    return undefined;
  }
  const node = error as Record<string, unknown>;
  if (predicate(node)) {
    return node;
  }
  for (const key of NESTED_ERROR_KEYS) {
    const next = node[key];
    if (next !== undefined && next !== null && typeof next === "object") {
      const found = findInErrorChain(next, predicate, depth - 1);
      if (found) {
        return found;
      }
    }
  }
  return undefined;
}

function nodeIsRpcRateLimit(node: Record<string, unknown>): boolean {
  // JSON-RPC "limit exceeded" code (Alchemy / Infura / others use -32005).
  if (node.code === JSON_RPC_LIMIT_EXCEEDED) {
    return true;
  }
  // HTTP 429 surfaced as a numeric status (viem HttpRequestError, relayer SDK cause).
  if (node.status === 429 || node.statusCode === 429) {
    return true;
  }
  // Message-based fallback for providers that don't expose a structured code.
  if (typeof node.message === "string") {
    const msg = node.message.toLowerCase();
    if (
      msg.includes("too many requests") ||
      msg.includes("rate limit") ||
      msg.includes("rate-limit") ||
      msg.includes("429")
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Returns true if the error (or any nested cause) originates from the relayer's
 * HTTP layer (the relayer SDK tags these with `code: "RELAYER_FETCH_ERROR"`).
 * Such errors — including the relayer's own 429 back-pressure — are the
 * relayer's domain ({@link RelayerRequestFailedError}), not the consumer's RPC
 * provider, so they must not be reclassified as {@link RpcRateLimitError}.
 */
function isRelayerFetchError(error: unknown): boolean {
  return findInErrorChain(error, (node) => node.code === "RELAYER_FETCH_ERROR") !== undefined;
}

/**
 * Returns true if the error (or any nested cause) is the **consumer's RPC
 * provider** rate-limiting / throttling an on-chain read — HTTP 429 or JSON-RPC
 * `-32005`. Relayer-originated rate-limits are excluded (see
 * {@link isRelayerFetchError}).
 *
 * Used to distinguish a transient RPC-endpoint problem from a genuine
 * decryption or entitlement failure. See {@link RpcRateLimitError}.
 */
export function isRpcRateLimitError(error: unknown): boolean {
  if (isRelayerFetchError(error)) {
    return false;
  }
  return findInErrorChain(error, nodeIsRpcRateLimit) !== undefined;
}

/** Structured classification of a worker-side error for the cross-thread protocol. */
export interface WorkerErrorClassification {
  /** HTTP status code, when available (e.g. relayer 4xx/5xx). */
  statusCode?: number;
  /** A {@link ZamaErrorCode} the main thread should rebuild into a typed error. */
  errorCode?: string;
  /** Suggested retry delay in milliseconds, when known. */
  retryAfter?: number;
}

/**
 * Classify an error at the worker source — where the full error object (codes,
 * causes) still exists — into the small set of fields that survive a
 * structured-clone across the worker boundary. The main thread uses these to
 * rebuild the correct typed error instead of only seeing a message string.
 */
export function classifyWorkerError(error: unknown): WorkerErrorClassification {
  if (isRpcRateLimitError(error)) {
    return { errorCode: ZamaErrorCode.RpcRateLimited, retryAfter: extractRetryAfterMs(error) };
  }
  const statusCode = extractHttpStatus(error);
  return statusCode !== undefined ? { statusCode } : {};
}

/**
 * Best-effort extraction of a `Retry-After` delay (in milliseconds) from a
 * provider error, when present. Returns `undefined` when no hint is available.
 */
export function extractRetryAfterMs(error: unknown): number | undefined {
  const node = findInErrorChain(error, (n) => {
    const v = n.retryAfter ?? n.retryAfterMs;
    return typeof v === "number" && Number.isFinite(v);
  });
  if (!node) {
    return undefined;
  }
  const ms = (node.retryAfterMs ?? node.retryAfter) as number;
  // Heuristic: bare `retryAfter` is conventionally seconds; `retryAfterMs` is ms.
  return node.retryAfterMs !== undefined ? ms : ms * 1000;
}

/**
 * Extract an HTTP status code from an error, if present.
 * Relayer SDK errors may carry a `status` or `statusCode` property.
 */
export function extractHttpStatus(error: unknown): number | undefined {
  if (error === null || error === undefined || typeof error !== "object") {
    return undefined;
  }
  const e = error as Record<string, unknown>;
  if (typeof e.statusCode === "number") {
    return e.statusCode;
  }
  if (typeof e.status === "number") {
    return e.status;
  }
  // Check nested cause
  if (e.cause !== null && e.cause !== undefined && typeof e.cause === "object") {
    const cause = e.cause as Record<string, unknown>;
    if (typeof cause.statusCode === "number") {
      return cause.statusCode;
    }
    if (typeof cause.status === "number") {
      return cause.status;
    }
  }
  return undefined;
}
