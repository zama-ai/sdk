import { describe, expect, vi } from "vitest";
import { createMockProvider, test } from "../../test-fixtures";
import { ReadonlyToken } from "../readonly-token";
import { MAX_UINT64 } from "../../contracts/constants";
import type { Address } from "viem";
import type { Handle } from "../../relayer/relayer-sdk.types";
import type { ZamaSDK } from "../../zama-sdk";

const TOKEN_A = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as Address;
const TOKEN_B = "0x7A7a7A7a7a7a7a7A7a7a7a7A7a7A7A7A7A7A7a7A" as Address;
const DELEGATOR = "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC" as Address;
const DELEGATE = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as Address;
const HANDLE_A = ("0x" + "a1".repeat(32)) as Handle;
const HANDLE_B = ("0x" + "b2".repeat(32)) as Handle;

function mockCredsResult(contractAddresses: Address[]) {
  return {
    publicKey: "0xpub",
    privateKey: "0xpriv",
    signature: "0xsig",
    contractAddresses,
    startTimestamp: Math.floor(Date.now() / 1000),
    durationDays: 1,
    delegatorAddress: DELEGATOR,
    delegateAddress: DELEGATE,
  };
}

/**
 * Swap out the SDK's delegated credentials manager with a stub that resolves to
 * the expected contractAddresses, so we don't have to prime the full EIP-712
 * sign flow for every batch test.
 */
function stubDelegatedCredentials(sdk: ZamaSDK, contractAddresses: Address[]) {
  const allowMock = vi.fn().mockResolvedValue(mockCredsResult(contractAddresses));
  Object.defineProperty(sdk, "delegatedCredentials", {
    value: { allow: allowMock },
    configurable: true,
  });
  return allowMock;
}

describe("ReadonlyToken.batchDecryptBalancesAs", () => {
  test("decrypts balances for multiple tokens using delegated credentials", async ({
    sdk,
    relayer,
    signer,
    createMockSigner,
    createSDK,
  }) => {
    // The fixture signer is the connected user; the delegate is DELEGATE
    const delegateSigner = createMockSigner(DELEGATE);
    const delegateSdk = createSDK({
      signer: delegateSigner,
      provider: createMockProvider(delegateSigner),
    });

    vi.mocked(delegateSigner.readContract)
      .mockResolvedValueOnce(HANDLE_A) // confidentialBalanceOf(tokenA)
      .mockResolvedValueOnce(HANDLE_B) // confidentialBalanceOf(tokenB)
      .mockResolvedValueOnce(MAX_UINT64); // getDelegationExpiry → permanent
    vi.mocked(relayer.delegatedUserDecrypt)
      .mockResolvedValueOnce({ [HANDLE_A]: 100n })
      .mockResolvedValueOnce({ [HANDLE_B]: 200n });

    const tokenA = new ReadonlyToken(delegateSdk, TOKEN_A);
    const tokenB = new ReadonlyToken(delegateSdk, TOKEN_B);

    const allowMock = stubDelegatedCredentials(delegateSdk, [TOKEN_A, TOKEN_B]);

    const balances = await ReadonlyToken.batchDecryptBalancesAs([tokenA, tokenB], {
      delegatorAddress: DELEGATOR,
    });

    expect(balances.get(TOKEN_A)).toBe(100n);
    expect(balances.get(TOKEN_B)).toBe(200n);
    expect(allowMock).toHaveBeenCalledOnce();
    expect(allowMock).toHaveBeenCalledWith(DELEGATOR, TOKEN_A, TOKEN_B);
    expect(relayer.delegatedUserDecrypt).toHaveBeenCalledTimes(2);
    // unused but captured so the fixture isn't complained about
    void sdk;
    void signer;
  });

  test("returns empty map for empty token list", async () => {
    const result = await ReadonlyToken.batchDecryptBalancesAs([], {
      delegatorAddress: DELEGATOR,
    });
    expect(result.size).toBe(0);
  });

  test("returns 0n for zero handles without calling relayer", async ({
    relayer,
    createMockSigner,
    createSDK,
  }) => {
    const delegateSigner = createMockSigner(DELEGATE);
    const delegateSdk = createSDK({
      signer: delegateSigner,
      provider: createMockProvider(delegateSigner),
    });
    const ZERO = ("0x" + "00".repeat(32)) as Handle;

    vi.mocked(delegateSigner.readContract).mockResolvedValueOnce(ZERO);

    const token = new ReadonlyToken(delegateSdk, TOKEN_A);

    const balances = await ReadonlyToken.batchDecryptBalancesAs([token], {
      delegatorAddress: DELEGATOR,
    });

    expect(balances.get(TOKEN_A)).toBe(0n);
    expect(relayer.delegatedUserDecrypt).not.toHaveBeenCalled();
    // Pre-flight is skipped only when every handle is zero — zero balances
    // need no authorization — so getDelegationExpiry never calls readContract.
    expect(delegateSigner.readContract).toHaveBeenCalledTimes(1);
  });

  test("runs pre-flight delegation check even when balance is pre-cached", async ({
    relayer,
    createMockSigner,
    createSDK,
  }) => {
    const delegateSigner = createMockSigner(DELEGATE);
    const delegateSdk = createSDK({
      signer: delegateSigner,
      provider: createMockProvider(delegateSigner),
    });
    // Pre-populate cache: ownerAddress = DELEGATOR (default for batchDecryptBalancesAs)
    await delegateSdk.cache.set(DELEGATOR, TOKEN_A, HANDLE_A, 42n);

    vi.mocked(delegateSigner.readContract)
      .mockResolvedValueOnce(HANDLE_A) // confidentialBalanceOf
      .mockResolvedValueOnce(MAX_UINT64); // getDelegationExpiry → permanent

    const token = new ReadonlyToken(delegateSdk, TOKEN_A);

    const balances = await ReadonlyToken.batchDecryptBalancesAs([token], {
      delegatorAddress: DELEGATOR,
    });

    // Delegation check now fires even when the cache resolves everything, so
    // revoked delegations can't leak stale cached values.
    expect(delegateSigner.readContract).toHaveBeenCalledTimes(2);
    expect(relayer.delegatedUserDecrypt).not.toHaveBeenCalled();
    expect(balances.get(TOKEN_A)).toBe(42n);
  });

  test("throws DelegationNotFoundError on cache hit when delegation is revoked", async ({
    relayer,
    createMockSigner,
    createSDK,
  }) => {
    const delegateSigner = createMockSigner(DELEGATE);
    const delegateSdk = createSDK({ signer: delegateSigner });
    await delegateSdk.cache.set(DELEGATOR, TOKEN_A, HANDLE_A, 42n);

    vi.mocked(delegateSigner.readContract)
      .mockResolvedValueOnce(HANDLE_A) // confidentialBalanceOf
      .mockResolvedValueOnce(0n); // getDelegationExpiry → revoked

    const token = new ReadonlyToken(delegateSdk, TOKEN_A);

    await expect(
      ReadonlyToken.batchDecryptBalancesAs([token], {
        delegatorAddress: DELEGATOR,
      }),
    ).rejects.toThrow(expect.objectContaining({ code: "DELEGATION_NOT_FOUND" }));
    expect(relayer.delegatedUserDecrypt).not.toHaveBeenCalled();
  });

  test("calls onError callback when decryption fails for a token", async ({
    relayer,
    createMockSigner,
    createSDK,
  }) => {
    const delegateSigner = createMockSigner(DELEGATE);
    const delegateSdk = createSDK({
      signer: delegateSigner,
      provider: createMockProvider(delegateSigner),
    });

    vi.mocked(delegateSigner.readContract)
      .mockResolvedValueOnce(HANDLE_A)
      .mockResolvedValueOnce(MAX_UINT64);
    vi.mocked(relayer.delegatedUserDecrypt).mockRejectedValueOnce(new Error("decrypt failed"));

    const token = new ReadonlyToken(delegateSdk, TOKEN_A);
    stubDelegatedCredentials(delegateSdk, [TOKEN_A]);
    const onError = vi.fn().mockReturnValue(0n);

    const balances = await ReadonlyToken.batchDecryptBalancesAs([token], {
      delegatorAddress: DELEGATOR,
      onError,
    });

    expect(balances.get(TOKEN_A)).toBe(0n);
    expect(onError).toHaveBeenCalledOnce();
  });

  test("throws DelegationNotFoundError when no delegation exists", async ({
    relayer,
    createMockSigner,
    createSDK,
  }) => {
    const delegateSigner = createMockSigner(DELEGATE);
    const delegateSdk = createSDK({
      signer: delegateSigner,
      provider: createMockProvider(delegateSigner),
    });

    vi.mocked(delegateSigner.readContract)
      .mockResolvedValueOnce(HANDLE_A) // confidentialBalanceOf → non-zero, goes to uncached
      .mockResolvedValueOnce(0n); // getDelegationExpiry → no delegation

    const token = new ReadonlyToken(delegateSdk, TOKEN_A);

    await expect(
      ReadonlyToken.batchDecryptBalancesAs([token], {
        delegatorAddress: DELEGATOR,
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        code: "DELEGATION_NOT_FOUND",
        message: expect.stringContaining(TOKEN_A),
      }),
    );
    expect(relayer.delegatedUserDecrypt).not.toHaveBeenCalled();
  });

  test("throws DelegationExpiredError when delegation has expired", async ({
    relayer,
    createMockSigner,
    createSDK,
  }) => {
    const delegateSigner = createMockSigner(DELEGATE);
    const delegateSdk = createSDK({
      signer: delegateSigner,
      provider: createMockProvider(delegateSigner),
    });

    vi.mocked(delegateSigner.readContract)
      .mockResolvedValueOnce(HANDLE_A)
      .mockResolvedValueOnce(1000n); // past timestamp
    vi.mocked(delegateSigner.getBlockTimestamp).mockResolvedValue(2000n);

    const token = new ReadonlyToken(delegateSdk, TOKEN_A);

    await expect(
      ReadonlyToken.batchDecryptBalancesAs([token], {
        delegatorAddress: DELEGATOR,
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        code: "DELEGATION_EXPIRED",
        message: expect.stringContaining(TOKEN_A),
      }),
    );
    expect(relayer.delegatedUserDecrypt).not.toHaveBeenCalled();
  });

  test("batch succeeds when delegation is permanently active", async ({
    relayer,
    createMockSigner,
    createSDK,
  }) => {
    const delegateSigner = createMockSigner(DELEGATE);
    const delegateSdk = createSDK({
      signer: delegateSigner,
      provider: createMockProvider(delegateSigner),
    });

    vi.mocked(delegateSigner.readContract)
      .mockResolvedValueOnce(HANDLE_A)
      .mockResolvedValueOnce(MAX_UINT64);
    vi.mocked(relayer.delegatedUserDecrypt).mockResolvedValueOnce({ [HANDLE_A]: 42n });

    const token = new ReadonlyToken(delegateSdk, TOKEN_A);
    stubDelegatedCredentials(delegateSdk, [TOKEN_A]);

    const balances = await ReadonlyToken.batchDecryptBalancesAs([token], {
      delegatorAddress: DELEGATOR,
    });

    expect(balances.get(TOKEN_A)).toBe(42n);
    expect(delegateSigner.getBlockTimestamp).not.toHaveBeenCalled();
  });

  test("catches errors thrown by onError callback and aggregates them", async ({
    relayer,
    createMockSigner,
    createSDK,
  }) => {
    const delegateSigner = createMockSigner(DELEGATE);
    const delegateSdk = createSDK({
      signer: delegateSigner,
      provider: createMockProvider(delegateSigner),
    });

    vi.mocked(delegateSigner.readContract)
      .mockResolvedValueOnce(HANDLE_A)
      .mockResolvedValueOnce(MAX_UINT64);
    vi.mocked(relayer.delegatedUserDecrypt).mockRejectedValueOnce(new Error("decrypt failed"));

    const token = new ReadonlyToken(delegateSdk, TOKEN_A);
    stubDelegatedCredentials(delegateSdk, [TOKEN_A]);

    const throwingOnError = vi.fn().mockImplementation(() => {
      throw new Error("callback exploded");
    });

    await expect(
      ReadonlyToken.batchDecryptBalancesAs([token], {
        delegatorAddress: DELEGATOR,
        onError: throwingOnError,
      }),
    ).rejects.toThrow("callback exploded");
  });

  test("succeeds even when cache write fails", async ({
    relayer,
    createMockSigner,
    createSDK,
    createMockStorage,
  }) => {
    const delegateSigner = createMockSigner(DELEGATE);
    const storage = createMockStorage();
    const delegateSdk = createSDK({
      signer: delegateSigner,
      provider: createMockProvider(delegateSigner),
      storage,
    });

    vi.mocked(delegateSigner.readContract)
      .mockResolvedValueOnce(HANDLE_A)
      .mockResolvedValueOnce(MAX_UINT64);
    vi.mocked(relayer.delegatedUserDecrypt).mockResolvedValueOnce({ [HANDLE_A]: 99n });

    const token = new ReadonlyToken(delegateSdk, TOKEN_A);
    stubDelegatedCredentials(delegateSdk, [TOKEN_A]);

    // Sabotage the storage so any cache write fails — decrypt should still succeed.
    vi.spyOn(storage, "set").mockRejectedValue(new Error("storage full"));

    const balances = await ReadonlyToken.batchDecryptBalancesAs([token], {
      delegatorAddress: DELEGATOR,
    });

    expect(balances.get(TOKEN_A)).toBe(99n);
  });
});
