import { describe, expect, test } from "../../test-fixtures";
import {
  EncryptionFailedError,
  RelayerRequestFailedError,
  ZamaError,
  ZamaErrorCode,
  wrapEncryptError,
} from "../index";

describe("wrapEncryptError", () => {
  describe("passthrough for already-typed SDK errors", () => {
    test("returns the same EncryptionFailedError unchanged", () => {
      const original = new EncryptionFailedError("boom");
      expect(wrapEncryptError(original, "Encryption failed")).toBe(original);
    });

    test("returns the same RelayerRequestFailedError unchanged", () => {
      const original = new RelayerRequestFailedError("bad", 502);
      expect(wrapEncryptError(original, "Encryption failed")).toBe(original);
    });

    test("returns any other ZamaError unchanged", () => {
      const original = new ZamaError(ZamaErrorCode.EncryptionFailed, "already wrapped");
      expect(wrapEncryptError(original, "Encryption failed")).toBe(original);
    });
  });

  describe("HTTP status mapping surfaces the relayer/Cloudflare/Kong message", () => {
    test("403 preserves the code and the body message", () => {
      const relayerError = Object.assign(
        new Error("Input proof failed: relayer respond with HTTP code 403 Missing Zama API Key"),
        { statusCode: 403 },
      );
      const wrapped = wrapEncryptError(relayerError, "Encryption failed");
      expect(wrapped).toBeInstanceOf(RelayerRequestFailedError);
      expect((wrapped as RelayerRequestFailedError).statusCode).toBe(403);
      expect(wrapped.message).toMatch(/zama api key/i);
      expect((wrapped as { cause?: unknown }).cause).toBe(relayerError);
    });

    test("401 preserves the code and the body message", () => {
      const relayerError = Object.assign(new Error("Unauthorized, invalid Zama API Key."), {
        statusCode: 401,
      });
      const wrapped = wrapEncryptError(relayerError, "Encryption failed");
      expect(wrapped).toBeInstanceOf(RelayerRequestFailedError);
      expect((wrapped as RelayerRequestFailedError).statusCode).toBe(401);
    });
  });

  describe("relayer timeout is retryable", () => {
    test("maps an @fhevm/sdk RelayerTimeoutError (no status) to a retryable RelayerRequestFailedError", () => {
      // A timeout during encryption carries no HTTP status but is safe to retry;
      // it must surface as a retryable RelayerRequestFailedError rather than a
      // terminal EncryptionFailedError (which has no retryable signal at all).
      const timeout = Object.assign(new Error("Relayer request timed out"), {
        name: "RelayerTimeoutError",
      });
      const wrapped = wrapEncryptError(timeout, "Encryption failed");
      expect(wrapped).toBeInstanceOf(RelayerRequestFailedError);
      expect((wrapped as RelayerRequestFailedError).statusCode).toBeUndefined();
      expect((wrapped as RelayerRequestFailedError).retryable).toBe(true);
    });
  });

  describe("relayer transport errors", () => {
    test("maps an @fhevm/sdk RelayerFetchError without a status to RelayerRequestFailedError", () => {
      const relayerError = Object.assign(new Error("fetch failed"), { name: "RelayerFetchError" });

      const wrapped = wrapEncryptError(relayerError, "Encryption failed");

      expect(wrapped).toBeInstanceOf(RelayerRequestFailedError);
      expect((wrapped as RelayerRequestFailedError).statusCode).toBeUndefined();
      expect(wrapped.message).toBe("fetch failed");
    });
  });

  describe("fallback to EncryptionFailedError", () => {
    test("wraps an Error without statusCode as EncryptionFailedError using the fallback message", () => {
      const error = new Error("network down");
      const wrapped = wrapEncryptError(error, "Custom encrypt fallback");
      expect(wrapped).toBeInstanceOf(EncryptionFailedError);
      expect(wrapped.message).toBe("Custom encrypt fallback");
      expect((wrapped as { cause?: unknown }).cause).toBe(error);
    });

    test("wraps a non-Error rejection as EncryptionFailedError", () => {
      const wrapped = wrapEncryptError("string rejection", "Encryption failed");
      expect(wrapped).toBeInstanceOf(EncryptionFailedError);
      expect((wrapped as { cause?: unknown }).cause).toBe("string rejection");
    });
  });
});
