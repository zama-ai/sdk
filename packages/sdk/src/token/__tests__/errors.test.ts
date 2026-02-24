import { describe, it, expect } from "vitest";
import {
  TokenError,
  TokenErrorCode,
  InvalidCredentialsError,
  NoCiphertextError,
  RelayerRequestFailedError,
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
