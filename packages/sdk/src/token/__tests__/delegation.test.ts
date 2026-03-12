import { createMockRelayer, describe, expect, it, vi } from "../../test-fixtures";
import { ReadonlyToken, ZERO_HANDLE } from "../readonly-token";
import { Token } from "../token";
import { MemoryStorage } from "../memory-storage";
import { getAddress, type Address } from "viem";
import { MAX_UINT64 } from "../../contracts/constants";

describe("delegation read methods", () => {
  it("getDelegationExpiry reads from ACL contract", async ({
    signer,
    readonlyToken,
    aclAddress,
    tokenAddress,
    delegatorAddress,
    delegateAddress,
  }) => {
    vi.mocked(signer.readContract).mockResolvedValue(1700000000n);

    const expiry = await readonlyToken.getDelegationExpiry({ delegatorAddress, delegateAddress });

    expect(signer.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: aclAddress,
        functionName: "getUserDecryptionDelegationExpirationDate",
        args: [delegatorAddress, delegateAddress, tokenAddress],
      }),
    );
    expect(expiry).toBe(1700000000n);
  });

  it("isDelegated returns true when expiry is in the future", async ({
    signer,
    readonlyToken,
    delegatorAddress,
    delegateAddress,
  }) => {
    const futureTimestamp = BigInt(Math.floor(Date.now() / 1000) + 3600);
    vi.mocked(signer.readContract).mockResolvedValue(futureTimestamp);

    expect(await readonlyToken.isDelegated({ delegatorAddress, delegateAddress })).toBe(true);
  });

  it("isDelegated returns false when expiry is 0", async ({
    signer,
    readonlyToken,
    delegatorAddress,
    delegateAddress,
  }) => {
    vi.mocked(signer.readContract).mockResolvedValue(0n);

    expect(await readonlyToken.isDelegated({ delegatorAddress, delegateAddress })).toBe(false);
  });

  it("isDelegated returns false when expiry is in the past", async ({
    signer,
    readonlyToken,
    delegatorAddress,
    delegateAddress,
  }) => {
    vi.mocked(signer.readContract).mockResolvedValue(1000n);

    expect(await readonlyToken.isDelegated({ delegatorAddress, delegateAddress })).toBe(false);
  });

  it("isDelegated short-circuits for permanent delegation without fetching block timestamp", async ({
    signer,
    readonlyToken,
    delegatorAddress,
    delegateAddress,
  }) => {
    vi.mocked(signer.readContract).mockResolvedValue(MAX_UINT64);

    expect(await readonlyToken.isDelegated({ delegatorAddress, delegateAddress })).toBe(true);
    // getBlockTimestamp should NOT have been called — permanent delegation skips it.
    expect(signer.getBlockTimestamp).not.toHaveBeenCalled();
  });

  it("getDelegationExpiry throws when relayer cannot resolve ACL", async ({
    signer,
    storage,
    sessionStorage,
    tokenAddress,
    delegatorAddress,
    delegateAddress,
  }) => {
    const relayerNoAcl = createMockRelayer({
      getAclAddress: vi.fn().mockRejectedValue(new Error("no transport config")),
    });
    const token = new ReadonlyToken({
      relayer: relayerNoAcl,
      signer,
      storage,
      sessionStorage,
      address: tokenAddress,
    });

    await expect(token.getDelegationExpiry({ delegatorAddress, delegateAddress })).rejects.toThrow(
      "no transport config",
    );
  });
});

describe("delegation write methods", () => {
  it("delegateDecryption calls ACL with expiration date", async ({
    signer,
    token,
    aclAddress,
    tokenAddress,
    delegateAddress,
  }) => {
    const expiry = new Date("2030-01-01T00:00:00Z");

    await token.delegateDecryption({ delegateAddress, expirationDate: expiry });

    expect(signer.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: aclAddress,
        functionName: "delegateForUserDecryption",
        args: [delegateAddress, tokenAddress, BigInt(Math.floor(expiry.getTime() / 1000))],
      }),
    );
  });

  it("delegateDecryption without expiration uses uint64 max", async ({
    signer,
    token,
    tokenAddress,
    delegateAddress,
  }) => {
    await token.delegateDecryption({ delegateAddress });

    expect(signer.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "delegateForUserDecryption",
        args: [delegateAddress, tokenAddress, MAX_UINT64],
      }),
    );
  });

  it("delegateDecryption returns TransactionResult", async ({ token, delegateAddress }) => {
    const result = await token.delegateDecryption({ delegateAddress });
    expect(result).toEqual({ txHash: "0xtxhash", receipt: { logs: [] } });
  });

  it("revokeDelegation calls ACL correctly", async ({
    signer,
    token,
    aclAddress,
    tokenAddress,
    delegateAddress,
  }) => {
    await token.revokeDelegation({ delegateAddress });

    expect(signer.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: aclAddress,
        functionName: "revokeDelegationForUserDecryption",
        args: [delegateAddress, tokenAddress],
      }),
    );
  });

  it("delegateDecryption wraps revert as TransactionRevertedError", async ({
    signer,
    token,
    delegateAddress,
  }) => {
    vi.mocked(signer.writeContract).mockRejectedValue(new Error("revert"));

    await expect(token.delegateDecryption({ delegateAddress })).rejects.toThrow(
      expect.objectContaining({ code: "TRANSACTION_REVERTED" }),
    );
  });

  it("revokeDelegation wraps revert as TransactionRevertedError", async ({
    signer,
    token,
    delegateAddress,
  }) => {
    vi.mocked(signer.writeContract).mockRejectedValue(new Error("revert"));

    await expect(token.revokeDelegation({ delegateAddress })).rejects.toThrow(
      expect.objectContaining({ code: "TRANSACTION_REVERTED" }),
    );
  });

  it("revokeDelegation returns TransactionResult", async ({ token, delegateAddress }) => {
    const result = await token.revokeDelegation({ delegateAddress });
    expect(result).toEqual({ txHash: "0xtxhash", receipt: { logs: [] } });
  });

  it("delegateDecryption throws when relayer cannot resolve ACL", async ({
    signer,
    storage,
    sessionStorage,
    tokenAddress,
    delegateAddress,
  }) => {
    const relayerNoAcl = createMockRelayer({
      getAclAddress: vi.fn().mockRejectedValue(new Error("no transport config")),
    });
    const tokenNoAcl = new Token({
      relayer: relayerNoAcl,
      signer,
      storage,
      sessionStorage,
      address: tokenAddress,
    });

    await expect(tokenNoAcl.delegateDecryption({ delegateAddress })).rejects.toThrow(
      "no transport config",
    );
  });

  it("revokeDelegation throws when relayer cannot resolve ACL", async ({
    signer,
    storage,
    sessionStorage,
    tokenAddress,
    delegateAddress,
  }) => {
    const relayerNoAcl = createMockRelayer({
      getAclAddress: vi.fn().mockRejectedValue(new Error("no transport config")),
    });
    const tokenNoAcl = new Token({
      relayer: relayerNoAcl,
      signer,
      storage,
      sessionStorage,
      address: tokenAddress,
    });

    await expect(tokenNoAcl.revokeDelegation({ delegateAddress })).rejects.toThrow(
      "no transport config",
    );
  });
});

describe("decryptBalanceAs", () => {
  it("returns 0n for zero handle without calling relayer", async ({
    signer,
    relayer,
    readonlyToken,
    delegatorAddress,
  }) => {
    vi.mocked(signer.readContract).mockResolvedValue(ZERO_HANDLE);

    const balance = await readonlyToken.decryptBalanceAs({ delegatorAddress });

    expect(relayer.delegatedUserDecrypt).not.toHaveBeenCalled();
    expect(balance).toBe(0n);
  });

  it("calls delegatedUserDecrypt with correct params", async ({
    signer,
    relayer,
    readonlyToken,
    handle,
    tokenAddress,
    delegatorAddress,
  }) => {
    vi.mocked(signer.readContract)
      .mockResolvedValueOnce(handle) // confidentialBalanceOf
      .mockResolvedValueOnce(MAX_UINT64); // getDelegationExpiry (permanent → active)
    vi.mocked(relayer.createDelegatedUserDecryptEIP712).mockResolvedValue({
      domain: { name: "Decryption", version: "1", chainId: 1n, verifyingContract: "0xkms" },
      types: { DelegatedUserDecryptRequestVerification: [] },
      message: {
        publicKey: "0xpub",
        contractAddresses: [tokenAddress],
        delegatorAddress,
        startTimestamp: "1000",
        durationDays: "1",
        extraData: "0x",
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    vi.mocked(relayer.delegatedUserDecrypt).mockResolvedValue({
      [handle]: 500n,
    });

    const balance = await readonlyToken.decryptBalanceAs({ delegatorAddress });

    expect(balance).toBe(500n);
    expect(relayer.generateKeypair).toHaveBeenCalled();
    expect(relayer.createDelegatedUserDecryptEIP712).toHaveBeenCalledWith(
      "0xpub",
      [tokenAddress],
      delegatorAddress,
      expect.any(Number),
      expect.any(Number),
    );
    expect(relayer.delegatedUserDecrypt).toHaveBeenCalledWith(
      expect.objectContaining({
        handles: [handle],
        contractAddress: tokenAddress,
        delegatorAddress,
      }),
    );
  });

  it("propagates SigningFailedError from credential creation", async ({
    signer,
    relayer,
    readonlyToken,
    handle,
    delegatorAddress,
  }) => {
    vi.mocked(signer.readContract)
      .mockResolvedValueOnce(handle) // confidentialBalanceOf
      .mockResolvedValueOnce(MAX_UINT64); // getDelegationExpiry (permanent → active)
    vi.mocked(relayer.createDelegatedUserDecryptEIP712).mockRejectedValue(new Error("fail"));

    await expect(readonlyToken.decryptBalanceAs({ delegatorAddress })).rejects.toThrow(
      expect.objectContaining({ code: "SIGNING_FAILED" }),
    );
  });

  it("caches by owner, not delegator, when options.owner differs", async ({
    signer,
    relayer,
    readonlyToken,
    handle,
    tokenAddress,
    delegatorAddress,
    userAddress,
  }) => {
    vi.mocked(signer.readContract)
      .mockResolvedValueOnce(handle) // confidentialBalanceOf (first call)
      .mockResolvedValueOnce(MAX_UINT64) // getDelegationExpiry (first call)
      .mockResolvedValueOnce(handle); // confidentialBalanceOf (second call — cache hit skips delegation check)
    vi.mocked(relayer.createDelegatedUserDecryptEIP712).mockResolvedValue({
      domain: { name: "Decryption", version: "1", chainId: 1n, verifyingContract: "0xkms" },
      types: { DelegatedUserDecryptRequestVerification: [] },
      message: {
        publicKey: "0xpub",
        contractAddresses: [tokenAddress],
        delegatorAddress,
        startTimestamp: "1000",
        durationDays: "1",
        extraData: "0x",
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    vi.mocked(relayer.delegatedUserDecrypt).mockResolvedValue({ [handle]: 42n });

    // First call populates cache keyed by owner (userAddress), not delegator.
    await readonlyToken.decryptBalanceAs({ delegatorAddress, owner: userAddress });
    expect(relayer.delegatedUserDecrypt).toHaveBeenCalledTimes(1);

    // Second call with same owner should hit cache — no second decrypt call.
    const balance = await readonlyToken.decryptBalanceAs({ delegatorAddress, owner: userAddress });
    expect(balance).toBe(42n);
    expect(relayer.delegatedUserDecrypt).toHaveBeenCalledTimes(1);
  });

  it("throws DelegationNotFoundError when no delegation exists", async ({
    signer,
    relayer,
    readonlyToken,
    handle,
    delegatorAddress,
  }) => {
    vi.mocked(signer.readContract)
      .mockResolvedValueOnce(handle) // confidentialBalanceOf
      .mockResolvedValueOnce(0n); // getDelegationExpiry → no delegation

    await expect(readonlyToken.decryptBalanceAs({ delegatorAddress })).rejects.toThrow(
      expect.objectContaining({ code: "DELEGATION_NOT_FOUND" }),
    );
    expect(relayer.delegatedUserDecrypt).not.toHaveBeenCalled();
  });

  it("throws DelegationExpiredError when delegation has expired", async ({
    signer,
    relayer,
    readonlyToken,
    handle,
    delegatorAddress,
  }) => {
    vi.mocked(signer.readContract)
      .mockResolvedValueOnce(handle) // confidentialBalanceOf
      .mockResolvedValueOnce(1000n); // getDelegationExpiry → expired (past timestamp)

    await expect(readonlyToken.decryptBalanceAs({ delegatorAddress })).rejects.toThrow(
      expect.objectContaining({ code: "DELEGATION_EXPIRED" }),
    );
    expect(relayer.delegatedUserDecrypt).not.toHaveBeenCalled();
  });
});

describe("batch delegation", () => {
  const TOKEN2 = "0xeDeDeDeDeDeDeDeDeDeDeDeDeDeDeDeDeDeDeDeD" as Address;

  it("batchDelegateDecryption calls delegateDecryption on each token", async ({
    signer,
    relayer,
    token,
    tokenAddress,
    delegateAddress,
  }) => {
    const token2 = new Token({
      relayer,
      signer,
      storage: new MemoryStorage(),
      sessionStorage: new MemoryStorage(),
      address: TOKEN2,
    });

    const results = await Token.batchDelegateDecryption({
      tokens: [token, token2],
      delegateAddress,
    });

    expect(results.size).toBe(2);
    expect(results.get(tokenAddress)).toEqual(expect.objectContaining({ txHash: "0xtxhash" }));
    expect(results.get(getAddress(TOKEN2))).toEqual(
      expect.objectContaining({ txHash: "0xtxhash" }),
    );
  });

  it("batchDelegateDecryption captures per-token errors", async ({
    signer,
    relayer,
    token,
    tokenAddress,
    delegateAddress,
  }) => {
    vi.mocked(signer.writeContract)
      .mockResolvedValueOnce("0xtxhash")
      .mockRejectedValueOnce(new Error("revert"));

    const token2 = new Token({
      relayer,
      signer,
      storage: new MemoryStorage(),
      sessionStorage: new MemoryStorage(),
      address: TOKEN2,
    });

    const results = await Token.batchDelegateDecryption({
      tokens: [token, token2],
      delegateAddress,
    });

    expect(results.get(tokenAddress)).toEqual(expect.objectContaining({ txHash: "0xtxhash" }));
    expect(results.get(getAddress(TOKEN2))).toBeInstanceOf(Error);
  });

  it("batchRevokeDelegation works", async ({ token, tokenAddress, delegateAddress }) => {
    const results = await Token.batchRevokeDelegation({
      tokens: [token],
      delegateAddress,
    });

    expect(results.size).toBe(1);
    expect(results.get(tokenAddress)).toEqual(expect.objectContaining({ txHash: "0xtxhash" }));
  });

  it("batchRevokeDelegation captures per-token errors", async ({
    signer,
    relayer,
    token,
    tokenAddress,
    delegateAddress,
  }) => {
    vi.mocked(signer.writeContract)
      .mockResolvedValueOnce("0xtxhash")
      .mockRejectedValueOnce(new Error("revert"));

    const token2 = new Token({
      relayer,
      signer,
      storage: new MemoryStorage(),
      sessionStorage: new MemoryStorage(),
      address: TOKEN2,
    });

    const results = await Token.batchRevokeDelegation({
      tokens: [token, token2],
      delegateAddress,
    });

    expect(results.get(tokenAddress)).toEqual(expect.objectContaining({ txHash: "0xtxhash" }));
    expect(results.get(getAddress(TOKEN2))).toBeInstanceOf(Error);
  });

  it("batchDelegateDecryption with expiration date", async ({
    signer,
    token,
    tokenAddress,
    delegateAddress,
  }) => {
    const expiry = new Date("2030-06-15");

    const results = await Token.batchDelegateDecryption({
      tokens: [token],
      delegateAddress,
      expirationDate: expiry,
    });

    expect(results.size).toBe(1);
    expect(results.get(tokenAddress)).toEqual(expect.objectContaining({ txHash: "0xtxhash" }));
    expect(signer.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        args: [delegateAddress, tokenAddress, BigInt(Math.floor(expiry.getTime() / 1000))],
      }),
    );
  });
});

describe("delegateDecryption validation", () => {
  it("throws ConfigurationError when expiration date is in the past", async ({
    token,
    delegateAddress,
  }) => {
    const pastDate = new Date("2020-01-01");

    await expect(
      token.delegateDecryption({ delegateAddress, expirationDate: pastDate }),
    ).rejects.toThrow(expect.objectContaining({ code: "CONFIGURATION" }));
  });
});

describe("batchDecryptBalancesAs edge cases", () => {
  const TOKEN2 = "0xeDeDeDeDeDeDeDeDeDeDeDeDeDeDeDeDeDeDeDeD" as Address;

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

  it("throws when tokens use different relayers", async ({
    signer,
    storage,
    sessionStorage,
    readonlyToken,
    delegatorAddress,
  }) => {
    const otherRelayer = createMockRelayer();
    const token2 = new ReadonlyToken({
      relayer: otherRelayer,
      signer,
      storage,
      sessionStorage,
      address: TOKEN2,
    });

    await expect(
      ReadonlyToken.batchDecryptBalancesAs([readonlyToken, token2], {
        delegatorAddress,
      }),
    ).rejects.toThrow("All tokens in a batch operation must share the same relayer instance");
  });
});
