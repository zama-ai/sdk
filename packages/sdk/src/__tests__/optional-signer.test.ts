import { describe, it, expect } from "../test-fixtures";
import { ReadonlyToken } from "../token/readonly-token";
import { Token } from "../token/token";
import { SignerRequiredError, ZamaErrorCode } from "../errors";
import type { Address } from "viem";

describe("ZamaSDK without signer", () => {
  it("constructs with signer omitted", ({ createSDK }) => {
    const sdk = createSDK({ signer: undefined });
    expect(sdk.hasSigner).toBe(false);
    expect(() => sdk.signer).toThrow(SignerRequiredError);
    expect(() => sdk.credentials).toThrow(SignerRequiredError);
    expect(() => sdk.delegatedCredentials).toThrow(SignerRequiredError);
  });

  it("validates keypairTTL even when signer is omitted", ({ createSDK }) => {
    expect(() => createSDK({ signer: undefined, keypairTTL: 0 })).toThrow(
      "keypairTTL must be a positive number",
    );
    expect(() => createSDK({ signer: undefined, keypairTTL: NaN })).toThrow(
      "keypairTTL must be a positive number",
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

  describe("throwing getters", () => {
    it("signer getter throws SignerRequiredError", ({ createSDK }) => {
      const sdk = createSDK({ signer: undefined });
      expect(() => sdk.signer).toThrow(SignerRequiredError);
      try {
        void sdk.signer;
      } catch (err) {
        expect(err).toBeInstanceOf(SignerRequiredError);
        expect((err as SignerRequiredError).code).toBe(ZamaErrorCode.SignerRequired);
      }
    });

    it("credentials getter throws SignerRequiredError", ({ createSDK }) => {
      const sdk = createSDK({ signer: undefined });
      expect(() => sdk.credentials).toThrow(SignerRequiredError);
    });

    it("delegatedCredentials getter throws SignerRequiredError", ({ createSDK }) => {
      const sdk = createSDK({ signer: undefined });
      expect(() => sdk.delegatedCredentials).toThrow(SignerRequiredError);
    });

    it("returns the value when signer is present", ({ createSDK }) => {
      const sdk = createSDK();
      expect(sdk.hasSigner).toBe(true);
      expect(sdk.signer).toBeDefined();
      expect(sdk.credentials).toBeDefined();
      expect(sdk.delegatedCredentials).toBeDefined();
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

    it("revokeSession throws SignerRequiredError", async ({ createSDK }) => {
      const sdk = createSDK({ signer: undefined });
      await expect(sdk.revokeSession()).rejects.toBeInstanceOf(SignerRequiredError);
    });

    it("requireChainAlignment throws SignerRequiredError before chain check", async ({
      createSDK,
    }) => {
      const sdk = createSDK({ signer: undefined });
      await expect(sdk.requireChainAlignment()).rejects.toBeInstanceOf(SignerRequiredError);
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

    it("ReadonlyToken.isAllowed throws SignerRequiredError", async ({
      createSDK,
      tokenAddress,
    }) => {
      const sdk = createSDK({ signer: undefined });
      const token = sdk.createReadonlyToken(tokenAddress);
      await expect(token.isAllowed()).rejects.toBeInstanceOf(SignerRequiredError);
    });
  });
});

describe("SignerRequiredError", () => {
  it("has code, name, and message", () => {
    const err = new SignerRequiredError();
    expect(err).toBeInstanceOf(SignerRequiredError);
    expect(err.name).toBe("SignerRequiredError");
    expect(err.code).toBe(ZamaErrorCode.SignerRequired);
    expect(err.message).toContain("No signer configured");
  });
});
