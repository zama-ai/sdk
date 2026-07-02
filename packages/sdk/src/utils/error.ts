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
  /** e.g. JSON-RPC -32005, ethers "CALL_EXCEPTION". */
  code?: string | number;
  /** viem-style HTTP status. */
  status?: number;
  /** relayer / node-fetch-style HTTP status. */
  statusCode?: number;
  /** Server-driven retry delay in **seconds** (numeric prop or parsed `Retry-After`). */
  retryAfter?: number;
  /**
   * ethers surfaces an HTTP status only as a string on `info.responseStatus`
   * (e.g. `"429 Too Many Requests"`), not as a numeric `status`. It lives on a
   * nested `info` object the flattening would otherwise skip, so it is lifted
   * onto the envelope and rebuilt onto `error.info.responseStatus`, letting the
   * ethers rate-limit detector classify a worker-origin 429 exactly as it would
   * the same error on the main thread.
   */
  responseStatus?: string;
  cause?: SerializedError;
}

/** Scalar signal fields carried verbatim across the boundary, in both directions. */
const SERIALIZED_SCALAR_KEYS = ["code", "status", "statusCode", "retryAfter"] as const;

/**
 * ethers reports its HTTP status only as a string on `info.responseStatus`
 * (e.g. `"429 Too Many Requests"`). Read it directly off the node — not via the
 * cause-chain flattening, which descends a single branch — so it survives even
 * when the error also carries an `error` link that would be walked first.
 */
function responseStatusFromNode(node: Record<string, unknown>): string | undefined {
  const info = node.info;
  if (info !== null && typeof info === "object") {
    const responseStatus = (info as Record<string, unknown>).responseStatus;
    if (typeof responseStatus === "string") {
      return responseStatus;
    }
  }
  return undefined;
}

/**
 * Copy the scalar signal fields the classifier keys on from a raw error node
 * onto the envelope, only where not already set — so a shallower node keeps
 * priority. Also lifts ethers' string `info.responseStatus` and the relayer's
 * `Retry-After` header (both destroyed by structured clone: the header lives on
 * a non-cloneable `Headers`, the status on a nested `info` the flattening skips).
 */
function captureNodeSignals(node: Record<string, unknown>, into: SerializedError): void {
  if (into.code === undefined && (typeof node.code === "string" || typeof node.code === "number")) {
    into.code = node.code;
  }
  if (into.status === undefined && typeof node.status === "number") {
    into.status = node.status;
  }
  if (into.statusCode === undefined && typeof node.statusCode === "number") {
    into.statusCode = node.statusCode;
  }
  if (into.responseStatus === undefined) {
    const responseStatus = responseStatusFromNode(node);
    if (responseStatus !== undefined) {
      into.responseStatus = responseStatus;
    }
  }
  if (into.retryAfter === undefined) {
    if (typeof node.retryAfter === "number") {
      into.retryAfter = node.retryAfter;
    } else {
      const fromHeader = retryAfterFromHeader(node);
      if (fromHeader !== undefined) {
        into.retryAfter = fromHeader;
      }
    }
  }
}

/** Lift any still-missing scalar signal from an already-serialized child up. */
function hoistMissingSignals(from: SerializedError, into: SerializedError): void {
  if (into.code === undefined && from.code !== undefined) {
    into.code = from.code;
  }
  if (into.status === undefined && from.status !== undefined) {
    into.status = from.status;
  }
  if (into.statusCode === undefined && from.statusCode !== undefined) {
    into.statusCode = from.statusCode;
  }
  if (into.responseStatus === undefined && from.responseStatus !== undefined) {
    into.responseStatus = from.responseStatus;
  }
  if (into.retryAfter === undefined && from.retryAfter !== undefined) {
    into.retryAfter = from.retryAfter;
  }
}

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
  captureNodeSignals(node, serialized);

  if (depth > 0) {
    // Walk *every* nested link (`cause` / `error` / `info`), not just the first
    // present one: an error commonly carries several (ethers puts the underlying
    // fault on `error` and the HTTP status on `info`), and the signal-bearing
    // branch is not always the first. Keep the first as the representative
    // `.cause` for message/chain fidelity, and lift any still-missing scalar
    // signal off the others so none is dropped.
    for (const key of NESTED_ERROR_KEYS) {
      const next = node[key];
      if (next !== undefined && next !== null && typeof next === "object") {
        const child = serializeError(next, depth - 1);
        if (serialized.cause === undefined) {
          serialized.cause = child;
        }
        hoistMissingSignals(child, serialized);
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
  // Rebuild ethers' `info.responseStatus` on the same node as its `code`, so the
  // ethers rate-limit detector (`code: "SERVER_ERROR"` + `info.responseStatus`)
  // matches the round-tripped error exactly as it would the original.
  if (serialized.responseStatus !== undefined) {
    error.info = { responseStatus: serialized.responseStatus };
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
 * Structured (unambiguous) consumer rate-limit signal across the RPC providers
 * the SDK reads through:
 * - JSON-RPC `-32005` ("limit exceeded");
 * - viem-style numeric `status: 429`, and viem's own `shouldRetry` shape where
 *   the JSON-RPC error `code` is `429`;
 * - ethers' 429, which surfaces as `code: "SERVER_ERROR"` with the status only
 *   in `info.responseStatus` (a string like `"429 Too Many Requests"`) and no
 *   numeric top-level status — the leading code is parsed out of it.
 *
 * Deliberately NOT `statusCode: 429` — that is the relayer / node-fetch HTTP
 * shape, which stays {@link RelayerRequestFailedError} (SDK-236), so a relayer
 * 429 is never mistaken for a consumer-RPC throttle.
 */
function nodeHasStructuredRateLimit(node: Record<string, unknown>): boolean {
  if (node.code === JSON_RPC_LIMIT_EXCEEDED || node.status === 429 || node.code === 429) {
    return true;
  }
  // ethers: `code: "SERVER_ERROR"`, status lives in `info.responseStatus`.
  if (node.code === "SERVER_ERROR" && typeof node.info === "object" && node.info !== null) {
    const responseStatus = (node.info as Record<string, unknown>).responseStatus;
    if (typeof responseStatus === "string" && /^\s*429\b/.test(responseStatus)) {
      return true;
    }
  }
  return false;
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
 * True when a failure originates from `@fhevm/sdk`'s relayer transport. Every
 * relayer error it throws — `RelayerResponseStatusError`, `RelayerResponseApiError`,
 * `RelayerMaxRetryError`, `RelayerTimeoutError`, … — carries the `Relayer` `name`
 * prefix. Such errors stay the relayer's domain ({@link RelayerRequestFailedError}
 * / SDK-236), never {@link RpcRateLimitError}, even on a 429 (which `@fhevm/sdk`
 * retries internally, honoring `Retry-After`, before surfacing).
 */
export function isRelayerError(error: unknown): boolean {
  return (
    findInErrorChain(
      error,
      (node) => typeof node.name === "string" && node.name.startsWith("Relayer"),
    ) !== undefined
  );
}

/**
 * True if the error is the consumer's RPC provider throttling an on-chain read
 * (HTTP 429 / JSON-RPC -32005). Relayer-originated 429s are excluded.
 */
export function isRpcRateLimitError(error: unknown): boolean {
  if (isRelayerError(error)) {
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
  if (isRelayerError(error)) {
    return false;
  }
  return findInErrorChain(error, nodeHasStructuredRateLimit) !== undefined;
}

/**
 * Transport-error signatures of the consumer's own RPC client (viem / ethers).
 * The worker's on-chain reads (the ACL `persistAllowed` pre-check) go through
 * that client, which already retries transport faults internally — so a failure
 * carrying one of these shapes must NOT be retried again by the SDK on top.
 */
function nodeHasConsumerRpcSignature(node: Record<string, unknown>): boolean {
  // ethers transient transport codes.
  const code = node.code;
  if (code === "NETWORK_ERROR" || code === "SERVER_ERROR" || code === "TIMEOUT") {
    return true;
  }
  // viem transport error classes (the `name` survives the worker boundary).
  const name = node.name;
  return (
    name === "HttpRequestError" ||
    name === "RpcRequestError" ||
    name === "TimeoutError" ||
    name === "WebSocketRequestError"
  );
}

/**
 * True when a failure originates from the **consumer's RPC provider** (viem /
 * ethers) rather than the relayer. Keeps the SDK's relayer retry from
 * double-retrying transport faults the integrator's client already retried.
 * A relayer error (`Relayer*`) is never consumer-RPC.
 */
export function isConsumerRpcError(error: unknown): boolean {
  if (isRelayerError(error)) {
    return false;
  }
  if (hasStructuredRpcRateLimitSignal(error)) {
    return true;
  }
  return findInErrorChain(error, nodeHasConsumerRpcSignature) !== undefined;
}

/**
 * `@fhevm/sdk`'s ACL gate (`checkPersistAllowed`) throws an `AclUserDecryptionError`
 * when the requesting actor isn't allowed: `User <a> is not authorized to decrypt
 * handle <h>!`. Matching that phrase is what lets {@link wrapDecryptError} surface
 * a typed NotEntitledError with the parsed handle.
 *
 * Deliberately excludes the sibling `Dapp contract <a> is not authorized to
 * **user** decrypt handle <h>!` — a dapp ACL misconfig, intentionally left to
 * DecryptionFailedError. The differentiator is the inserted "user": the actor
 * message reads "…to decrypt handle", the dapp message "…to user decrypt handle",
 * so keying on "is not authorized to decrypt handle" matches only the former.
 *
 * The `error.test.ts` drift guard reads the installed `@fhevm/sdk` source and
 * fails loudly if the message is reworded.
 */
export function isNotEntitledMessage(message: string): boolean {
  return message.toLowerCase().includes("is not authorized to decrypt handle");
}

/** Parse the on-chain handle out of the not-entitled message. */
export function parseHandleFromMessage(message: string): string | undefined {
  return /handle (0x[0-9a-fA-F]{64})/.exec(message)?.[1];
}

/**
 * Parse an HTTP `Retry-After` header value into **seconds** (the SDK's duration
 * unit and the header's own unit), or `undefined` when absent/unparseable. Per
 * RFC 9110 the value is either a non-negative number of seconds (`"120"`) or an
 * HTTP-date; a past date floors to `0`.
 */
export function parseRetryAfterHeader(value: string | null | undefined): number | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed === "") {
    return undefined;
  }
  // delta-seconds: a non-negative integer (already the unit we want).
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed);
  }
  // HTTP-date — an IMF-fixdate always carries alphabetic day/month names, so
  // require a letter before deferring to the lenient Date.parse.
  if (/[a-zA-Z]/.test(trimmed)) {
    const dateMs = Date.parse(trimmed);
    if (!Number.isNaN(dateMs)) {
      return Math.max(0, Math.round((dateMs - Date.now()) / 1000));
    }
  }
  return undefined;
}

/** Read a `Retry-After` header (→ seconds) off a `Headers`-like object, if present. */
function readRetryAfterHeader(headers: unknown): number | undefined {
  if (headers === null || typeof headers !== "object") {
    return undefined;
  }
  const get = (headers as { get?: unknown }).get;
  if (typeof get !== "function") {
    return undefined;
  }
  return parseRetryAfterHeader(
    (get as (name: string) => string | null).call(headers, "Retry-After"),
  );
}

/**
 * A node's **relayer** `Retry-After` header (seconds), read from a wrapped fetch
 * `Response` (the relayer SDK's `cause.response.headers`). The SDK owns the
 * relayer fetch, so parsing the header there is legitimate.
 *
 * The viem/chain side (`HttpRequestError.headers`) is deliberately **not** read:
 * for consumer RPC the integrator's viem/ethers transport already honors
 * `Retry-After` in its own retry loop (and retries) before the error ever
 * surfaces, so re-reading it here would re-implement a transport concern.
 * Chain-RPC backoff is configured on the consumer's transport (`chain.network`).
 */
function retryAfterFromHeader(node: Record<string, unknown>): number | undefined {
  const response = node.response;
  if (response !== null && typeof response === "object") {
    return readRetryAfterHeader((response as Record<string, unknown>).headers);
  }
  return undefined;
}

/**
 * A single node's server-driven retry delay (seconds): a numeric `retryAfter`
 * (a non-positive synthetic value is ignored), else a `Retry-After` header.
 */
function retryAfterFromNode(node: Record<string, unknown>): number | undefined {
  if (
    typeof node.retryAfter === "number" &&
    Number.isFinite(node.retryAfter) &&
    node.retryAfter > 0
  ) {
    return node.retryAfter;
  }
  return retryAfterFromHeader(node);
}

/**
 * Best-effort extraction of a server-driven retry delay, in **seconds**, from
 * anywhere in an error's cause chain. Reads a numeric `retryAfter` property and
 * the **relayer's** `Retry-After` header (`cause.response.headers`). The
 * consumer-RPC/chain side is intentionally not read — viem/ethers own that
 * backoff (see {@link retryAfterFromHeader}). `undefined` when absent.
 */
export function extractRetryAfter(error: unknown): number | undefined {
  const node = findInErrorChain(error, (n) => retryAfterFromNode(n) !== undefined);
  return node ? retryAfterFromNode(node) : undefined;
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
