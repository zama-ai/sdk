import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { describe, test, expect } from "../../test-fixtures";
import {
  toError,
  isContractCallError,
  extractHttpStatus,
  isRpcRateLimitError,
  hasStructuredRpcRateLimitSignal,
  isNotEntitledMessage,
  parseHandleFromMessage,
  extractRetryAfterMs,
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
    const err = Object.assign(new Error("call exception"), {
      code: "CALL_EXCEPTION",
    });
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
    const error = Object.assign(new Error("boom"), {
      cause: { status: 500 },
      statusCode: 403,
    });
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

describe("extractRetryAfterMs", () => {
  test("reads a seconds-based retryAfter and converts to ms", () => {
    expect(extractRetryAfterMs(Object.assign(new Error("x"), { retryAfter: 3 }))).toBe(3000);
  });

  test("reads a millisecond retryAfterMs as-is from a nested cause", () => {
    expect(extractRetryAfterMs({ cause: { retryAfterMs: 1500 } })).toBe(1500);
  });

  test("returns undefined when absent", () => {
    expect(extractRetryAfterMs(new Error("x"))).toBeUndefined();
  });

  test("ignores a non-positive retryAfter hint", () => {
    // `0` / negative is meaningless as a back-off delay (a consumer's
    // `setTimeout(retry, …)` would fire immediately), so treat it as "no hint".
    expect(extractRetryAfterMs(Object.assign(new Error("x"), { retryAfter: 0 }))).toBeUndefined();
    expect(extractRetryAfterMs(Object.assign(new Error("x"), { retryAfter: -1 }))).toBeUndefined();
    expect(extractRetryAfterMs({ cause: { retryAfterMs: -500 } })).toBeUndefined();
  });

  test("parses a `Retry-After` header off viem's `HttpRequestError.headers`", () => {
    // viem delivers the back-off only on a `Headers` object, never a numeric prop.
    const viemLike = Object.assign(new Error("HTTP 429"), {
      status: 429,
      headers: new Headers({ "Retry-After": "120" }),
    });
    expect(extractRetryAfterMs(viemLike)).toBe(120_000);
  });

  test("parses a `Retry-After` header off a relayer error's `cause.response.headers`", () => {
    const relayerLike = Object.assign(new Error("relayer 429"), {
      cause: { response: { headers: new Headers({ "Retry-After": "5" }) } },
    });
    expect(extractRetryAfterMs(relayerLike)).toBe(5000);
  });

  test("prefers a numeric retryAfterMs over a deeper header", () => {
    const err = Object.assign(new Error("x"), {
      retryAfterMs: 1000,
      cause: { response: { headers: new Headers({ "Retry-After": "120" }) } },
    });
    expect(extractRetryAfterMs(err)).toBe(1000);
  });
});

describe("parseRetryAfterHeader", () => {
  test("parses delta-seconds into milliseconds", () => {
    expect(parseRetryAfterHeader("120")).toBe(120_000);
  });

  test("treats 0 seconds as 0 ms (retry immediately)", () => {
    expect(parseRetryAfterHeader("0")).toBe(0);
  });

  test("parses a future HTTP-date as a positive delay", () => {
    const future = new Date(Date.now() + 60_000).toUTCString();
    const ms = parseRetryAfterHeader(future);
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(60_000);
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

  test("captures a `Retry-After` header into a numeric retryAfterMs so it survives the boundary", () => {
    // The header lives on a non-cloneable `Headers`; serializeError must parse it
    // at the source, else the relayer/consumer back-off is lost across the worker.
    const relayer429 = Object.assign(new Error("relayer 429"), {
      statusCode: 429,
      cause: { response: { headers: new Headers({ "Retry-After": "300" }) } },
    });
    const rebuilt = deserializeError(serializeError(relayer429));
    expect(extractRetryAfterMs(rebuilt)).toBe(300_000);
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
  // @zama-fhe/relayer-sdk bump reworks its not-entitled message, the substrings
  // isNotEntitledMessage keys on disappear here and this fails loudly — otherwise
  // NOT_ENTITLED would silently downgrade to DECRYPTION_FAILED (the SDK-239 bug).
  test("the installed @zama-fhe/relayer-sdk still emits the message our matcher keys on", () => {
    const require = createRequire(import.meta.url);
    const source = readFileSync(require.resolve("@zama-fhe/relayer-sdk/node"), "utf8");
    expect(source).toContain("is not authorized to user decrypt");
    expect(source.toLowerCase()).toContain("user address");
  });
});
