import { describe, it, expect } from "../test-fixtures";
import { ZamaSDK } from "../zama-sdk";
import { ReadonlyToken } from "../token/readonly-token";
import { Token } from "../token/token";
import { SignerRequiredError, ZamaErrorCode } from "../errors";
import type { Address } from "viem";

describe("ZamaSDK without signer", () => {
  it("constructs with signer omitted", ({ relayer, provider, storage }) => {
    const sdk = new ZamaSDK({ relayer, provider, storage });
    expect(sdk.signer).toBeUndefined();
    expect(sdk.credentials).toBeUndefined();
    expect(sdk.delegatedCredentials).toBeUndefined();
  });

  it("does not validate signer-only keypairTTL when signer is omitted", ({
    relayer,
    provider,
    storage,
  }) => {
    expect(() => new ZamaSDK({ relayer, provider, storage, keypairTTL: 0 })).not.toThrow();
    expect(() => new ZamaSDK({ relayer, provider, storage, keypairTTL: NaN })).not.toThrow();
  });

  it("does not subscribe to signer lifecycle", ({ relayer, provider, storage }) => {
    new ZamaSDK({ relayer, provider, storage });
    expect(provider.getChainId).not.toHaveBeenCalled();
  });

  it("createReadonlyToken works with no signer", ({ relayer, provider, storage, tokenAddress }) => {
    const sdk = new ZamaSDK({ relayer, provider, storage });
    const token = sdk.createReadonlyToken(tokenAddress);
    expect(token).toBeInstanceOf(ReadonlyToken);
    expect(token.address).toBe(tokenAddress);
  });

  it("createToken works with no signer (Token guards per-method)", ({
    relayer,
    provider,
    storage,
    tokenAddress,
  }) => {
    const sdk = new ZamaSDK({ relayer, provider, storage });
    const token = sdk.createToken(tokenAddress);
    expect(token).toBeInstanceOf(Token);
    expect(token.address).toBe(tokenAddress);
  });

  it("publicDecrypt works with no signer", async ({ relayer, provider, storage }) => {
    const sdk = new ZamaSDK({ relayer, provider, storage });
    await sdk.publicDecrypt(["0xhandle"]);
    expect(relayer.publicDecrypt).toHaveBeenCalled();
  });

  describe("requireSigner / requireCredentials / requireDelegatedCredentials", () => {
    it("requireSigner throws SignerRequiredError with operation", ({
      relayer,
      provider,
      storage,
    }) => {
      const sdk = new ZamaSDK({ relayer, provider, storage });
      expect(() => sdk.requireSigner("myOp")).toThrow(SignerRequiredError);
      try {
        sdk.requireSigner("myOp");
      } catch (err) {
        expect(err).toBeInstanceOf(SignerRequiredError);
        expect((err as SignerRequiredError).operation).toBe("myOp");
        expect((err as SignerRequiredError).code).toBe(ZamaErrorCode.SignerRequired);
      }
    });

    it("requireCredentials throws SignerRequiredError", ({ relayer, provider, storage }) => {
      const sdk = new ZamaSDK({ relayer, provider, storage });
      expect(() => sdk.requireCredentials("creds")).toThrow(SignerRequiredError);
    });

    it("requireDelegatedCredentials throws SignerRequiredError", ({
      relayer,
      provider,
      storage,
    }) => {
      const sdk = new ZamaSDK({ relayer, provider, storage });
      expect(() => sdk.requireDelegatedCredentials("deleg")).toThrow(SignerRequiredError);
    });

    it("returns the manager when signer is present", ({ relayer, provider, signer, storage }) => {
      const sdk = new ZamaSDK({ relayer, provider, signer, storage });
      expect(sdk.requireSigner("op")).toBe(signer);
      expect(sdk.requireCredentials("op")).toBe(sdk.credentials);
      expect(sdk.requireDelegatedCredentials("op")).toBe(sdk.delegatedCredentials);
    });
  });

  describe("signer-required SDK operations", () => {
    it("userDecrypt throws SignerRequiredError", async ({ relayer, provider, storage }) => {
      const sdk = new ZamaSDK({ relayer, provider, storage });
      await expect(
        sdk.userDecrypt([{ handle: "0xh", contractAddress: "0x1" as Address }]),
      ).rejects.toBeInstanceOf(SignerRequiredError);
    });

    it("allow throws SignerRequiredError", async ({ relayer, provider, storage }) => {
      const sdk = new ZamaSDK({ relayer, provider, storage });
      await expect(sdk.allow(["0x1" as Address])).rejects.toBeInstanceOf(SignerRequiredError);
    });

    it("revokeSession throws SignerRequiredError", async ({ relayer, provider, storage }) => {
      const sdk = new ZamaSDK({ relayer, provider, storage });
      await expect(sdk.revokeSession()).rejects.toBeInstanceOf(SignerRequiredError);
    });

    it("requireChainAlignment throws SignerRequiredError before chain check", async ({
      relayer,
      provider,
      storage,
    }) => {
      const sdk = new ZamaSDK({ relayer, provider, storage });
      await expect(sdk.requireChainAlignment("op")).rejects.toBeInstanceOf(SignerRequiredError);
    });
  });

  describe("signer-required Token operations", () => {
    it("Token.confidentialTransfer throws SignerRequiredError", async ({
      relayer,
      provider,
      storage,
      tokenAddress,
    }) => {
      const sdk = new ZamaSDK({ relayer, provider, storage });
      const token = sdk.createToken(tokenAddress);
      await expect(
        token.confidentialTransfer({ to: "0x1" as Address, amount: 1n }),
      ).rejects.toBeInstanceOf(SignerRequiredError);
    });

    it("ReadonlyToken.isAllowed throws SignerRequiredError", async ({
      relayer,
      provider,
      storage,
      tokenAddress,
    }) => {
      const sdk = new ZamaSDK({ relayer, provider, storage });
      const token = sdk.createReadonlyToken(tokenAddress);
      await expect(token.isAllowed()).rejects.toBeInstanceOf(SignerRequiredError);
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
  });
});
