import { createMockRelayer, describe, expect, it, vi } from "../../test-fixtures";
import { ReadonlyToken, ZERO_HANDLE } from "../readonly-token";
import { Token } from "../token";
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

    const expiry = await readonlyToken.getDelegationExpiry({
      delegatorAddress,
      delegateAddress,
    });

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
    createSDK,
    tokenAddress,
    delegatorAddress,
    delegateAddress,
  }) => {
    const relayerNoAcl = createMockRelayer({
      getAclAddress: vi.fn().mockRejectedValue(new Error("no transport config")),
    });
    const sdkNoAcl = createSDK({ relayer: relayerNoAcl });
    const token = new ReadonlyToken(sdkNoAcl, tokenAddress);

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

  it("delegateDecryption returns TransactionResult", async ({ signer, token, delegateAddress }) => {
    // Mock readContract to return a different expiry so the duplicate-expiry guard doesn't fire
    vi.mocked(signer.readContract).mockResolvedValue(1000n);
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
    // Mock active delegation so pre-flight check passes
    vi.mocked(signer.readContract).mockResolvedValue(MAX_UINT64);
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

  it("delegateDecryption maps AlreadyDelegatedOrRevokedInSameBlock to DelegationCooldownError", async ({
    signer,
    token,
    delegateAddress,
  }) => {
    vi.mocked(signer.writeContract).mockRejectedValue(
      new Error("AlreadyDelegatedOrRevokedInSameBlock"),
    );

    await expect(token.delegateDecryption({ delegateAddress })).rejects.toThrow(
      expect.objectContaining({ code: "DELEGATION_COOLDOWN" }),
    );
  });

  it("delegateDecryption maps EnforcedPause to AclPausedError", async ({
    signer,
    token,
    delegateAddress,
  }) => {
    vi.mocked(signer.writeContract).mockRejectedValue(new Error("EnforcedPause"));

    await expect(token.delegateDecryption({ delegateAddress })).rejects.toThrow(
      expect.objectContaining({ code: "ACL_PAUSED" }),
    );
  });

  it("revokeDelegation wraps revert as TransactionRevertedError", async ({
    signer,
    token,
    delegateAddress,
  }) => {
    // readContract returns active delegation for pre-flight check
    vi.mocked(signer.readContract).mockResolvedValue(MAX_UINT64);
    vi.mocked(signer.writeContract).mockRejectedValue(new Error("revert"));

    await expect(token.revokeDelegation({ delegateAddress })).rejects.toThrow(
      expect.objectContaining({ code: "TRANSACTION_REVERTED" }),
    );
  });

  it("revokeDelegation maps AlreadyDelegatedOrRevokedInSameBlock to DelegationCooldownError", async ({
    signer,
    token,
    delegateAddress,
  }) => {
    vi.mocked(signer.readContract).mockResolvedValue(MAX_UINT64);
    vi.mocked(signer.writeContract).mockRejectedValue(
      new Error("AlreadyDelegatedOrRevokedInSameBlock"),
    );

    await expect(token.revokeDelegation({ delegateAddress })).rejects.toThrow(
      expect.objectContaining({ code: "DELEGATION_COOLDOWN" }),
    );
  });

  it("revokeDelegation returns TransactionResult", async ({ signer, token, delegateAddress }) => {
    // Mock active delegation so pre-flight check passes
    vi.mocked(signer.readContract).mockResolvedValue(MAX_UINT64);
    const result = await token.revokeDelegation({ delegateAddress });
    expect(result).toEqual({ txHash: "0xtxhash", receipt: { logs: [] } });
  });

  it("delegateDecryption throws when relayer cannot resolve ACL", async ({
    createSDK,
    tokenAddress,
    delegateAddress,
  }) => {
    const relayerNoAcl = createMockRelayer({
      getAclAddress: vi.fn().mockRejectedValue(new Error("no transport config")),
    });
    const sdkNoAcl = createSDK({ relayer: relayerNoAcl });
    const tokenNoAcl = new Token(sdkNoAcl, tokenAddress);

    await expect(tokenNoAcl.delegateDecryption({ delegateAddress })).rejects.toThrow(
      "no transport config",
    );
  });

  it("revokeDelegation throws when relayer cannot resolve ACL", async ({
    createSDK,
    tokenAddress,
    delegateAddress,
  }) => {
    const relayerNoAcl = createMockRelayer({
      getAclAddress: vi.fn().mockRejectedValue(new Error("no transport config")),
    });
    const sdkNoAcl = createSDK({ relayer: relayerNoAcl });
    const tokenNoAcl = new Token(sdkNoAcl, tokenAddress);

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
      domain: {
        name: "Decryption",
        version: "1",
        chainId: 1n,
        verifyingContract: "0xkms",
      },
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

  it("caches by account, not delegator, when account differs", async ({
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
      .mockResolvedValueOnce(handle) // confidentialBalanceOf (second call)
      .mockResolvedValueOnce(MAX_UINT64); // getDelegationExpiry (second call — runs before cache lookup)
    vi.mocked(relayer.createDelegatedUserDecryptEIP712).mockResolvedValue({
      domain: {
        name: "Decryption",
        version: "1",
        chainId: 1n,
        verifyingContract: "0xkms",
      },
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
      [handle]: 42n,
    });

    // First call populates cache keyed by account (userAddress), not delegator.
    await readonlyToken.decryptBalanceAs({
      delegatorAddress,
      accountAddress: userAddress,
    });
    expect(relayer.delegatedUserDecrypt).toHaveBeenCalledTimes(1);

    // Second call with same account should hit cache — no second decrypt call.
    const balance = await readonlyToken.decryptBalanceAs({
      delegatorAddress,
      accountAddress: userAddress,
    });
    expect(balance).toBe(42n);
    expect(relayer.delegatedUserDecrypt).toHaveBeenCalledTimes(1);
  });

  it("re-checks delegation on cache hit and throws when revoked", async ({
    signer,
    relayer,
    readonlyToken,
    handle,
    tokenAddress,
    delegatorAddress,
  }) => {
    vi.mocked(signer.readContract)
      .mockResolvedValueOnce(handle) // confidentialBalanceOf (first call)
      .mockResolvedValueOnce(MAX_UINT64) // getDelegationExpiry → permanent
      .mockResolvedValueOnce(handle) // confidentialBalanceOf (second call)
      .mockResolvedValueOnce(0n); // getDelegationExpiry → revoked
    vi.mocked(relayer.createDelegatedUserDecryptEIP712).mockResolvedValue({
      domain: {
        name: "Decryption",
        version: "1",
        chainId: 1n,
        verifyingContract: "0xkms",
      },
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
      [handle]: 42n,
    });

    // First call populates cache while delegation is active.
    const first = await readonlyToken.decryptBalanceAs({ delegatorAddress });
    expect(first).toBe(42n);
    expect(relayer.delegatedUserDecrypt).toHaveBeenCalledTimes(1);

    // Delegation revoked — second call must reject despite the cached value.
    await expect(readonlyToken.decryptBalanceAs({ delegatorAddress })).rejects.toThrow(
      expect.objectContaining({ code: "DELEGATION_NOT_FOUND" }),
    );
    // No second decryption was attempted; the check fired before cache lookup.
    expect(relayer.delegatedUserDecrypt).toHaveBeenCalledTimes(1);
  });

  it("throws DelegationNotFoundError when no delegation exists", async ({
    signer,
    relayer,
    readonlyToken,
    handle,
    delegatorAddress,
    tokenAddress,
  }) => {
    vi.mocked(signer.readContract)
      .mockResolvedValueOnce(handle) // confidentialBalanceOf
      .mockResolvedValueOnce(0n); // getDelegationExpiry → no delegation

    await expect(readonlyToken.decryptBalanceAs({ delegatorAddress })).rejects.toThrow(
      expect.objectContaining({
        code: "DELEGATION_NOT_FOUND",
        message: expect.stringContaining(tokenAddress),
      }),
    );
    expect(relayer.delegatedUserDecrypt).not.toHaveBeenCalled();
  });

  it("throws DelegationExpiredError when delegation has expired", async ({
    signer,
    relayer,
    readonlyToken,
    handle,
    delegatorAddress,
    tokenAddress,
  }) => {
    vi.mocked(signer.readContract)
      .mockResolvedValueOnce(handle) // confidentialBalanceOf
      .mockResolvedValueOnce(1000n); // getDelegationExpiry → expired (past timestamp)

    await expect(readonlyToken.decryptBalanceAs({ delegatorAddress })).rejects.toThrow(
      expect.objectContaining({
        code: "DELEGATION_EXPIRED",
        message: expect.stringContaining(tokenAddress),
      }),
    );
    expect(relayer.delegatedUserDecrypt).not.toHaveBeenCalled();
  });

  it("preserves non-Error cause from relayer rejection", async ({
    signer,
    relayer,
    readonlyToken,
    handle,
    tokenAddress,
    delegatorAddress,
  }) => {
    vi.mocked(signer.readContract)
      .mockResolvedValueOnce(handle) // confidentialBalanceOf
      .mockResolvedValueOnce(MAX_UINT64); // getDelegationExpiry → permanent
    vi.mocked(relayer.createDelegatedUserDecryptEIP712).mockResolvedValue({
      domain: {
        name: "Decryption",
        version: "1",
        chainId: 1n,
        verifyingContract: "0xkms",
      },
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
    vi.mocked(relayer.delegatedUserDecrypt).mockRejectedValueOnce("raw string error");

    try {
      await readonlyToken.decryptBalanceAs({ delegatorAddress });
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      // wrapDecryptError must preserve non-Error causes (not drop them as undefined)
      expect((err as { cause: unknown }).cause).toBe("raw string error");
    }
  });

  it("preserves object cause with statusCode from relayer rejection", async ({
    signer,
    relayer,
    readonlyToken,
    handle,
    tokenAddress,
    delegatorAddress,
  }) => {
    vi.mocked(signer.readContract)
      .mockResolvedValueOnce(handle) // confidentialBalanceOf
      .mockResolvedValueOnce(MAX_UINT64); // getDelegationExpiry → permanent
    vi.mocked(relayer.createDelegatedUserDecryptEIP712).mockResolvedValue({
      domain: {
        name: "Decryption",
        version: "1",
        chainId: 1n,
        verifyingContract: "0xkms",
      },
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
    const objError = { statusCode: 502, message: "bad gateway" };
    vi.mocked(relayer.delegatedUserDecrypt).mockRejectedValueOnce(objError);

    try {
      await readonlyToken.decryptBalanceAs({ delegatorAddress });
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      expect((err as { cause: unknown }).cause).toBe(objError);
      expect((err as { code: string }).code).toBe("RELAYER_REQUEST_FAILED");
    }
  });

  it("throws DelegationNotPropagatedError when relayer returns 500 in delegated context", async ({
    signer,
    relayer,
    readonlyToken,
    handle,
    tokenAddress,
    delegatorAddress,
  }) => {
    vi.mocked(signer.readContract)
      .mockResolvedValueOnce(handle) // confidentialBalanceOf
      .mockResolvedValueOnce(MAX_UINT64); // getDelegationExpiry → permanent
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
    const serverError = new Error("Internal server error") as Error & { statusCode?: number };
    serverError.statusCode = 500;
    vi.mocked(relayer.delegatedUserDecrypt).mockRejectedValueOnce(serverError);

    try {
      await readonlyToken.decryptBalanceAs({ delegatorAddress });
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      expect((err as { code: string }).code).toBe("DELEGATION_NOT_PROPAGATED");
      expect((err as { cause: unknown }).cause).toBe(serverError);
      expect((err as { message: string }).message).toContain("most commonly caused");
    }
  });
});

describe("batch delegation", () => {
  const TOKEN2 = "0xeDeDeDeDeDeDeDeDeDeDeDeDeDeDeDeDeDeDeDeD" as Address;

  it("batchDelegateDecryption calls delegateDecryption on each token", async ({
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

    expect(results.size).toBe(2);
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
    sdk,
    token,
    tokenAddress,
    delegateAddress,
  }) => {
    vi.mocked(signer.writeContract)
      .mockResolvedValueOnce("0xtxhash")
      .mockRejectedValueOnce(new Error("revert"));

    const token2 = new Token(sdk, TOKEN2);

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
  it("throws DelegationExpirationTooSoonError when expiration date is in the past", async ({
    token,
    delegateAddress,
  }) => {
    const pastDate = new Date("2020-01-01");

    await expect(
      token.delegateDecryption({ delegateAddress, expirationDate: pastDate }),
    ).rejects.toThrow(expect.objectContaining({ code: "DELEGATION_EXPIRATION_TOO_SOON" }));
  });

  it("throws DelegationExpirationTooSoonError when expiration date is less than 1 hour in the future", async ({
    token,
    delegateAddress,
  }) => {
    const tooSoon = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes from now

    await expect(
      token.delegateDecryption({ delegateAddress, expirationDate: tooSoon }),
    ).rejects.toThrow(
      expect.objectContaining({
        code: "DELEGATION_EXPIRATION_TOO_SOON",
        message: expect.stringContaining("at least 1 hour"),
      }),
    );
  });

  it("accepts expiration date exactly 1 hour in the future", async ({
    signer,
    token,
    delegateAddress,
  }) => {
    const oneHourFromNow = new Date(Date.now() + 3600_000 + 1000); // 1 hour + 1 second

    await token.delegateDecryption({
      delegateAddress,
      expirationDate: oneHourFromNow,
    });

    expect(signer.writeContract).toHaveBeenCalled();
  });

  it("throws DelegationSelfNotAllowedError when delegate is the signer", async ({
    token,
    userAddress,
  }) => {
    await expect(token.delegateDecryption({ delegateAddress: userAddress })).rejects.toThrow(
      expect.objectContaining({ code: "DELEGATION_SELF_NOT_ALLOWED" }),
    );
  });

  it("throws DelegationDelegateEqualsContractError when delegate is the token address", async ({
    token,
    tokenAddress,
  }) => {
    await expect(token.delegateDecryption({ delegateAddress: tokenAddress })).rejects.toThrow(
      expect.objectContaining({ code: "DELEGATION_DELEGATE_EQUALS_CONTRACT" }),
    );
  });

  it("throws DelegationExpiryUnchangedError when expiry matches current", async ({
    signer,
    token,
    delegateAddress,
  }) => {
    const expiry = new Date("2030-01-01T00:00:00Z");
    const expiryTimestamp = BigInt(Math.floor(expiry.getTime() / 1000));
    // readContract returns the same expiry as the one being set
    vi.mocked(signer.readContract).mockResolvedValue(expiryTimestamp);

    await expect(
      token.delegateDecryption({ delegateAddress, expirationDate: expiry }),
    ).rejects.toThrow(expect.objectContaining({ code: "DELEGATION_EXPIRY_UNCHANGED" }));
  });
});

describe("revokeDelegation validation", () => {
  it("throws DelegationNotFoundError when no delegation exists", async ({
    signer,
    token,
    delegateAddress,
  }) => {
    vi.mocked(signer.readContract).mockResolvedValue(0n);

    await expect(token.revokeDelegation({ delegateAddress })).rejects.toThrow(
      expect.objectContaining({ code: "DELEGATION_NOT_FOUND" }),
    );
  });

  it("allows revoking an expired delegation (ACL accepts it)", async ({
    signer,
    token,
    delegateAddress,
  }) => {
    // Expired delegation (non-zero expiry in the past) — the SDK should NOT
    // block revocation; the ACL contract accepts it for cleanup.
    vi.mocked(signer.readContract).mockResolvedValue(1000n); // expired timestamp
    vi.mocked(signer.writeContract).mockResolvedValue(`0x${"ab".repeat(32)}`);
    vi.mocked(signer.waitForTransactionReceipt).mockResolvedValue({} as never);

    const result = await token.revokeDelegation({ delegateAddress });
    expect(result.txHash).toMatch(/^0x/);
  });
});

describe("delegation pre-flight RPC fallback", () => {
  it("delegateDecryption proceeds when getDelegationExpiry throws (falls back to on-chain enforcement)", async ({
    signer,
    token,
    delegateAddress,
  }) => {
    // Simulate RPC failure during pre-flight expiry check
    vi.mocked(signer.readContract).mockRejectedValue(new Error("network error"));
    vi.mocked(signer.writeContract).mockResolvedValue(`0x${"ab".repeat(32)}`);
    vi.mocked(signer.waitForTransactionReceipt).mockResolvedValue({} as never);

    // Should not throw — falls back to on-chain enforcement
    const result = await token.delegateDecryption({ delegateAddress });
    expect(result.txHash).toMatch(/^0x/);
    expect(signer.writeContract).toHaveBeenCalled();
  });

  it("revokeDelegation proceeds when getDelegationExpiry throws (falls back to on-chain enforcement)", async ({
    signer,
    token,
    delegateAddress,
  }) => {
    // Simulate RPC failure — sentinel 1n means "assume delegated, skip client check"
    vi.mocked(signer.readContract).mockRejectedValue(new Error("network error"));
    vi.mocked(signer.writeContract).mockResolvedValue(`0x${"ab".repeat(32)}`);
    vi.mocked(signer.waitForTransactionReceipt).mockResolvedValue({} as never);

    const result = await token.revokeDelegation({ delegateAddress });
    expect(result.txHash).toMatch(/^0x/);
    expect(signer.writeContract).toHaveBeenCalled();
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

  it("throws when tokens use different SDK instances", async ({
    createSDK,
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
