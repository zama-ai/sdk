import { describe, it, expect } from "vitest";
import {
  TokenError,
  TokenErrorCode,
  InvalidCredentialsError,
  NoCiphertextError,
  RelayerRequestFailedError,
  SigningRejectedError,
  EncryptionFailedError,
  matchTokenError,
} from "../errors";

describe("InvalidCredentialsError", () => {
  it("is instanceof TokenError", () => {
    const err = new InvalidCredentialsError("creds rejected");
    expect(err).toBeInstanceOf(TokenError);
    expect(err).toBeInstanceOf(InvalidCredentialsError);
  });

  it("has correct code and name", () => {
    const err = new InvalidCredentialsError("creds rejected");
    expect(err.code).toBe(TokenErrorCode.InvalidCredentials);
    expect(err.name).toBe("InvalidCredentialsError");
    expect(err.message).toBe("creds rejected");
  });

  it("supports ErrorOptions cause", () => {
    const cause = new Error("upstream");
    const err = new InvalidCredentialsError("creds rejected", { cause });
    expect(err.cause).toBe(cause);
  });
});

describe("NoCiphertextError", () => {
  it("is instanceof TokenError", () => {
    const err = new NoCiphertextError("no ciphertext");
    expect(err).toBeInstanceOf(TokenError);
    expect(err).toBeInstanceOf(NoCiphertextError);
  });

  it("has correct code and name", () => {
    const err = new NoCiphertextError("no ciphertext");
    expect(err.code).toBe(TokenErrorCode.NoCiphertext);
    expect(err.name).toBe("NoCiphertextError");
  });
});

describe("RelayerRequestFailedError", () => {
  it("is instanceof TokenError", () => {
    const err = new RelayerRequestFailedError("request failed", 500);
    expect(err).toBeInstanceOf(TokenError);
    expect(err).toBeInstanceOf(RelayerRequestFailedError);
  });

  it("has correct code, name, and statusCode", () => {
    const err = new RelayerRequestFailedError("request failed", 502);
    expect(err.code).toBe(TokenErrorCode.RelayerRequestFailed);
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

describe("matchTokenError", () => {
  it("dispatches to the correct handler by error code", () => {
    const error = new SigningRejectedError("rejected");
    const result = matchTokenError(error, {
      SIGNING_REJECTED: (e) => `handled: ${e.message}`,
    });
    expect(result).toBe("handled: rejected");
  });

  it("falls through to wildcard when no specific handler matches", () => {
    const error = new EncryptionFailedError("failed");
    const result = matchTokenError(error, {
      SIGNING_REJECTED: () => "wrong",
      _: () => "wildcard",
    });
    expect(result).toBe("wildcard");
  });

  it("returns undefined for non-TokenError without wildcard", () => {
    const error = new Error("random");
    const result = matchTokenError(error, {
      SIGNING_REJECTED: () => "wrong",
    });
    expect(result).toBeUndefined();
  });

  it("passes non-TokenError to wildcard handler", () => {
    const error = new Error("random");
    const result = matchTokenError(error, {
      _: (e) => `caught: ${(e as Error).message}`,
    });
    expect(result).toBe("caught: random");
  });
});
