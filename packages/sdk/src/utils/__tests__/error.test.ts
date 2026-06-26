import { describe, test, expect } from "../../test-fixtures";
import {
  toError,
  isContractCallError,
  extractHttpStatus,
  extractRetryAfterMs,
  parseRetryAfterHeader,
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

describe("parseRetryAfterHeader", () => {
  test("parses delta-seconds into milliseconds", () => {
    expect(parseRetryAfterHeader("120")).toBe(120_000);
  });

  test("treats 0 seconds as 0 ms (retry immediately)", () => {
    expect(parseRetryAfterHeader("0")).toBe(0);
  });

  test("parses a future HTTP-date as a positive delay", () => {
    const future = new Date(Date.now() + 10_000).toUTCString();
    const ms = parseRetryAfterHeader(future);
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(10_000);
  });

  test("floors a past HTTP-date to 0", () => {
    expect(parseRetryAfterHeader(new Date(Date.now() - 60_000).toUTCString())).toBe(0);
  });

  test("returns undefined for absent or unparseable values", () => {
    expect(parseRetryAfterHeader(null)).toBeUndefined();
    expect(parseRetryAfterHeader(undefined)).toBeUndefined();
    expect(parseRetryAfterHeader("")).toBeUndefined();
    expect(parseRetryAfterHeader("   ")).toBeUndefined();
    expect(parseRetryAfterHeader("soon")).toBeUndefined();
    expect(parseRetryAfterHeader("12.5")).toBeUndefined();
  });
});

describe("extractRetryAfterMs", () => {
  test("reads a numeric retryAfterMs normalized onto the error", () => {
    expect(extractRetryAfterMs(Object.assign(new Error("429"), { retryAfterMs: 2500 }))).toBe(2500);
  });

  test("reads retryAfterMs from the cause", () => {
    expect(extractRetryAfterMs(new Error("boom", { cause: { retryAfterMs: 1000 } }))).toBe(1000);
  });

  test("parses the Retry-After header on a raw relayer error (cause.response)", () => {
    // relayer-sdk throws `new Error(msg, { cause: { ..., response } })`
    const relayerError = new Error("Relayer rate limit exceeded", {
      cause: {
        code: "RELAYER_FETCH_ERROR",
        status: 429,
        response: new Response(null, {
          status: 429,
          headers: { "Retry-After": "30" },
        }),
      },
    });
    expect(extractRetryAfterMs(relayerError)).toBe(30_000);
  });

  test("prefers a normalized retryAfterMs over the cause's response header", () => {
    const error = Object.assign(
      new Error("boom", {
        cause: { response: new Response(null, { headers: { "Retry-After": "99" } }) },
      }),
      { retryAfterMs: 1500 },
    );
    expect(extractRetryAfterMs(error)).toBe(1500);
  });

  test("returns undefined when no retry signal is present", () => {
    expect(extractRetryAfterMs(new Error("plain"))).toBeUndefined();
    expect(
      extractRetryAfterMs(new Error("429 no header", { cause: { status: 429 } })),
    ).toBeUndefined();
  });

  test("returns undefined for non-object values", () => {
    expect(extractRetryAfterMs("string")).toBeUndefined();
    expect(extractRetryAfterMs(null)).toBeUndefined();
    expect(extractRetryAfterMs(undefined)).toBeUndefined();
  });
});
