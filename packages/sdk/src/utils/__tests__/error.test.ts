import { describe, test, expect } from "../../test-fixtures";
import {
  toError,
  isContractCallError,
  extractHttpStatus,
  isRpcRateLimitError,
  extractRetryAfterMs,
  classifyWorkerError,
} from "../error";
import { ZamaErrorCode } from "../../errors/base";

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
});

describe("classifyWorkerError", () => {
  test("classifies a consumer RPC rate-limit as RPC_RATE_LIMITED", () => {
    const err = Object.assign(new Error("Too Many Requests"), { code: -32005, retryAfter: 2 });
    expect(classifyWorkerError(err)).toEqual({
      errorCode: ZamaErrorCode.RpcRateLimited,
      retryAfter: 2000,
    });
  });

  test("classifies a relayer HTTP error as a statusCode (not rate-limit)", () => {
    const relayerError = Object.assign(new Error("Relayer rate limit exceeded"), {
      cause: { code: "RELAYER_FETCH_ERROR", status: 429 },
    });
    expect(classifyWorkerError(relayerError)).toEqual({ statusCode: 429 });
  });

  test("returns an empty classification for a plain error", () => {
    expect(classifyWorkerError(new Error("network down"))).toEqual({});
  });
});
