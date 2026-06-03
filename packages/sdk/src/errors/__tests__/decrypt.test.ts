import { describe, expect, test } from "../../test-fixtures";
import {
  DecryptionFailedError,
  DelegationNotPropagatedError,
  NoCiphertextError,
  RelayerRequestFailedError,
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
});
