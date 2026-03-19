import { describe, it, expect } from "../../test-fixtures";
import {
  ZamaError,
  ZamaErrorCode,
  InvalidKeypairError,
  NoCiphertextError,
  RelayerRequestFailedError,
  SigningRejectedError,
  EncryptionFailedError,
  matchZamaError,
  SigningFailedError,
  wrapSigningError,
  DelegationSelfNotAllowedError,
  DelegationCooldownError,
  DelegationNotFoundError,
  DelegationExpiredError,
} from "../errors";

describe("InvalidKeypairError", () => {
  it("is instanceof ZamaError", () => {
    const err = new InvalidKeypairError("creds rejected");
    expect(err).toBeInstanceOf(ZamaError);
    expect(err).toBeInstanceOf(InvalidKeypairError);
  });

  it("has correct code and name", () => {
    const err = new InvalidKeypairError("creds rejected");
    expect(err.code).toBe(ZamaErrorCode.InvalidKeypair);
    expect(err.name).toBe("InvalidKeypairError");
    expect(err.message).toBe("creds rejected");
  });

  it("supports ErrorOptions cause", () => {
    const cause = new Error("upstream");
    const err = new InvalidKeypairError("creds rejected", { cause });
    expect(err.cause).toBe(cause);
  });
});

describe("NoCiphertextError", () => {
  it("is instanceof ZamaError", () => {
    const err = new NoCiphertextError("no ciphertext");
    expect(err).toBeInstanceOf(ZamaError);
    expect(err).toBeInstanceOf(NoCiphertextError);
  });

  it("has correct code and name", () => {
    const err = new NoCiphertextError("no ciphertext");
    expect(err.code).toBe(ZamaErrorCode.NoCiphertext);
    expect(err.name).toBe("NoCiphertextError");
  });
});

describe("RelayerRequestFailedError", () => {
  it("is instanceof ZamaError", () => {
    const err = new RelayerRequestFailedError("request failed", 500);
    expect(err).toBeInstanceOf(ZamaError);
    expect(err).toBeInstanceOf(RelayerRequestFailedError);
  });

  it("has correct code, name, and statusCode", () => {
    const err = new RelayerRequestFailedError("request failed", 502);
    expect(err.code).toBe(ZamaErrorCode.RelayerRequestFailed);
    expect(err.name).toBe("RelayerRequestFailedError");
    expect(err.statusCode).toBe(502);
  });

  it("statusCode is undefined when not provided", () => {
    const err = new RelayerRequestFailedError("request failed");
    expect(err.statusCode).toBeUndefined();
  });

  it("supports ErrorOptions cause", () => {
    const cause = new Error("upstream");
    const err = new RelayerRequestFailedError("request failed", 500, { cause });
    expect(err.cause).toBe(cause);
  });
});

describe("matchZamaError", () => {
  it("dispatches to the correct handler by error code", () => {
    const error = new SigningRejectedError("rejected");
    const result = matchZamaError(error, {
      SIGNING_REJECTED: (e) => `handled: ${e.message}`,
    });
    expect(result).toBe("handled: rejected");
  });

  it("falls through to wildcard when no specific handler matches", () => {
    const error = new EncryptionFailedError("failed");
    const result = matchZamaError(error, {
      SIGNING_REJECTED: () => "wrong",
      _: () => "wildcard",
    });
    expect(result).toBe("wildcard");
  });

  it("returns undefined for non-ZamaError without wildcard", () => {
    const error = new Error("random");
    const result = matchZamaError(error, {
      SIGNING_REJECTED: () => "wrong",
    });
    expect(result).toBeUndefined();
  });

  it("passes non-ZamaError to wildcard handler", () => {
    const error = new Error("random");
    const result = matchZamaError(error, {
      _: (e) => `caught: ${(e as Error).message}`,
    });
    expect(result).toBe("caught: random");
  });
});

// --- wrapSigningError ---

describe("wrapSigningError", () => {
  it("wraps Error as SigningRejectedError for code 4001", () => {
    const original = Object.assign(new Error("rejected"), { code: 4001 });
    expect(() => wrapSigningError(original, "test")).toThrow(
      expect.objectContaining({ code: "SIGNING_REJECTED", cause: original }),
    );
  });

  it("wraps Error as SigningFailedError for generic errors", () => {
    const original = new Error("network");
    expect(() => wrapSigningError(original, "test")).toThrow(
      expect.objectContaining({ code: "SIGNING_FAILED", cause: original }),
    );
  });

  it("includes original message in SigningRejectedError message", () => {
    const original = Object.assign(new Error("user denied"), { code: 4001 });
    expect(() => wrapSigningError(original, "ctx")).toThrow("ctx: user denied");
  });

  it("includes original message in SigningFailedError message", () => {
    const original = new Error("timeout");
    expect(() => wrapSigningError(original, "ctx")).toThrow("ctx: timeout");
  });

  it("stringifies non-Error values in the message", () => {
    expect(() => wrapSigningError("string error", "ctx")).toThrow("ctx: string error");
  });

  it("preserves non-Error cause instead of dropping it", () => {
    const stringError = "string error value";
    try {
      wrapSigningError(stringError, "test");
    } catch (err) {
      expect(err).toBeInstanceOf(SigningFailedError);
      // RED: currently `cause` is `undefined` because non-Error is dropped
      expect((err as SigningFailedError).cause).toBe(stringError);
    }
  });

  it("preserves object cause instead of dropping it", () => {
    const objError = { message: "something went wrong", code: 42 };
    try {
      wrapSigningError(objError, "test");
    } catch (err) {
      expect(err).toBeInstanceOf(SigningFailedError);
      // RED: currently `cause` is `undefined` because non-Error is dropped
      expect((err as SigningFailedError).cause).toBe(objError);
    }
  });
});

// --- Delegation errors ---

describe("DelegationSelfNotAllowedError", () => {
  it("is instanceof ZamaError", () => {
    const err = new DelegationSelfNotAllowedError("self");
    expect(err).toBeInstanceOf(ZamaError);
    expect(err).toBeInstanceOf(DelegationSelfNotAllowedError);
  });

  it("has correct code and name", () => {
    const err = new DelegationSelfNotAllowedError("self");
    expect(err.code).toBe(ZamaErrorCode.DelegationSelfNotAllowed);
    expect(err.name).toBe("DelegationSelfNotAllowedError");
    expect(err.message).toBe("self");
  });
});

describe("DelegationCooldownError", () => {
  it("is instanceof ZamaError", () => {
    const err = new DelegationCooldownError("cooldown");
    expect(err).toBeInstanceOf(ZamaError);
    expect(err).toBeInstanceOf(DelegationCooldownError);
  });

  it("has correct code and name", () => {
    const err = new DelegationCooldownError("cooldown");
    expect(err.code).toBe(ZamaErrorCode.DelegationCooldown);
    expect(err.name).toBe("DelegationCooldownError");
    expect(err.message).toBe("cooldown");
  });
});

describe("DelegationNotFoundError", () => {
  it("is instanceof ZamaError", () => {
    const err = new DelegationNotFoundError("not found");
    expect(err).toBeInstanceOf(ZamaError);
    expect(err).toBeInstanceOf(DelegationNotFoundError);
  });

  it("has correct code and name", () => {
    const err = new DelegationNotFoundError("not found");
    expect(err.code).toBe(ZamaErrorCode.DelegationNotFound);
    expect(err.name).toBe("DelegationNotFoundError");
    expect(err.message).toBe("not found");
  });
});

describe("DelegationExpiredError", () => {
  it("is instanceof ZamaError", () => {
    const err = new DelegationExpiredError("expired");
    expect(err).toBeInstanceOf(ZamaError);
    expect(err).toBeInstanceOf(DelegationExpiredError);
  });

  it("has correct code and name", () => {
    const err = new DelegationExpiredError("expired");
    expect(err.code).toBe(ZamaErrorCode.DelegationExpired);
    expect(err.name).toBe("DelegationExpiredError");
    expect(err.message).toBe("expired");
  });
});
