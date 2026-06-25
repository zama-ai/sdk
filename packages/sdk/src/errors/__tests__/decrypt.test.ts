import { describe, expect, test } from "../../test-fixtures";
import {
  DecryptionFailedError,
  DelegationNotPropagatedError,
  NoCiphertextError,
  NotEntitledError,
  RelayerRequestFailedError,
  RpcRateLimitError,
  SigningFailedError,
  SigningRejectedError,
  ZamaError,
  ZamaErrorCode,
  wrapDecryptError,
} from "../index";

describe("wrapDecryptError", () => {
  describe("passthrough for already-typed SDK errors", () => {
    test("returns the same DecryptionFailedError unchanged", () => {
      const original = new DecryptionFailedError("boom");
      const wrapped = wrapDecryptError(original, "fallback");
      expect(wrapped).toBe(original);
    });

    test("returns the same NoCiphertextError unchanged", () => {
      const original = new NoCiphertextError("missing");
      expect(wrapDecryptError(original, "fallback")).toBe(original);
    });

    test("returns the same RelayerRequestFailedError unchanged", () => {
      const original = new RelayerRequestFailedError("bad", 502);
      expect(wrapDecryptError(original, "fallback")).toBe(original);
    });

    test("returns the same DelegationNotPropagatedError unchanged", () => {
      const original = new DelegationNotPropagatedError("propagating");
      expect(wrapDecryptError(original, "fallback", true)).toBe(original);
    });

    test("returns the same SigningRejectedError unchanged", () => {
      const original = new SigningRejectedError("user cancelled");
      expect(wrapDecryptError(original, "fallback")).toBe(original);
    });

    test("returns the same SigningFailedError unchanged", () => {
      const original = new SigningFailedError("bad signature");
      expect(wrapDecryptError(original, "fallback")).toBe(original);
    });
  });

  describe("HTTP status mapping", () => {
    test("maps statusCode 400 to NoCiphertextError preserving the message", () => {
      const error = Object.assign(new Error("no ciphertext for handle"), {
        statusCode: 400,
      });
      const wrapped = wrapDecryptError(error, "fallback");
      expect(wrapped).toBeInstanceOf(NoCiphertextError);
      expect(wrapped.message).toBe("no ciphertext for handle");
      expect((wrapped as { cause?: unknown }).cause).toBe(error);
    });

    test("maps statusCode 500 + isDelegated=true to DelegationNotPropagatedError", () => {
      const error = Object.assign(new Error("internal error"), {
        statusCode: 500,
      });
      const wrapped = wrapDecryptError(error, "fallback", true);
      expect(wrapped).toBeInstanceOf(DelegationNotPropagatedError);
      expect((wrapped as { cause?: unknown }).cause).toBe(error);
    });

    test("maps statusCode 500 + isDelegated=false to RelayerRequestFailedError", () => {
      const error = Object.assign(new Error("server error"), {
        statusCode: 500,
      });
      const wrapped = wrapDecryptError(error, "fallback", false);
      expect(wrapped).toBeInstanceOf(RelayerRequestFailedError);
      expect((wrapped as RelayerRequestFailedError).statusCode).toBe(500);
    });

    test("maps other HTTP status codes to RelayerRequestFailedError preserving the code", () => {
      const error = Object.assign(new Error("rate limited"), {
        statusCode: 429,
      });
      const wrapped = wrapDecryptError(error, "fallback");
      expect(wrapped).toBeInstanceOf(RelayerRequestFailedError);
      expect((wrapped as RelayerRequestFailedError).statusCode).toBe(429);
    });
  });

  describe("fallback to DecryptionFailedError", () => {
    test("wraps an Error without statusCode as DecryptionFailedError", () => {
      const error = new Error("network down");
      const wrapped = wrapDecryptError(error, "decryption failed");
      expect(wrapped).toBeInstanceOf(DecryptionFailedError);
      expect(wrapped.message).toBe("decryption failed");
      expect((wrapped as { cause?: unknown }).cause).toBe(error);
    });

    test("wraps a non-Error rejection as DecryptionFailedError", () => {
      const wrapped = wrapDecryptError("string rejection", "decryption failed");
      expect(wrapped).toBeInstanceOf(DecryptionFailedError);
      expect((wrapped as { cause?: unknown }).cause).toBe("string rejection");
    });

    test("returns a ZamaError instance for every branch", () => {
      const cases: unknown[] = [
        new Error("plain"),
        Object.assign(new Error("400"), { statusCode: 400 }),
        Object.assign(new Error("500"), { statusCode: 500 }),
        "not an error",
        null,
        undefined,
      ];
      for (const c of cases) {
        expect(wrapDecryptError(c, "fallback")).toBeInstanceOf(ZamaError);
      }
    });
  });

  describe("relayer auth errors surface the relayer/Cloudflare/Kong message", () => {
    test("403 without a numeric statusCode surfaces the body via cause", () => {
      const relayerError = new Error(
        "HTTP error! status: 403 Unauthorized. Missing or invalid Zama API Key",
      );
      const wrapped = wrapDecryptError(relayerError, "Public decryption failed");
      expect(wrapped).toBeInstanceOf(DecryptionFailedError);
      const cause = (wrapped as DecryptionFailedError).cause as Error;
      expect(cause.message).toMatch(/zama api key/i);
      expect(cause.message).not.toMatch(/unexpected response status/i);
    });

    test("403 with a numeric statusCode preserves the code and the body message", () => {
      const relayerError = Object.assign(
        new Error("This server requires a valid Zama API Key in the x-api-key header"),
        { statusCode: 403 },
      );
      const wrapped = wrapDecryptError(relayerError, "Public decryption failed");
      expect(wrapped).toBeInstanceOf(RelayerRequestFailedError);
      expect((wrapped as RelayerRequestFailedError).statusCode).toBe(403);
      expect(wrapped.message).toContain("x-api-key");
    });

    test("401 preserves the code and the body message", () => {
      const relayerError = Object.assign(
        new Error("Unauthorized, missing or invalid Zama API Key."),
        { statusCode: 401 },
      );
      const wrapped = wrapDecryptError(relayerError, "Public decryption failed");
      expect(wrapped).toBeInstanceOf(RelayerRequestFailedError);
      expect((wrapped as RelayerRequestFailedError).statusCode).toBe(401);
      expect(wrapped.message).toMatch(/zama api key/i);
    });
  });

  describe("not-entitled and RPC rate-limit causes (SDK-239)", () => {
    test("returns the same NotEntitledError unchanged", () => {
      const original = new NotEntitledError({
        encryptedValue: `0x${"12".repeat(32)}`,
        contractAddress: `0x${"20".repeat(20)}`,
        account: `0x${"10".repeat(20)}`,
      });
      expect(wrapDecryptError(original, "fallback")).toBe(original);
    });

    test("returns the same RpcRateLimitError unchanged", () => {
      const original = new RpcRateLimitError("throttled");
      expect(wrapDecryptError(original, "fallback")).toBe(original);
    });

    test("maps a worker-classified NOT_ENTITLED error to NotEntitledError with its fields", () => {
      // After the worker boundary, only message + attached fields survive.
      const workerError = Object.assign(new Error("not authorized"), {
        zamaErrorCode: ZamaErrorCode.NotEntitled,
        handle: `0x${"12".repeat(32)}`,
        contractAddress: "0xContract",
        account: "0xActor",
      });
      const wrapped = wrapDecryptError(workerError, "fallback");
      expect(wrapped).toBeInstanceOf(NotEntitledError);
      expect((wrapped as NotEntitledError).encryptedValue).toBe(`0x${"12".repeat(32)}`);
      expect((wrapped as NotEntitledError).contractAddress).toBe("0xContract");
      expect((wrapped as NotEntitledError).account).toBe("0xActor");
    });

    test("maps a worker-classified RPC_RATE_LIMITED error to RpcRateLimitError", () => {
      // The worker boundary strips the cause, leaving only message + zamaErrorCode + retryAfter.
      const workerError = Object.assign(new Error("Too Many Requests"), {
        zamaErrorCode: ZamaErrorCode.RpcRateLimited,
        retryAfter: 2000,
      });
      const wrapped = wrapDecryptError(workerError, "fallback");
      expect(wrapped).toBeInstanceOf(RpcRateLimitError);
      expect((wrapped as RpcRateLimitError).retryAfter).toBe(2000);
    });

    test("maps a raw JSON-RPC -32005 (no HTTP status) to RpcRateLimitError", () => {
      const rpcError = Object.assign(new Error("limit exceeded"), { code: -32005 });
      expect(wrapDecryptError(rpcError, "fallback")).toBeInstanceOf(RpcRateLimitError);
    });

    test("maps a status-bearing consumer 429 (viem `status`) to RpcRateLimitError", () => {
      // viem HttpRequestError carries `status: 429`; must not fall through to
      // RelayerRequestFailedError just because a status is present.
      const consumer429 = Object.assign(new Error("Too Many Requests"), { status: 429 });
      expect(wrapDecryptError(consumer429, "fallback")).toBeInstanceOf(RpcRateLimitError);
    });

    test("keeps a worker-origin relayer 429 (`statusCode`, no RELAYER tag) as RelayerRequestFailedError", () => {
      // After the worker boundary strips the cause, the relayer's 429 is a bare
      // Error with `statusCode` (not `status`) — it must stay a relayer error.
      const workerRelayer429 = Object.assign(new Error("Relayer rate limit exceeded"), {
        statusCode: 429,
      });
      const wrapped = wrapDecryptError(workerRelayer429, "fallback");
      expect(wrapped).toBeInstanceOf(RelayerRequestFailedError);
      expect((wrapped as RelayerRequestFailedError).statusCode).toBe(429);
    });

    test("keeps the relayer's own 429 (HTTP status present) as RelayerRequestFailedError", () => {
      const relayerError = Object.assign(new Error("Relayer rate limit exceeded"), {
        cause: { code: "RELAYER_FETCH_ERROR", status: 429 },
      });
      const wrapped = wrapDecryptError(relayerError, "fallback");
      expect(wrapped).toBeInstanceOf(RelayerRequestFailedError);
      expect((wrapped as RelayerRequestFailedError).statusCode).toBe(429);
    });
  });
});
