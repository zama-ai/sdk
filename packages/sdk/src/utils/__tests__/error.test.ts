import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { describe, test, expect } from "../../test-fixtures";
import {
  toError,
  isContractCallError,
  extractHttpStatus,
  isRpcRateLimitError,
  hasStructuredRpcRateLimitSignal,
  extractRetryAfterMs,
  classifyWorkerError,
  classifyDecryptWorkerError,
  readWorkerClassification,
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

  test("does NOT match a top-level `statusCode: 429` (worker-origin relayer shape)", () => {
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

describe("readWorkerClassification", () => {
  test("rebuilds NOT_ENTITLED from the re-attached fields", () => {
    const err = Object.assign(new Error("x"), {
      zamaErrorCode: ZamaErrorCode.NotEntitled,
      handle: "0xhandle",
      contractAddress: "0xcontract",
      account: "0xactor",
    });
    expect(readWorkerClassification(err)).toEqual({
      errorCode: ZamaErrorCode.NotEntitled,
      handle: "0xhandle",
      contractAddress: "0xcontract",
      account: "0xactor",
    });
  });

  test("rebuilds RPC_RATE_LIMITED with retryAfter", () => {
    const err = Object.assign(new Error("x"), {
      zamaErrorCode: ZamaErrorCode.RpcRateLimited,
      retryAfter: 1500,
    });
    expect(readWorkerClassification(err)).toEqual({
      errorCode: ZamaErrorCode.RpcRateLimited,
      retryAfter: 1500,
    });
  });

  test("rebuilds a plain statusCode classification", () => {
    const err = Object.assign(new Error("x"), { statusCode: 500 });
    expect(readWorkerClassification(err)).toEqual({ statusCode: 500 });
  });

  test("returns undefined for an unclassified / non-object error", () => {
    expect(readWorkerClassification(new Error("raw"))).toBeUndefined();
    expect(readWorkerClassification("nope")).toBeUndefined();
  });
});

describe("classifyDecryptWorkerError", () => {
  const ctx = { contractAddress: "0xContract", account: "0xActor" };

  // Guard: this must stay in sync with @zama-fhe/relayer-sdk's validateAclPermissions
  // ("User address <a> is not authorized to user decrypt handle <h>!"). If a relayer
  // bump changes the wording, this test fails loudly and NOT_ENTITLED must be re-mapped.
  const RELAYER_NOT_ENTITLED_MSG = `User address 0x1000000000000000000000000000000000000001 is not authorized to user decrypt handle 0x${"12".repeat(32)}!`;

  test("maps the relayer's not-entitled message to NOT_ENTITLED with parsed handle + ctx", () => {
    expect(classifyDecryptWorkerError(new Error(RELAYER_NOT_ENTITLED_MSG), ctx)).toEqual({
      errorCode: ZamaErrorCode.NotEntitled,
      handle: `0x${"12".repeat(32)}`,
      contractAddress: "0xContract",
      account: "0xActor",
    });
  });

  test("does NOT map the 'dapp contract is not authorized' variant (stays a generic failure)", () => {
    const contractMsg = `dapp contract 0xabc is not authorized to user decrypt handle 0x${"34".repeat(32)}!`;
    expect(classifyDecryptWorkerError(new Error(contractMsg), ctx)).toEqual({});
  });

  test("falls back to rate-limit classification for a throttled read", () => {
    const rpc = Object.assign(new Error("Too Many Requests"), { code: -32005 });
    expect(classifyDecryptWorkerError(rpc, ctx)).toEqual({
      errorCode: ZamaErrorCode.RpcRateLimited,
      retryAfter: undefined,
    });
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
