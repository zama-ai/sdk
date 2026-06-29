import { HttpRequestError } from "viem";
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
      expect(wrapDecryptError(original, "fallback", { isDelegated: true })).toBe(original);
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
      const wrapped = wrapDecryptError(error, "fallback", { isDelegated: true });
      expect(wrapped).toBeInstanceOf(DelegationNotPropagatedError);
      expect((wrapped as { cause?: unknown }).cause).toBe(error);
    });

    test("maps statusCode 500 + isDelegated=false to RelayerRequestFailedError", () => {
      const error = Object.assign(new Error("server error"), {
        statusCode: 500,
      });
      const wrapped = wrapDecryptError(error, "fallback", { isDelegated: false });
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

    test("maps the relayer's not-entitled message to NotEntitledError, injecting ctx", () => {
      // The relayer throws a message-only Error; the message survives the worker
      // boundary, the handle is parsed from it, and contract/account are injected
      // from the request context the caller (decryption-service) holds.
      const relayerError = new Error(
        `User address 0xActor is not authorized to user decrypt handle 0x${"12".repeat(32)}!`,
      );
      const wrapped = wrapDecryptError(relayerError, "fallback", {
        contractAddress: "0xContract",
        account: "0xActor",
      });
      expect(wrapped).toBeInstanceOf(NotEntitledError);
      expect((wrapped as NotEntitledError).encryptedValue).toBe(`0x${"12".repeat(32)}`);
      expect((wrapped as NotEntitledError).contractAddress).toBe("0xContract");
      expect((wrapped as NotEntitledError).account).toBe("0xActor");
    });

    test("maps a rebuilt worker rate-limit (-32005 + retryAfter) to RpcRateLimitError", () => {
      // After deserializeError rebuilds the worker error, the structured signal
      // (-32005) and retryAfter are read directly — no separate worker taxonomy.
      const workerError = Object.assign(new Error("Too Many Requests"), {
        code: -32005,
        retryAfter: 2,
      });
      const wrapped = wrapDecryptError(workerError, "fallback");
      expect(wrapped).toBeInstanceOf(RpcRateLimitError);
      expect((wrapped as RpcRateLimitError).retryAfterMs).toBe(2000);
    });

    test("populates retryAfterMs from a real viem HttpRequestError's Retry-After header", () => {
      // The dominant real provider: a Cloudflare/edge 429 reaches us as a viem
      // HttpRequestError carrying `status: 429` + a `Retry-After` header (a
      // `Headers` object, never a numeric prop), nested under a higher cause.
      const httpError = new HttpRequestError({
        url: "https://rpc.example/eth",
        status: 429,
        headers: new Headers({ "Retry-After": "30" }),
        body: { error: "rate limited" },
      });
      const readError = Object.assign(new Error("eth_call failed"), { cause: httpError });
      const wrapped = wrapDecryptError(readError, "fallback");
      expect(wrapped).toBeInstanceOf(RpcRateLimitError);
      expect((wrapped as RpcRateLimitError).retryAfterMs).toBe(30_000);
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

    test("keeps a bare `statusCode: 429` (relayer/node-fetch shape) as RelayerRequestFailedError", () => {
      // `statusCode` (not viem's `status`) is the relayer HTTP shape and is
      // deliberately excluded from the consumer rate-limit signal.
      const relayer429 = Object.assign(new Error("Relayer rate limit exceeded"), {
        statusCode: 429,
      });
      const wrapped = wrapDecryptError(relayer429, "fallback");
      expect(wrapped).toBeInstanceOf(RelayerRequestFailedError);
      expect((wrapped as RelayerRequestFailedError).statusCode).toBe(429);
    });

    test("keeps the relayer's own 429 (RELAYER_FETCH_ERROR cause) as RelayerRequestFailedError", () => {
      // The cause chain (and its RELAYER_FETCH_ERROR tag) now survives the worker
      // boundary via serializeError, so this is the realistic worker-origin shape.
      const relayerError = Object.assign(new Error("Relayer rate limit exceeded"), {
        cause: { code: "RELAYER_FETCH_ERROR", status: 429 },
      });
      const wrapped = wrapDecryptError(relayerError, "fallback");
      expect(wrapped).toBeInstanceOf(RelayerRequestFailedError);
      expect((wrapped as RelayerRequestFailedError).statusCode).toBe(429);
    });

    test("surfaces relayer back-pressure: a 429 with Retry-After → retryable + retryAfterMs", () => {
      // The relayer's Cloudflare 429 carries `Retry-After` on `cause.response`.
      const relayer429 = Object.assign(new Error("Relayer rate limit exceeded"), {
        statusCode: 429,
        cause: {
          code: "RELAYER_FETCH_ERROR",
          response: { headers: new Headers({ "Retry-After": "300" }) },
        },
      });
      const wrapped = wrapDecryptError(relayer429, "fallback");
      expect(wrapped).toBeInstanceOf(RelayerRequestFailedError);
      expect((wrapped as RelayerRequestFailedError).retryable).toBe(true);
      expect((wrapped as RelayerRequestFailedError).retryAfterMs).toBe(300_000);
    });
  });
});
