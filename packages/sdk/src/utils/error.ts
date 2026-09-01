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
// Classification detectors
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
 * True when the failure is an `@fhevm/sdk` relayer *timeout* (`RelayerTimeoutError`,
 * thrown when a request exceeds the relayer's global deadline without a verdict).
 * Unlike a terminal 4xx/5xx, the operation itself is safe to retry, so callers map
 * it to a {@link RelayerRequestFailedError} with `retryable: true` — mirroring the
 * former `WorkerTimeoutError`, which was likewise documented retryable.
 */
export function isRelayerTimeoutError(error: unknown): boolean {
  return findInErrorChain(error, (node) => node.name === "RelayerTimeoutError") !== undefined;
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
 * The SDK's on-chain reads (the ACL `persistAllowed` pre-check) go through that
 * client, which already retries transport faults internally — so a failure
 * carrying one of these shapes must NOT be retried again by the SDK on top.
 */
function nodeHasConsumerRpcSignature(node: Record<string, unknown>): boolean {
  // ethers transient transport codes.
  const code = node.code;
  if (code === "NETWORK_ERROR" || code === "SERVER_ERROR" || code === "TIMEOUT") {
    return true;
  }
  // viem transport error classes, matched by `name`.
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

/**
 * `@fhevm/sdk`'s `verifyTkmsPublicKey` throws `invalid TransportKeyPairKeyPair`
 * when a stored transport key pair can't be re-derived under the current TKMS
 * version — the signal that the persisted key pair is stale (typically after a
 * KMS/TKMS rotation) and must be evicted and regenerated. Matching it lets the
 * signing and decrypt paths surface a typed {@link InvalidTransportKeyPairError}
 * and self-heal the vault entry.
 */
export function isInvalidTransportKeyPairMessage(message: string): boolean {
  return message.toLowerCase().includes("invalid transportkeypair");
}

/**
 * 4-byte selector of `InvalidKmsContext(uint256)`, the revert ProtocolConfig
 * raises when the KMS signers read resolves an unknown or revoked context.
 * The `error.test.ts` drift guard recomputes it from the Solidity signature.
 */
export const INVALID_KMS_CONTEXT_SELECTOR = "0x77ddbe81";

/** Revert-data fields across clients: viem's `raw`/`signature`, ethers' `data`. */
const REVERT_DATA_KEYS = ["data", "raw", "signature"] as const;

function nodeHasInvalidKmsContextRevert(node: Record<string, unknown>): boolean {
  for (const key of REVERT_DATA_KEYS) {
    const value = node[key];
    if (typeof value === "string" && value.toLowerCase().startsWith(INVALID_KMS_CONTEXT_SELECTOR)) {
      return true;
    }
  }
  // Text-only fallback for wrappers that stringify the revert instead of
  // carrying the data fields above.
  if (typeof node.message === "string") {
    const msg = node.message.toLowerCase();
    return msg.includes(INVALID_KMS_CONTEXT_SELECTOR) || msg.includes("invalidkmscontext");
  }
  return false;
}

/**
 * True when a failure is the on-chain KMS signers read reverting with
 * `InvalidKmsContext`: the permit's KMS context has been revoked (or never
 * existed), so every permit signed under it is permanently dead. The decrypt
 * path uses this to evict the permit and re-grant under the current context.
 *
 * The installed `@fhevm/sdk` performs that read without the error in its ABI,
 * so the revert arrives as raw data; the selector is matched anywhere in the
 * cause chain, with a message fallback for text-only providers.
 */
export function isRevokedKmsContextError(error: unknown): boolean {
  return findInErrorChain(error, nodeHasInvalidKmsContextRevert) !== undefined;
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
 * `Response` (the relayer's `cause.response.headers`). The SDK owns the
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
 * True for a well-formed server-driven retry delay, in seconds: a finite,
 * positive number. Shared by the chain-walking extractor below and the public
 * {@link retryAfterSeconds} accessor (`errors/base.ts`), so a malformed value
 * (`0`, negative, `NaN`) is rejected the same way everywhere instead of being
 * handed unchanged to a `setTimeout` backoff.
 */
export function isValidRetryAfterSeconds(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * A single node's server-driven retry delay (seconds): a numeric `retryAfter`
 * (a non-positive synthetic value is ignored), else a `Retry-After` header.
 */
function retryAfterFromNode(node: Record<string, unknown>): number | undefined {
  if (isValidRetryAfterSeconds(node.retryAfter)) {
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

/**
 * A JSON-RPC / EIP-1193 numeric error code (e.g. `4001` for user rejection, or a
 * wallet/provider code like `-32603`) found anywhere in a signing failure's cause
 * chain. Gives a signing error a structured, groupable field instead of leaving
 * the code buried in free-text `message` or an opaque nested `cause`.
 */
export function extractRpcErrorCode(error: unknown): number | undefined {
  const node = findInErrorChain(error, (n) => typeof n.code === "number");
  return node ? (node.code as number) : undefined;
}

/**
 * The `name` of the error class a signing failure was thrown as (e.g. viem's
 * `InvalidParamsRpcError`, an EIP-1193 `ProviderRpcError`) — a stable,
 * library-level classification an observability integration can group and alert
 * on. Deliberately reads only the top-level error, not the full cause chain: a
 * wallet's own internal error class name is inconsistent across wallets and
 * buried at an arbitrary depth, so it is not guessed at here — the full chain
 * remains available via the wrapped error's `cause` for manual inspection.
 */
export function extractWalletErrorName(error: unknown): string | undefined {
  return error instanceof Error && error.name !== "Error" ? error.name : undefined;
}
