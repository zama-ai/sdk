import { describe, it, expect } from "vitest";
import {
  EncryptionFailed,
  DecryptionFailed,
  SigningRejected,
  SigningFailed,
  TransactionReverted,
  ApprovalFailed,
  RelayerRequestFailed,
  NoCiphertext,
  KeypairExpired,
  InvalidKeypair,
  ConfigurationFailed,
} from "../errors";

describe("Tagged Errors", () => {
  it("EncryptionFailed has correct _tag", () => {
    const error = new EncryptionFailed({ message: "boom" });
    expect(error._tag).toBe("EncryptionFailed");
    expect(error.message).toBe("boom");
  });

  it("DecryptionFailed has correct _tag", () => {
    const error = new DecryptionFailed({ message: "decrypt boom" });
    expect(error._tag).toBe("DecryptionFailed");
    expect(error.message).toBe("decrypt boom");
  });

  it("SigningRejected has correct _tag", () => {
    const error = new SigningRejected({ message: "user rejected" });
    expect(error._tag).toBe("SigningRejected");
  });

  it("SigningFailed has correct _tag", () => {
    const error = new SigningFailed({ message: "sign failed" });
    expect(error._tag).toBe("SigningFailed");
  });

  it("TransactionReverted has correct _tag", () => {
    const error = new TransactionReverted({ message: "reverted" });
    expect(error._tag).toBe("TransactionReverted");
  });

  it("ApprovalFailed has correct _tag", () => {
    const error = new ApprovalFailed({ message: "approval boom" });
    expect(error._tag).toBe("ApprovalFailed");
  });

  it("RelayerRequestFailed includes statusCode", () => {
    const error = new RelayerRequestFailed({ message: "502", statusCode: 502 });
    expect(error._tag).toBe("RelayerRequestFailed");
    expect(error.statusCode).toBe(502);
  });

  it("NoCiphertext has correct _tag", () => {
    const error = new NoCiphertext({ message: "no ct" });
    expect(error._tag).toBe("NoCiphertext");
  });

  it("KeypairExpired has correct _tag", () => {
    const error = new KeypairExpired({ message: "expired" });
    expect(error._tag).toBe("KeypairExpired");
  });

  it("InvalidKeypair has correct _tag", () => {
    const error = new InvalidKeypair({ message: "invalid" });
    expect(error._tag).toBe("InvalidKeypair");
  });

  it("ConfigurationFailed has correct _tag", () => {
    const error = new ConfigurationFailed({ message: "bad config" });
    expect(error._tag).toBe("ConfigurationFailed");
  });

  it("errors are instances of Error", () => {
    const error = new EncryptionFailed({ message: "boom" });
    expect(error).toBeInstanceOf(Error);
  });

  it("errors carry cause", () => {
    const cause = new Error("root");
    const error = new EncryptionFailed({ message: "boom", cause });
    expect(error.cause).toBe(cause);
  });
});
