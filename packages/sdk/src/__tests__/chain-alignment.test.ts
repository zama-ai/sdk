import { describe, it, expect, vi } from "../test-fixtures";
import { ZamaSDK } from "../zama-sdk";
import { ChainMismatchError } from "../errors";
import type { Address } from "viem";

describe("requireChainAlignment", () => {
  it("returns the shared chain ID when signer and provider match", async ({
    relayer,
    provider,
    signer,
    storage,
  }) => {
    vi.mocked(signer.getChainId).mockResolvedValue(11155111);
    vi.mocked(provider.getChainId).mockResolvedValue(11155111);
    const sdk = new ZamaSDK({ relayer, provider, signer, storage });

    await expect(sdk.requireChainAlignment("testOp")).resolves.toBe(11155111);
  });

  it("throws ChainMismatchError with operation, signerChainId, providerChainId", async ({
    relayer,
    provider,
    signer,
    storage,
  }) => {
    vi.mocked(signer.getChainId).mockResolvedValue(1);
    vi.mocked(provider.getChainId).mockResolvedValue(11155111);
    const sdk = new ZamaSDK({ relayer, provider, signer, storage });

    try {
      await sdk.requireChainAlignment("shield");
      throw new Error("expected ChainMismatchError to be thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ChainMismatchError);
      const mismatch = error as ChainMismatchError;
      expect(mismatch.operation).toBe("shield");
      expect(mismatch.signerChainId).toBe(1);
      expect(mismatch.providerChainId).toBe(11155111);
    }
  });

  it("token.shield throws ChainMismatchError before calling writeContract or relayer.encrypt", async ({
    relayer,
    provider,
    signer,
    storage,
    tokenAddress,
  }) => {
    vi.mocked(signer.getChainId).mockResolvedValue(1);
    vi.mocked(provider.getChainId).mockResolvedValue(11155111);
    const sdk = new ZamaSDK({ relayer, provider, signer, storage });
    const token = sdk.createToken(tokenAddress);

    await expect(token.shield(1000n)).rejects.toBeInstanceOf(ChainMismatchError);

    expect(signer.writeContract).not.toHaveBeenCalled();
    expect(relayer.encrypt).not.toHaveBeenCalled();
  });

  it("sdk.userDecrypt throws ChainMismatchError before calling relayer.userDecrypt", async ({
    relayer,
    provider,
    signer,
    storage,
    tokenAddress,
    handle,
  }) => {
    vi.mocked(signer.getChainId).mockResolvedValue(1);
    vi.mocked(provider.getChainId).mockResolvedValue(11155111);
    const sdk = new ZamaSDK({ relayer, provider, signer, storage });

    await expect(
      sdk.userDecrypt([{ handle, contractAddress: tokenAddress as Address }]),
    ).rejects.toBeInstanceOf(ChainMismatchError);

    expect(relayer.userDecrypt).not.toHaveBeenCalled();
  });

  it("ReadonlyToken.decryptBalanceAs throws ChainMismatchError before calling relayer", async ({
    relayer,
    provider,
    signer,
    storage,
    tokenAddress,
    delegatorAddress,
  }) => {
    vi.mocked(signer.getChainId).mockResolvedValue(1);
    vi.mocked(provider.getChainId).mockResolvedValue(11155111);
    const sdk = new ZamaSDK({ relayer, provider, signer, storage });
    const token = sdk.createReadonlyToken(tokenAddress);

    await expect(token.decryptBalanceAs({ delegatorAddress })).rejects.toBeInstanceOf(
      ChainMismatchError,
    );

    expect(relayer.delegatedUserDecrypt).not.toHaveBeenCalled();
  });

  it("ReadonlyToken.batchBalancesOf throws ChainMismatchError before calling sdk.allow", async ({
    relayer,
    provider,
    signer,
    storage,
    tokenAddress,
  }) => {
    vi.mocked(signer.getChainId).mockResolvedValue(1);
    vi.mocked(provider.getChainId).mockResolvedValue(11155111);
    const sdk = new ZamaSDK({ relayer, provider, signer, storage });
    const token = sdk.createReadonlyToken(tokenAddress);
    const allowSpy = vi.spyOn(sdk, "allow");

    const { ReadonlyToken } = await import("../token/readonly-token");
    await expect(ReadonlyToken.batchBalancesOf([token])).rejects.toBeInstanceOf(ChainMismatchError);

    expect(allowSpy).not.toHaveBeenCalled();
    expect(signer.signTypedData).not.toHaveBeenCalled();
  });

  it("token.confidentialTransfer throws ChainMismatchError before encrypting or writing", async ({
    relayer,
    provider,
    signer,
    storage,
    tokenAddress,
  }) => {
    vi.mocked(signer.getChainId).mockResolvedValue(1);
    vi.mocked(provider.getChainId).mockResolvedValue(11155111);
    const sdk = new ZamaSDK({ relayer, provider, signer, storage });
    const token = sdk.createToken(tokenAddress);

    await expect(
      token.confidentialTransfer("0x000000000000000000000000000000000000dEaD" as Address, 100n, {
        skipBalanceCheck: true,
      }),
    ).rejects.toBeInstanceOf(ChainMismatchError);

    expect(signer.writeContract).not.toHaveBeenCalled();
    expect(relayer.encrypt).not.toHaveBeenCalled();
  });

  it("token.unwrap throws ChainMismatchError before calling writeContract", async ({
    relayer,
    provider,
    signer,
    storage,
    tokenAddress,
  }) => {
    vi.mocked(signer.getChainId).mockResolvedValue(1);
    vi.mocked(provider.getChainId).mockResolvedValue(11155111);
    const sdk = new ZamaSDK({ relayer, provider, signer, storage });
    const token = sdk.createToken(tokenAddress);

    await expect(token.unwrap(100n)).rejects.toBeInstanceOf(ChainMismatchError);

    expect(signer.writeContract).not.toHaveBeenCalled();
    expect(relayer.encrypt).not.toHaveBeenCalled();
  });

  it("token.delegateDecryption throws ChainMismatchError before calling writeContract", async ({
    relayer,
    provider,
    signer,
    storage,
    tokenAddress,
    delegatorAddress,
  }) => {
    vi.mocked(signer.getChainId).mockResolvedValue(1);
    vi.mocked(provider.getChainId).mockResolvedValue(11155111);
    const sdk = new ZamaSDK({ relayer, provider, signer, storage });
    const token = sdk.createToken(tokenAddress);

    await expect(
      token.delegateDecryption({ delegateAddress: delegatorAddress }),
    ).rejects.toBeInstanceOf(ChainMismatchError);

    expect(signer.writeContract).not.toHaveBeenCalled();
  });
});
