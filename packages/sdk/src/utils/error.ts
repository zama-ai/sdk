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

// ============================================================================
// Cross-thread serialization
// ============================================================================

/**
 * A plain, structured-clone-safe snapshot of an error and its cause chain.
 *
 * The worker boundary (`postMessage`) strips prototypes, `code`/`status`, and —
 * critically — the `cause` chain, leaving only the message. Decryption errors
 * are classified on the **main thread** ({@link wrapDecryptError}), so the worker
 * only needs to faithfully hand the error across the boundary, not understand it.
 * `serializeError` is that mechanical, taxonomy-agnostic envelope: it copies the
 * scalar signal fields the classifier keys on and flattens the nested cause chain
 * into a single `cause` link. {@link deserializeError} rebuilds an `Error` whose
 * `.cause` chain mirrors the original, so the existing chain-walking detectors
 * work on it unchanged.
 */
export interface SerializedError {
  name: string;
  message: string;
  /** e.g. JSON-RPC -32005, "RELAYER_FETCH_ERROR", ethers "CALL_EXCEPTION". */
  code?: string | number;
  /** viem-style HTTP status. */
  status?: number;
  /** relayer / node-fetch-style HTTP status. */
  statusCode?: number;
  retryAfter?: number;
  retryAfterMs?: number;
  cause?: SerializedError;
}

/** Scalar signal fields carried verbatim across the boundary, in both directions. */
const SERIALIZED_SCALAR_KEYS = [
  "code",
  "status",
  "statusCode",
  "retryAfter",
  "retryAfterMs",
] as const;

/**
 * Flatten an error (and its `cause` / `error` / `info` chain) into a
 * structured-clone-safe {@link SerializedError}. Depth-bounded to mirror
 * {@link findInErrorChain} and guard against cyclic structures.
 */
export function serializeError(error: unknown, depth = 6): SerializedError {
  const coerced = toError(error);
  const node =
    typeof error === "object" && error !== null
      ? (error as Record<string, unknown>)
      : (coerced as unknown as Record<string, unknown>);

  const serialized: SerializedError = { name: coerced.name, message: coerced.message };

  if (typeof node.code === "string" || typeof node.code === "number") {
    serialized.code = node.code;
  }
  if (typeof node.status === "number") {
    serialized.status = node.status;
  }
  if (typeof node.statusCode === "number") {
    serialized.statusCode = node.statusCode;
  }
  if (typeof node.retryAfter === "number") {
    serialized.retryAfter = node.retryAfter;
  }
  if (typeof node.retryAfterMs === "number") {
    serialized.retryAfterMs = node.retryAfterMs;
  }

  if (depth > 0) {
    for (const key of NESTED_ERROR_KEYS) {
      const next = node[key];
      if (next !== undefined && next !== null && typeof next === "object") {
        serialized.cause = serializeError(next, depth - 1);
        break;
      }
    }
  }

  return serialized;
}

/**
 * Rebuild a real {@link Error} from a {@link SerializedError}, re-attaching the
 * scalar signal fields and reconstructing the `.cause` chain so chain-walking
 * detectors ({@link findInErrorChain}, {@link extractHttpStatus},
 * {@link isRpcRateLimitError}) operate on it exactly as on the original.
 */
export function deserializeError(serialized: SerializedError): Error {
  const error = new Error(serialized.message) as Error & Record<string, unknown>;
  if (serialized.name) {
    error.name = serialized.name;
  }
  for (const key of SERIALIZED_SCALAR_KEYS) {
    const value = serialized[key];
    if (value !== undefined) {
      error[key] = value;
    }
  }
  if (serialized.cause) {
    error.cause = deserializeError(serialized.cause);
  }
  return error;
}

// ============================================================================
// Classification detectors (main-thread)
// ============================================================================

/**
 * Structured (unambiguous) consumer rate-limit signal: JSON-RPC -32005 or a
 * viem-style numeric `status: 429`. Deliberately NOT `statusCode: 429` — that is
 * the relayer / node-fetch HTTP shape, which stays {@link RelayerRequestFailedError}
 * (SDK-236), so a relayer 429 is never mistaken for a consumer-RPC throttle.
 */
function nodeHasStructuredRateLimit(node: Record<string, unknown>): boolean {
  return node.code === JSON_RPC_LIMIT_EXCEEDED || node.status === 429;
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
 * Like {@link isRpcRateLimitError} but only matches an unambiguous **structured**
 * signal (`-32005` or a viem `status: 429`), ignoring message text. The classifier
 * promotes this ahead of any HTTP status, while a message-only throttle is only
 * trusted when no status is present — so a relayer HTTP error whose body happens
 * to say "rate limit" still maps to {@link RelayerRequestFailedError}.
 */
export function hasStructuredRpcRateLimitSignal(error: unknown): boolean {
  if (isRelayerFetchError(error)) {
    return false;
  }
  return findInErrorChain(error, nodeHasStructuredRateLimit) !== undefined;
}

/**
 * The relayer SDK's ACL gate (`validateAclPermissions`) throws a message-only
 * Error when the actor isn't allowed: `User address <a> is not authorized to
 * user decrypt handle <h>!`. Matching it here, once, against the pinned
 * `@zama-fhe/relayer-sdk`, is what lets {@link wrapDecryptError} surface a typed
 * NotEntitledError (the "dapp contract … is not authorized" variant is a dapp
 * misconfig and is intentionally left to DecryptionFailedError).
 *
 * This is a deliberate bridge, not a destination: `@zama-fhe/relayer-sdk` ships
 * a typed `ACLUserDecryptionError`, but its active `userDecrypt` path still
 * throws a plain Error. TODO(SDK-239 follow-up): once the relayer surfaces the
 * typed/coded ACL error from that path, key off the code instead of the message
 * and drop this matcher. The `error.test.ts` guard reads the installed relayer
 * source and fails loudly if the message drifts before then.
 */
export function isNotEntitledMessage(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("user address") && m.includes("is not authorized to user decrypt");
}

/** Parse the on-chain handle out of the relayer's not-entitled message. */
export function parseHandleFromMessage(message: string): string | undefined {
  return /handle (0x[0-9a-fA-F]{64})/.exec(message)?.[1];
}

/**
 * Best-effort extraction of a `Retry-After` delay (in milliseconds) from a
 * provider error, when present. Returns `undefined` when no hint is available.
 */
export function extractRetryAfterMs(error: unknown): number | undefined {
  const node = findInErrorChain(error, (n) => {
    const v = n.retryAfter ?? n.retryAfterMs;
    // A non-positive hint (e.g. `retryAfter: 0` / `-1`) is meaningless as a
    // back-off delay and would make a consumer's `setTimeout(retry, …)` fire
    // immediately, so treat it as "no hint" (`undefined`) instead.
    return typeof v === "number" && Number.isFinite(v) && v > 0;
  });
  if (!node) {
    return undefined;
  }
  const ms = (node.retryAfterMs ?? node.retryAfter) as number;
  // Heuristic: bare `retryAfter` is conventionally seconds; `retryAfterMs` is ms.
  return node.retryAfterMs !== undefined ? ms : ms * 1000;
}

/**
 * Extract an HTTP status code from an error or anywhere in its cause chain.
 * Relayer SDK errors may carry a `status` or `statusCode` property; walking the
 * full chain (rather than just depth-1) keeps this in step with the other
 * chain-walking detectors and avoids a depth asymmetry between them.
 */
export function extractHttpStatus(error: unknown): number | undefined {
  const node = findInErrorChain(
    error,
    (n) => typeof n.statusCode === "number" || typeof n.status === "number",
  );
  if (!node) {
    return undefined;
  }
  return (typeof node.statusCode === "number" ? node.statusCode : node.status) as number;
}
