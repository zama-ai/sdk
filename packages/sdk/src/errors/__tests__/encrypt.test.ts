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
      expect(wrapEncryptError(original)).toBe(original);
    });

    test("returns the same RelayerRequestFailedError unchanged", () => {
      const original = new RelayerRequestFailedError("bad", 502);
      expect(wrapEncryptError(original)).toBe(original);
    });

    test("returns any other ZamaError unchanged", () => {
      const original = new ZamaError(ZamaErrorCode.EncryptionFailed, "already wrapped");
      expect(wrapEncryptError(original)).toBe(original);
    });
  });

  describe("HTTP status mapping surfaces the relayer/Cloudflare/Kong message", () => {
    test("403 preserves the code and the body message", () => {
      const relayerError = Object.assign(
        new Error("Input proof failed: relayer respond with HTTP code 403 Missing Zama API Key"),
        { statusCode: 403 },
      );
      const wrapped = wrapEncryptError(relayerError);
      expect(wrapped).toBeInstanceOf(RelayerRequestFailedError);
      expect((wrapped as RelayerRequestFailedError).statusCode).toBe(403);
      expect(wrapped.message).toMatch(/zama api key/i);
      expect((wrapped as { cause?: unknown }).cause).toBe(relayerError);
    });

    test("401 preserves the code and the body message", () => {
      const relayerError = Object.assign(new Error("Unauthorized, invalid Zama API Key."), {
        statusCode: 401,
      });
      const wrapped = wrapEncryptError(relayerError);
      expect(wrapped).toBeInstanceOf(RelayerRequestFailedError);
      expect((wrapped as RelayerRequestFailedError).statusCode).toBe(401);
    });
  });

  describe("fallback to EncryptionFailedError", () => {
    test("wraps an Error without statusCode as EncryptionFailedError", () => {
      const error = new Error("network down");
      const wrapped = wrapEncryptError(error);
      expect(wrapped).toBeInstanceOf(EncryptionFailedError);
      expect(wrapped.message).toBe("Encryption failed");
      expect((wrapped as { cause?: unknown }).cause).toBe(error);
    });

    test("wraps a non-Error rejection as EncryptionFailedError", () => {
      const wrapped = wrapEncryptError("string rejection");
      expect(wrapped).toBeInstanceOf(EncryptionFailedError);
      expect((wrapped as { cause?: unknown }).cause).toBe("string rejection");
    });
  });
});
