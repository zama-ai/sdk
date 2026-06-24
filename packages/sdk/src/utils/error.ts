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

/** Structured (unambiguous) rate-limit signal: JSON-RPC -32005 or a numeric HTTP 429. */
function nodeHasStructuredRateLimit(node: Record<string, unknown>): boolean {
  return node.code === JSON_RPC_LIMIT_EXCEEDED || node.status === 429 || node.statusCode === 429;
}

function nodeIsRpcRateLimit(node: Record<string, unknown>): boolean {
  if (nodeHasStructuredRateLimit(node)) {
    return true;
  }
  // Message fallback for providers without a structured code. Deliberately
  // narrow (specific throttling phrases, no bare "429") to avoid false positives
  // that would turn a terminal error into a retryable one.
  if (typeof node.message === "string") {
    const msg = node.message.toLowerCase();
    return (
      msg.includes("too many requests") || msg.includes("rate limit") || msg.includes("rate-limit")
    );
  }
  return false;
}

/**
 * The relayer SDK tags its HTTP errors with `code: "RELAYER_FETCH_ERROR"`. These
 * stay the relayer's domain ({@link RelayerRequestFailedError} / SDK-236), never
 * {@link RpcRateLimitError}, even on a 429.
 */
function isRelayerFetchError(error: unknown): boolean {
  return findInErrorChain(error, (node) => node.code === "RELAYER_FETCH_ERROR") !== undefined;
}

/**
 * True if the error is the consumer's RPC provider throttling an on-chain read
 * (HTTP 429 / JSON-RPC -32005). Relayer-originated 429s are excluded.
 */
export function isRpcRateLimitError(error: unknown): boolean {
  if (isRelayerFetchError(error)) {
    return false;
  }
  return findInErrorChain(error, nodeIsRpcRateLimit) !== undefined;
}

/**
 * Like {@link isRpcRateLimitError} but only matches an unambiguous structured
 * signal (`-32005` or a numeric `status: 429`), ignoring message text. Used by
 * `wrapDecryptError` to promote a raw consumer 429 regardless of any HTTP status
 * it carries, while leaving worker-origin relayer errors (which carry a
 * top-level `statusCode`, not `status`) to the relayer branch.
 */
export function hasStructuredRpcRateLimitSignal(error: unknown): boolean {
  if (isRelayerFetchError(error)) {
    return false;
  }
  return (
    findInErrorChain(error, (n) => n.code === JSON_RPC_LIMIT_EXCEEDED || n.status === 429) !==
    undefined
  );
}

/** Structured classification of a worker-side error for the cross-thread protocol. */
export interface WorkerErrorClassification {
  /** HTTP status code, when available (e.g. relayer 4xx/5xx). */
  statusCode?: number;
  /** A {@link ZamaErrorCode} the main thread should rebuild into a typed error. */
  errorCode?: string;
  /** Suggested retry delay in milliseconds, when known. */
  retryAfter?: number;
  /** For `NOT_ENTITLED`: the handle/contract/account the rebuilt error carries. */
  handle?: string;
  contractAddress?: string;
  account?: string;
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
 * The relayer SDK's ACL gate (`validateAclPermissions`) throws a message-only
 * Error when the actor isn't allowed: `User address <a> is not authorized to
 * user decrypt handle <h>!`. Matching it here, once, against the pinned
 * `@zama-fhe/relayer-sdk`, is what lets us surface a typed NotEntitledError
 * (the "dapp contract … is not authorized" variant is a dapp misconfig and is
 * intentionally left to DecryptionFailedError).
 *
 * This is a deliberate bridge, not a destination: `@zama-fhe/relayer-sdk` ships
 * a typed `ACLUserDecryptionError`, but its active `userDecrypt` path still
 * throws a plain Error. TODO(SDK-239 follow-up): once the relayer surfaces the
 * typed/coded ACL error from that path, key off the code instead of the message
 * and drop this matcher. The `error.test.ts` guard reads the installed relayer
 * source and fails loudly if the message drifts before then.
 */
function isNotEntitledMessage(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("user address") && m.includes("is not authorized to user decrypt");
}

function parseHandleFromMessage(message: string): string | undefined {
  return /handle (0x[0-9a-fA-F]{64})/.exec(message)?.[1];
}

/**
 * Classify a decrypt-path worker error. Recognizes the relayer's not-entitled
 * failure (reusing its own authoritative ACL check — no extra on-chain reads)
 * and otherwise falls back to {@link classifyWorkerError} (rate-limit / status).
 * `ctx` supplies the contract/account for the rebuilt {@link NotEntitledError},
 * since the relayer message only carries the handle.
 */
export function classifyDecryptWorkerError(
  error: unknown,
  ctx: { contractAddress: string; account: string },
): WorkerErrorClassification {
  if (error instanceof Error && isNotEntitledMessage(error.message)) {
    return {
      errorCode: ZamaErrorCode.NotEntitled,
      handle: parseHandleFromMessage(error.message),
      contractAddress: ctx.contractAddress,
      account: ctx.account,
    };
  }
  return classifyWorkerError(error);
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
