import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { describe, test, expect } from "../../test-fixtures";
import {
  toError,
  isContractCallError,
  extractHttpStatus,
  isRpcRateLimitError,
  hasStructuredRpcRateLimitSignal,
  isConsumerRpcError,
  isRetryableRelayerError,
  isNotEntitledMessage,
  parseHandleFromMessage,
  extractRetryAfter,
  parseRetryAfterHeader,
  serializeError,
  deserializeError,
} from "../error";

describe("toError", () => {
  test("returns the same Error instance", () => {
    const err = new Error("original");
    expect(toError(err)).toBe(err);
  });

  test("wraps a string as an Error", () => {
    const result = toError("string error");
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe("string error");
  });

  test("extracts message from object with message property", () => {
    const result = toError({ message: "User rejected", code: 4001 });
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe("User rejected");
  });

  test("handles undefined", () => {
    const result = toError(undefined);
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe("undefined");
  });

  test("handles null", () => {
    const result = toError(null);
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe("null");
  });

  test("handles a number", () => {
    const result = toError(42);
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe("42");
  });
});

describe("isContractCallError", () => {
  test("detects viem ContractFunctionExecutionError", () => {
    const err = new Error("contract call failed");
    err.name = "ContractFunctionExecutionError";
    expect(isContractCallError(err)).toBe(true);
  });

  test("detects viem ContractFunctionRevertedError", () => {
    const err = new Error("contract reverted");
    err.name = "ContractFunctionRevertedError";
    expect(isContractCallError(err)).toBe(true);
  });

  test("detects ethers CALL_EXCEPTION", () => {
    const err = Object.assign(new Error("call exception"), { code: "CALL_EXCEPTION" });
    expect(isContractCallError(err)).toBe(true);
  });

  test("detects execution reverted message", () => {
    expect(isContractCallError(new Error("execution reverted"))).toBe(true);
  });

  test("detects ethers call revert exception message", () => {
    expect(isContractCallError(new Error("call revert exception"))).toBe(true);
  });

  test("returns false for unrelated errors containing 'revert'", () => {
    expect(isContractCallError(new Error("Failed to revert local state"))).toBe(false);
    expect(isContractCallError(new Error("Please revert your changes"))).toBe(false);
  });

  test("returns false for non-CALL_EXCEPTION ethers error codes", () => {
    expect(
      isContractCallError(Object.assign(new Error("server error"), { code: "SERVER_ERROR" })),
    ).toBe(false);
    expect(
      isContractCallError(Object.assign(new Error("network error"), { code: "NETWORK_ERROR" })),
    ).toBe(false);
  });

  test("returns false for network errors", () => {
    expect(isContractCallError(new Error("fetch failed"))).toBe(false);
    expect(isContractCallError(new Error("connection refused"))).toBe(false);
    expect(isContractCallError(new Error("timeout"))).toBe(false);
  });

  test("returns false for non-Error values", () => {
    expect(isContractCallError("string")).toBe(false);
    expect(isContractCallError(null)).toBe(false);
    expect(isContractCallError(undefined)).toBe(false);
  });
});

describe("extractHttpStatus", () => {
  test("reads a top-level statusCode", () => {
    expect(extractHttpStatus(Object.assign(new Error("nope"), { statusCode: 403 }))).toBe(403);
  });

  test("reads a top-level status", () => {
    expect(extractHttpStatus(Object.assign(new Error("nope"), { status: 401 }))).toBe(401);
  });

  test("reads cause.status (the relayer SDK shape)", () => {
    // relayer-sdk throws `new Error(message, { cause: { code, status, ... } })`
    const relayerError = Object.assign(
      new Error("Public decrypt failed: relayer respond with HTTP code 403"),
      { cause: { code: "RELAYER_FETCH_ERROR", status: 403 } },
    );
    expect(extractHttpStatus(relayerError)).toBe(403);
  });

  test("reads cause.statusCode", () => {
    const error = Object.assign(new Error("boom"), { cause: { statusCode: 429 } });
    expect(extractHttpStatus(error)).toBe(429);
  });

  test("prefers a top-level statusCode over the cause", () => {
    const error = Object.assign(new Error("boom"), { cause: { status: 500 }, statusCode: 403 });
    expect(extractHttpStatus(error)).toBe(403);
  });

  test("returns undefined when no numeric status is present", () => {
    expect(extractHttpStatus(new Error("plain"))).toBeUndefined();
    expect(
      extractHttpStatus(
        Object.assign(new Error("with string status"), { cause: { status: "403" } }),
      ),
    ).toBeUndefined();
  });

  test("returns undefined for non-object values", () => {
    expect(extractHttpStatus("string")).toBeUndefined();
    expect(extractHttpStatus(null)).toBeUndefined();
    expect(extractHttpStatus(undefined)).toBeUndefined();
    expect(extractHttpStatus(403)).toBeUndefined();
  });
});

describe("isRpcRateLimitError", () => {
  test("detects JSON-RPC -32005 at the top level", () => {
    expect(isRpcRateLimitError(Object.assign(new Error("limit"), { code: -32005 }))).toBe(true);
  });

  test("detects -32005 nested in an ethers-style info.error chain", () => {
    const err = Object.assign(new Error("could not coalesce error"), {
      code: "SERVER_ERROR",
      info: { error: { code: -32005, message: "Too Many Requests" } },
    });
    expect(isRpcRateLimitError(err)).toBe(true);
  });

  test("detects HTTP 429 on a nested cause", () => {
    const err = Object.assign(new Error("rpc failed"), { cause: { status: 429 } });
    expect(isRpcRateLimitError(err)).toBe(true);
  });

  test("detects a 'Too Many Requests' message", () => {
    expect(isRpcRateLimitError(new Error("HTTP request failed: Too Many Requests"))).toBe(true);
  });

  test("does not match a bare '429' substring in an unrelated message", () => {
    expect(isRpcRateLimitError(new Error("transferred 4290 wei (id 429001)"))).toBe(false);
  });

  test("excludes the relayer's own rate-limit (RELAYER_FETCH_ERROR)", () => {
    const relayerError = Object.assign(new Error("Relayer rate limit exceeded"), {
      cause: { code: "RELAYER_FETCH_ERROR", status: 429 },
    });
    expect(isRpcRateLimitError(relayerError)).toBe(false);
  });

  test("returns false for unrelated errors and non-objects", () => {
    expect(isRpcRateLimitError(new Error("network down"))).toBe(false);
    expect(isRpcRateLimitError(Object.assign(new Error("boom"), { status: 500 }))).toBe(false);
    expect(isRpcRateLimitError(null)).toBe(false);
    expect(isRpcRateLimitError("429")).toBe(false);
  });
});

describe("hasStructuredRpcRateLimitSignal", () => {
  test("matches -32005 and a viem-style `status: 429`", () => {
    expect(hasStructuredRpcRateLimitSignal(Object.assign(new Error("x"), { code: -32005 }))).toBe(
      true,
    );
    expect(hasStructuredRpcRateLimitSignal(Object.assign(new Error("x"), { status: 429 }))).toBe(
      true,
    );
  });

  test("matches a viem JSON-RPC `code: 429` (its own shouldRetry shape)", () => {
    expect(hasStructuredRpcRateLimitSignal(Object.assign(new Error("x"), { code: 429 }))).toBe(
      true,
    );
  });

  test("matches an ethers 429: `code: SERVER_ERROR` + string `info.responseStatus`", () => {
    // ethers carries the status only in info.responseStatus (a string), with no
    // numeric top-level status — the leading code must be parsed out of it.
    const ethers429 = Object.assign(new Error("server response error"), {
      code: "SERVER_ERROR",
      info: { responseStatus: "429 Too Many Requests" },
    });
    expect(hasStructuredRpcRateLimitSignal(ethers429)).toBe(true);
  });

  test("does NOT match a non-429 ethers `info.responseStatus` (e.g. 500)", () => {
    const ethers500 = Object.assign(new Error("server response error"), {
      code: "SERVER_ERROR",
      info: { responseStatus: "500 Internal Server Error" },
    });
    expect(hasStructuredRpcRateLimitSignal(ethers500)).toBe(false);
  });

  test("does NOT match a bare `statusCode: 429` (relayer / node-fetch shape)", () => {
    expect(
      hasStructuredRpcRateLimitSignal(
        Object.assign(new Error("Relayer rate limit"), { statusCode: 429 }),
      ),
    ).toBe(false);
  });

  test("does NOT match a message-only throttle (no structured signal)", () => {
    expect(hasStructuredRpcRateLimitSignal(new Error("Too Many Requests"))).toBe(false);
  });

  test("excludes relayer-tagged errors even with status 429", () => {
    expect(
      hasStructuredRpcRateLimitSignal(
        Object.assign(new Error("x"), { cause: { code: "RELAYER_FETCH_ERROR", status: 429 } }),
      ),
    ).toBe(false);
  });
});

describe("isConsumerRpcError", () => {
  test("detects ethers transport codes (NETWORK_ERROR / SERVER_ERROR / TIMEOUT)", () => {
    for (const code of ["NETWORK_ERROR", "SERVER_ERROR", "TIMEOUT"]) {
      expect(isConsumerRpcError(Object.assign(new Error("boom"), { code }))).toBe(true);
    }
  });

  test("detects viem transport error classes by name", () => {
    for (const name of ["HttpRequestError", "RpcRequestError", "TimeoutError"]) {
      const err = new Error("boom");
      err.name = name;
      expect(isConsumerRpcError(err)).toBe(true);
    }
  });

  test("detects a structured consumer rate-limit (-32005 / status 429)", () => {
    expect(isConsumerRpcError(Object.assign(new Error("x"), { code: -32005 }))).toBe(true);
    expect(isConsumerRpcError(Object.assign(new Error("x"), { status: 429 }))).toBe(true);
  });

  test("a relayer HTTP error is NOT consumer-RPC", () => {
    const relayer = Object.assign(new Error("relayer respond with HTTP code 503"), {
      cause: { code: "RELAYER_FETCH_ERROR", status: 503 },
    });
    expect(isConsumerRpcError(relayer)).toBe(false);
  });

  test("a bare network error with no provider signature is NOT consumer-RPC", () => {
    expect(isConsumerRpcError(new Error("fetch failed"))).toBe(false);
  });
});

describe("isRetryableRelayerError", () => {
  test("retries a relayer gateway transient (RELAYER_FETCH_ERROR 502/503/504)", () => {
    for (const status of [502, 503, 504]) {
      const err = Object.assign(new Error(`relayer respond with HTTP code ${status}`), {
        cause: { code: "RELAYER_FETCH_ERROR", status },
      });
      expect(isRetryableRelayerError(err)).toBe(true);
    }
  });

  test("does NOT retry a relayer 500 (terminal) or 429 (back-pressure, surfaced)", () => {
    const e500 = Object.assign(new Error("relayer respond with HTTP code 500"), {
      cause: { code: "RELAYER_FETCH_ERROR", status: 500 },
    });
    const e429 = Object.assign(new Error("Relayer rate limit exceeded"), {
      cause: { code: "RELAYER_FETCH_ERROR", status: 429 },
    });
    expect(isRetryableRelayerError(e500)).toBe(false);
    expect(isRetryableRelayerError(e429)).toBe(false);
  });

  test("retries a relayer-boundary network failure (no consumer-RPC signature)", () => {
    expect(isRetryableRelayerError(new Error("fetch failed"))).toBe(true);
    expect(isRetryableRelayerError(new Error("socket hang up"))).toBe(true);
    expect(isRetryableRelayerError(new Error("read ECONNRESET"))).toBe(true);
  });

  test("does NOT retry a consumer-RPC transport fault (deferred to viem/ethers)", () => {
    // ethers network error and viem TimeoutError both bubble up from the worker's
    // ACL read — already retried by the integrator's client.
    const ethersNet = Object.assign(new Error("fetch failed"), { code: "NETWORK_ERROR" });
    const viemTimeout = Object.assign(new Error("The request timed out."), {
      name: "TimeoutError",
    });
    expect(isRetryableRelayerError(ethersNet)).toBe(false);
    expect(isRetryableRelayerError(viemTimeout)).toBe(false);
  });

  test("does NOT retry a bare timeout (owned by viem/ethers + the worker timeout)", () => {
    expect(isRetryableRelayerError(new Error("Request timed out after 30000ms"))).toBe(false);
  });

  test("does NOT retry a terminal not-entitled error or a non-Error", () => {
    expect(
      isRetryableRelayerError(
        new Error("User address 0x1 is not authorized to user decrypt handle 0x2"),
      ),
    ).toBe(false);
    expect(isRetryableRelayerError("fetch failed")).toBe(false);
    expect(isRetryableRelayerError(null)).toBe(false);
  });
});

describe("extractRetryAfter", () => {
  test("reads retryAfter (seconds) from the error", () => {
    expect(extractRetryAfter(Object.assign(new Error("x"), { retryAfter: 3 }))).toBe(3);
  });

  test("reads retryAfter from a nested cause", () => {
    expect(extractRetryAfter({ cause: { retryAfter: 30 } })).toBe(30);
  });

  test("returns undefined when absent", () => {
    expect(extractRetryAfter(new Error("x"))).toBeUndefined();
  });

  test("ignores a non-positive retryAfter hint", () => {
    // `0` / negative is meaningless as a back-off delay (a consumer's
    // `setTimeout(retry, …)` would fire immediately), so treat it as "no hint".
    expect(extractRetryAfter(Object.assign(new Error("x"), { retryAfter: 0 }))).toBeUndefined();
    expect(extractRetryAfter(Object.assign(new Error("x"), { retryAfter: -1 }))).toBeUndefined();
    expect(extractRetryAfter({ cause: { retryAfter: -500 } })).toBeUndefined();
  });

  test("does NOT read a `Retry-After` header off viem's chain-side `HttpRequestError.headers`", () => {
    // Chain-RPC backoff is owned by the consumer's viem/ethers transport (it
    // honors Retry-After and retries before the error surfaces), so the SDK does
    // not re-read the chain-side header — only the relayer's response header.
    const viemLike = Object.assign(new Error("HTTP 429"), {
      status: 429,
      headers: new Headers({ "Retry-After": "120" }),
    });
    expect(extractRetryAfter(viemLike)).toBeUndefined();
  });

  test("parses a `Retry-After` header off a relayer error's `cause.response.headers`", () => {
    const relayerLike = Object.assign(new Error("relayer 429"), {
      cause: { response: { headers: new Headers({ "Retry-After": "5" }) } },
    });
    expect(extractRetryAfter(relayerLike)).toBe(5);
  });

  test("prefers a numeric retryAfter over a deeper header", () => {
    const err = Object.assign(new Error("x"), {
      retryAfter: 10,
      cause: { response: { headers: new Headers({ "Retry-After": "120" }) } },
    });
    expect(extractRetryAfter(err)).toBe(10);
  });
});

describe("parseRetryAfterHeader", () => {
  test("parses delta-seconds (returns seconds)", () => {
    expect(parseRetryAfterHeader("120")).toBe(120);
  });

  test("treats 0 seconds as 0 (retry immediately)", () => {
    expect(parseRetryAfterHeader("0")).toBe(0);
  });

  test("parses a future HTTP-date as a positive delay in seconds", () => {
    const future = new Date(Date.now() + 60_000).toUTCString();
    const seconds = parseRetryAfterHeader(future);
    expect(seconds).toBeGreaterThan(0);
    expect(seconds).toBeLessThanOrEqual(60);
  });

  test("floors a past HTTP-date to 0", () => {
    expect(parseRetryAfterHeader("Wed, 21 Oct 2015 07:28:00 GMT")).toBe(0);
  });

  test("returns undefined for absent or unparseable values", () => {
    expect(parseRetryAfterHeader(null)).toBeUndefined();
    expect(parseRetryAfterHeader(undefined)).toBeUndefined();
    expect(parseRetryAfterHeader("")).toBeUndefined();
    expect(parseRetryAfterHeader("not-a-date")).toBeUndefined();
  });
});

describe("serializeError / deserializeError", () => {
  test("round-trips message, name, and the scalar signal fields", () => {
    const err = Object.assign(new Error("boom"), {
      name: "WeirdError",
      code: -32005,
      status: 429,
      statusCode: 503,
      retryAfter: 2,
    });
    const rebuilt = deserializeError(serializeError(err)) as Error & Record<string, unknown>;
    expect(rebuilt).toBeInstanceOf(Error);
    expect(rebuilt.message).toBe("boom");
    expect(rebuilt.name).toBe("WeirdError");
    expect(rebuilt.code).toBe(-32005);
    expect(rebuilt.status).toBe(429);
    expect(rebuilt.statusCode).toBe(503);
    expect(rebuilt.retryAfter).toBe(2);
  });

  test("captures a `Retry-After` header into a numeric retryAfter (seconds) so it survives the boundary", () => {
    // The header lives on a non-cloneable `Headers`; serializeError must parse it
    // at the source, else the relayer/consumer back-off is lost across the worker.
    const relayer429 = Object.assign(new Error("relayer 429"), {
      statusCode: 429,
      cause: { response: { headers: new Headers({ "Retry-After": "300" }) } },
    });
    const rebuilt = deserializeError(serializeError(relayer429));
    expect(extractRetryAfter(rebuilt)).toBe(300);
  });

  test("round-trips an ethers 429 whose status lives only in info.responseStatus", () => {
    // The worker's relayer-sdk read (persistAllowed) goes through ethers; an
    // edge/Cloudflare 429 surfaces as `code: "SERVER_ERROR"` + a *string*
    // `info.responseStatus`. Structured clone drops the nested `info`, so
    // without lifting it the round-tripped error loses the rate-limit signal and
    // wrapDecryptError mis-classifies it as terminal DecryptionFailedError.
    const ethers429 = Object.assign(new Error("could not coalesce error"), {
      code: "SERVER_ERROR",
      info: { responseStatus: "429 Too Many Requests" },
    });
    // Same verdict directly and after the worker round-trip (the invariant).
    expect(isRpcRateLimitError(ethers429)).toBe(true);
    expect(hasStructuredRpcRateLimitSignal(ethers429)).toBe(true);
    const rebuilt = deserializeError(serializeError(ethers429));
    expect(isRpcRateLimitError(rebuilt)).toBe(true);
    expect(hasStructuredRpcRateLimitSignal(rebuilt)).toBe(true);
  });

  test("does not invent a rate-limit for a non-429 ethers info.responseStatus", () => {
    // A 503 must stay non-rate-limit after the round-trip too — parsing the
    // status to a numeric `status` would have diverged here; preserving the
    // string keeps direct and round-tripped classification identical.
    const ethers503 = Object.assign(new Error("bad gateway"), {
      code: "SERVER_ERROR",
      info: { responseStatus: "503 Service Unavailable" },
    });
    const rebuilt = deserializeError(serializeError(ethers503));
    expect(hasStructuredRpcRateLimitSignal(rebuilt)).toBe(
      hasStructuredRpcRateLimitSignal(ethers503),
    );
    expect(hasStructuredRpcRateLimitSignal(rebuilt)).toBe(false);
    expect(extractHttpStatus(rebuilt)).toBeUndefined();
  });

  test("keeps a signal carried on a later branch than the first (walks all links)", () => {
    // ethers puts the underlying fault on `error` (walked first) and the HTTP
    // status on `info` — dropping every branch but the first would lose the 429.
    const err = Object.assign(new Error("server response"), {
      code: "SERVER_ERROR",
      error: new Error("underlying transport"),
      info: { responseStatus: "429 Too Many Requests" },
    });
    const rebuilt = deserializeError(serializeError(err));
    expect(hasStructuredRpcRateLimitSignal(rebuilt)).toBe(true);
  });

  test("preserves the cause chain so chain-walking detectors keep working", () => {
    // ethers-style nested provider error: structured clone would drop the chain.
    const err = Object.assign(new Error("could not coalesce error"), {
      code: "SERVER_ERROR",
      info: { error: { code: -32005, message: "Too Many Requests" } },
    });
    const rebuilt = deserializeError(serializeError(err));
    // `info` is normalized to `cause`, but the signal is still reachable.
    expect(isRpcRateLimitError(rebuilt)).toBe(true);
  });

  test("preserves a relayer RELAYER_FETCH_ERROR cause (stays excluded from rate-limit)", () => {
    const relayerError = Object.assign(new Error("relayer responded with HTTP 429"), {
      cause: { code: "RELAYER_FETCH_ERROR", status: 429 },
    });
    const rebuilt = deserializeError(serializeError(relayerError));
    expect(isRpcRateLimitError(rebuilt)).toBe(false);
    expect(extractHttpStatus(rebuilt)).toBe(429);
  });

  test("is depth-bounded and does not throw on deep/cyclic chains", () => {
    const cyclic = new Error("loop") as Error & { cause?: unknown };
    cyclic.cause = cyclic;
    expect(() => serializeError(cyclic)).not.toThrow();
  });

  test("coerces a non-Error value", () => {
    const serialized = serializeError("plain string");
    expect(serialized.message).toBe("plain string");
    expect(deserializeError(serialized).message).toBe("plain string");
  });
});

describe("isNotEntitledMessage / parseHandleFromMessage", () => {
  // Must stay in sync with @zama-fhe/relayer-sdk's validateAclPermissions
  // ("User address <a> is not authorized to user decrypt handle <h>!").
  const RELAYER_NOT_ENTITLED_MSG = `User address 0x1000000000000000000000000000000000000001 is not authorized to user decrypt handle 0x${"12".repeat(32)}!`;

  test("matches the relayer's actor-not-entitled message and parses the handle", () => {
    expect(isNotEntitledMessage(RELAYER_NOT_ENTITLED_MSG)).toBe(true);
    expect(parseHandleFromMessage(RELAYER_NOT_ENTITLED_MSG)).toBe(`0x${"12".repeat(32)}`);
  });

  test("does NOT match the 'dapp contract is not authorized' variant", () => {
    const contractMsg = `dapp contract 0xabc is not authorized to user decrypt handle 0x${"34".repeat(32)}!`;
    expect(isNotEntitledMessage(contractMsg)).toBe(false);
  });

  // Drift guard wired to the REAL dependency (not a hand-copied constant): if a
  // @zama-fhe/relayer-sdk bump rewords its not-entitled message, the phrase
  // isNotEntitledMessage keys on disappears here and this fails loudly — otherwise
  // NOT_ENTITLED would silently downgrade to DECRYPTION_FAILED (the SDK-239 bug).
  test("the installed @zama-fhe/relayer-sdk still emits the message our matcher keys on", () => {
    const require = createRequire(import.meta.url);
    const source = readFileSync(require.resolve("@zama-fhe/relayer-sdk/node"), "utf8");
    // Assert the actor lead-in and the discriminating phrase are ADJACENT (only the
    // interpolated address between them). Two independent substring checks would
    // stay green off the relayer's sibling "dapp contract … is not authorized to
    // user decrypt" message even if the actor message were reworded.
    expect(source).toMatch(/User address[^\n]{0,160}is not authorized to user decrypt handle/);
  });

  // RELAYER_FETCH_ERROR is the *sole* discriminator keeping the relayer's own 429
  // (its message literally contains "rate limit") out of the retryable
  // RpcRateLimitError. If a relayer bump renames it, the throttle flips to
  // retryable and consumer retry loops amplify it — guard against that drift.
  test("the installed @zama-fhe/relayer-sdk still tags its HTTP errors with RELAYER_FETCH_ERROR", () => {
    const require = createRequire(import.meta.url);
    const source = readFileSync(require.resolve("@zama-fhe/relayer-sdk/node"), "utf8");
    expect(source).toContain("RELAYER_FETCH_ERROR");
  });

  // The drift guards above read the *Node* build, but the browser worker
  // `importScripts` the CDN UMD bundle pinned by `RELAYER_SDK_VERSION`. Asserting
  // the pin matches the installed npm version keeps those Node-read guards
  // meaningful for the browser path; a CDN message reword *within* the same
  // version still can't be caught offline — gate `RELAYER_SDK_VERSION` bumps on
  // re-validating the matcher.
  test("the worker's pinned CDN relayer version matches the installed npm package", () => {
    const require = createRequire(import.meta.url);
    const installed = (require("@zama-fhe/relayer-sdk/package.json") as { version: string })
      .version;
    const relayerWeb = readFileSync(
      new URL("../../relayer/relayer-web.ts", import.meta.url),
      "utf8",
    );
    const pinned = /RELAYER_SDK_VERSION = "([^"]+)"/.exec(relayerWeb)?.[1];
    expect(pinned).toBe(installed);
  });
});
