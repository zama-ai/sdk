import { describe, it, expect } from "../test-fixtures";
import { ReadonlyToken } from "../token/readonly-token";
import { Token } from "../token/token";
import { SignerRequiredError, ZamaErrorCode } from "../errors";
import type { Address } from "viem";

describe("ZamaSDK without signer", () => {
  it("constructs with signer omitted", ({ createSDK }) => {
    const sdk = createSDK({ signer: undefined });
    expect(sdk.signer).toBeUndefined();
  });

  it("validates keypairTTL even when signer is omitted", ({ createSDK }) => {
    expect(() => createSDK({ signer: undefined, keypairTTL: 0 })).toThrow(
      "keypairTTL must be a positive integer number of seconds",
    );
    expect(() => createSDK({ signer: undefined, keypairTTL: NaN })).toThrow(
      "keypairTTL must be a positive integer number of seconds",
    );
  });

  it("does not subscribe to signer lifecycle", ({ createSDK, provider }) => {
    createSDK({ signer: undefined });
    expect(provider.getChainId).not.toHaveBeenCalled();
  });

  it("createReadonlyToken works with no signer", ({ createSDK, tokenAddress }) => {
    const sdk = createSDK({ signer: undefined });
    const token = sdk.createReadonlyToken(tokenAddress);
    expect(token).toBeInstanceOf(ReadonlyToken);
    expect(token.address).toBe(tokenAddress);
  });

  it("createToken works with no signer (Token guards per-method)", ({
    createSDK,
    tokenAddress,
  }) => {
    const sdk = createSDK({ signer: undefined });
    const token = sdk.createToken(tokenAddress);
    expect(token).toBeInstanceOf(Token);
    expect(token.address).toBe(tokenAddress);
  });

  it("publicDecrypt works with no signer", async ({ createSDK, relayer }) => {
    const sdk = createSDK({ signer: undefined });
    await sdk.publicDecrypt(["0xhandle"]);
    expect(relayer.publicDecrypt).toHaveBeenCalled();
  });

  describe("requireSigner", () => {
    it("requireSigner throws SignerRequiredError with operation", ({ createSDK }) => {
      const sdk = createSDK({ signer: undefined });
      expect(() => sdk.requireSigner("myOp")).toThrow(SignerRequiredError);
      try {
        sdk.requireSigner("myOp");
      } catch (err) {
        expect(err).toBeInstanceOf(SignerRequiredError);
        expect((err as SignerRequiredError).operation).toBe("myOp");
        expect((err as SignerRequiredError).code).toBe(ZamaErrorCode.SignerRequired);
      }
    });

    it("requireSigner returns the configured signer", ({ createSDK }) => {
      const sdk = createSDK();
      expect(sdk.requireSigner("op")).toBe(sdk.signer);
    });
  });

  describe("signer-required SDK operations", () => {
    it("userDecrypt throws SignerRequiredError", async ({ createSDK }) => {
      const sdk = createSDK({ signer: undefined });
      await expect(
        sdk.userDecrypt([{ handle: "0xh", contractAddress: "0x1" as Address }]),
      ).rejects.toBeInstanceOf(SignerRequiredError);
    });

    it("allow throws SignerRequiredError", async ({ createSDK }) => {
      const sdk = createSDK({ signer: undefined });
      await expect(sdk.allow(["0x1" as Address])).rejects.toBeInstanceOf(SignerRequiredError);
    });

    it("revokePermits throws SignerRequiredError", async ({ createSDK }) => {
      const sdk = createSDK({ signer: undefined });
      await expect(sdk.revokePermits()).rejects.toBeInstanceOf(SignerRequiredError);
    });

    it("clearCredentials throws SignerRequiredError", async ({ createSDK }) => {
      const sdk = createSDK({ signer: undefined });
      await expect(sdk.clearCredentials()).rejects.toBeInstanceOf(SignerRequiredError);
    });

    it("isAllowed returns false (pure store lookup)", async ({ createSDK }) => {
      const sdk = createSDK({ signer: undefined });
      await expect(sdk.isAllowed(["0x1" as Address])).resolves.toBe(false);
    });

    it("requireChainAlignment throws SignerRequiredError before chain check", async ({
      createSDK,
    }) => {
      const sdk = createSDK({ signer: undefined });
      await expect(sdk.requireChainAlignment("op")).rejects.toBeInstanceOf(SignerRequiredError);
    });
  });

  describe("signer-required Token operations", () => {
    it("Token.confidentialTransfer throws SignerRequiredError", async ({
      createSDK,
      tokenAddress,
    }) => {
      const sdk = createSDK({ signer: undefined });
      const token = sdk.createToken(tokenAddress);
      await expect(token.confidentialTransfer("0x1" as Address, 1n)).rejects.toBeInstanceOf(
        SignerRequiredError,
      );
    });

    it("ReadonlyToken.isAllowed returns false when no signer", async ({
      createSDK,
      tokenAddress,
    }) => {
      const sdk = createSDK({ signer: undefined });
      const token = sdk.createReadonlyToken(tokenAddress);
      await expect(token.isAllowed()).resolves.toBe(false);
    });
  });
});

describe("SignerRequiredError", () => {
  it("has operation, code, name, and message", () => {
    const err = new SignerRequiredError("myOp");
    expect(err).toBeInstanceOf(SignerRequiredError);
    expect(err.name).toBe("SignerRequiredError");
    expect(err.operation).toBe("myOp");
    expect(err.code).toBe(ZamaErrorCode.SignerRequired);
    expect(err.message).toContain("myOp");
    expect(err.message).not.toContain("<ZamaProvider signer=");
  });
});
