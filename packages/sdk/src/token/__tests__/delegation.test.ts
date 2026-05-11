import { getAddress, type Address } from "viem";
import { describe, expect, it, vi } from "../../test-fixtures";
import type { Handle } from "../../relayer/relayer-sdk.types";
import { ReadonlyToken, ZERO_HANDLE } from "../readonly-token";
import { Token } from "../token";

const TOKEN2 = "0xeDeDeDeDeDeDeDeDeDeDeDeDeDeDeDeDeDeDeDeD" as Address;
const HANDLE = `0x${"ab".repeat(32)}` as Handle;

describe("delegation read methods", () => {
  it("getDelegationExpiry scopes the SDK read to this token", async ({
    sdk,
    readonlyToken,
    tokenAddress,
    delegatorAddress,
    delegateAddress,
  }) => {
    vi.spyOn(sdk, "getDelegationExpiry").mockResolvedValue(1234n);

    await expect(
      readonlyToken.getDelegationExpiry({ delegatorAddress, delegateAddress }),
    ).resolves.toBe(1234n);
    expect(sdk.getDelegationExpiry).toHaveBeenCalledWith({
      contractAddress: tokenAddress,
      delegatorAddress,
      delegateAddress,
    });
  });

  it("isDelegated scopes the SDK read to this token", async ({
    sdk,
    readonlyToken,
    tokenAddress,
    delegatorAddress,
    delegateAddress,
  }) => {
    vi.spyOn(sdk, "isDelegated").mockResolvedValue(true);

    await expect(readonlyToken.isDelegated({ delegatorAddress, delegateAddress })).resolves.toBe(
      true,
    );
    expect(sdk.isDelegated).toHaveBeenCalledWith({
      contractAddress: tokenAddress,
      delegatorAddress,
      delegateAddress,
    });
  });
});

describe("delegation write methods", () => {
  it("delegateDecryption delegates to the SDK with this token address", async ({
    createSDK,
    createToken,
    tokenAddress,
    delegateAddress,
  }) => {
    const sdk = createSDK();
    const token = createToken(sdk);
    const delegateDecryption = vi.spyOn(sdk, "delegateDecryption").mockResolvedValue({
      txHash: `0x${"11".repeat(32)}`,
      receipt: { logs: [] },
    });
    const expirationDate = new Date("2030-01-01T00:00:00Z");

    const result = await token.delegateDecryption({ delegateAddress, expirationDate });

    expect(result.txHash).toBe(`0x${"11".repeat(32)}`);
    expect(delegateDecryption).toHaveBeenCalledWith({
      contractAddress: tokenAddress,
      delegateAddress,
      expirationDate,
    });
  });

  it("revokeDelegation delegates to the SDK with this token address", async ({
    createSDK,
    createToken,
    tokenAddress,
    delegateAddress,
  }) => {
    const sdk = createSDK();
    const token = createToken(sdk);
    const revokeDelegation = vi.spyOn(sdk, "revokeDelegation").mockResolvedValue({
      txHash: `0x${"22".repeat(32)}`,
      receipt: { logs: [] },
    });

    const result = await token.revokeDelegation({ delegateAddress });

    expect(result.txHash).toBe(`0x${"22".repeat(32)}`);
    expect(revokeDelegation).toHaveBeenCalledWith({
      contractAddress: tokenAddress,
      delegateAddress,
    });
  });

  it("propagates SDK delegation errors to caller", async ({
    createSDK,
    createToken,
    delegateAddress,
  }) => {
    const sdk = createSDK();
    const token = createToken(sdk);
    vi.spyOn(sdk, "delegateDecryption").mockRejectedValue(new Error("revert"));

    await expect(token.delegateDecryption({ delegateAddress })).rejects.toThrow("revert");
  });
});

describe("decryptBalanceAs", () => {
  it("returns 0n for zero balance handles without delegated decrypt", async ({
    sdk,
    readonlyToken,
    delegatorAddress,
    provider,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValue(ZERO_HANDLE);
    const delegatedUserDecrypt = vi.spyOn(sdk, "delegatedUserDecrypt");

    await expect(readonlyToken.decryptBalanceAs({ delegatorAddress })).resolves.toBe(0n);
    expect(delegatedUserDecrypt).not.toHaveBeenCalled();
  });

  it("reads the account balance handle and returns the SDK decrypted bigint", async ({
    sdk,
    readonlyToken,
    tokenAddress,
    delegatorAddress,
    userAddress,
    provider,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValue(HANDLE);
    vi.spyOn(sdk, "delegatedUserDecrypt").mockResolvedValue({ [HANDLE]: 500n });

    await expect(
      readonlyToken.decryptBalanceAs({
        delegatorAddress,
        accountAddress: userAddress,
      }),
    ).resolves.toBe(500n);
    expect(sdk.delegatedUserDecrypt).toHaveBeenCalledWith(
      [{ handle: HANDLE, contractAddress: tokenAddress }],
      delegatorAddress,
      userAddress,
    );
  });

  it("throws when the SDK returns no value for a non-zero balance handle", async ({
    sdk,
    readonlyToken,
    delegatorAddress,
    provider,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValue(HANDLE);
    vi.spyOn(sdk, "delegatedUserDecrypt").mockResolvedValue({});

    await expect(readonlyToken.decryptBalanceAs({ delegatorAddress })).rejects.toMatchObject({
      code: "DECRYPTION_FAILED",
    });
  });
});

describe("batch delegation", () => {
  it("batchDelegateDecryption returns per-token transaction results", async ({
    sdk,
    token,
    tokenAddress,
    delegateAddress,
  }) => {
    const token2 = new Token(sdk, TOKEN2);

    const results = await Token.batchDelegateDecryption({
      tokens: [token, token2],
      delegateAddress,
    });

    expect(results.get(tokenAddress)).toEqual(expect.objectContaining({ txHash: "0xtxhash" }));
    expect(results.get(getAddress(TOKEN2))).toEqual(
      expect.objectContaining({ txHash: "0xtxhash" }),
    );
  });

  it("batchDelegateDecryption captures per-token errors", async ({
    signer,
    sdk,
    token,
    tokenAddress,
    delegateAddress,
  }) => {
    vi.mocked(signer.writeContract)
      .mockResolvedValueOnce("0xtxhash")
      .mockRejectedValueOnce(new Error("revert"));
    const token2 = new Token(sdk, TOKEN2);

    const results = await Token.batchDelegateDecryption({
      tokens: [token, token2],
      delegateAddress,
    });

    expect(results.get(tokenAddress)).toEqual(expect.objectContaining({ txHash: "0xtxhash" }));
    expect(results.get(getAddress(TOKEN2))).toBeInstanceOf(Error);
  });

  it("batchRevokeDelegation returns per-token transaction results", async ({
    token,
    tokenAddress,
    delegateAddress,
    provider,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValue(1n);

    const results = await Token.batchRevokeDelegation({
      tokens: [token],
      delegateAddress,
    });

    expect(results.get(tokenAddress)).toEqual(expect.objectContaining({ txHash: "0xtxhash" }));
  });
});

describe("batchDecryptBalancesAs edge cases", () => {
  it("throws when handles length does not match tokens length", async ({
    readonlyToken,
    delegatorAddress,
  }) => {
    await expect(
      ReadonlyToken.batchDecryptBalancesAs([readonlyToken], {
        delegatorAddress,
        handles: [],
      }),
    ).rejects.toThrow("tokens.length (1) must equal handles.length (0)");
  });

  it("throws when tokens use different SDK instances", async ({
    createSDK,
    createMockRelayer,
    readonlyToken,
    delegatorAddress,
  }) => {
    const otherSdk = createSDK({ relayer: createMockRelayer() });
    const token2 = new ReadonlyToken(otherSdk, TOKEN2);

    await expect(
      ReadonlyToken.batchDecryptBalancesAs([readonlyToken, token2], {
        delegatorAddress,
      }),
    ).rejects.toThrow("All tokens in a batch operation must share the same ZamaSDK instance");
  });
});
