import { describe, expect, test, vi } from "../../test-fixtures";
import { Token } from "../token";
import { MAX_UINT64 } from "../../contracts/constants";
import type { Address } from "viem";
import type { EncryptedValue } from "../../relayer/relayer-sdk.types";
import type { ZamaSDK } from "../../zama-sdk";

const TOKEN_A = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as Address;
const TOKEN_B = "0x7A7a7A7a7a7a7a7A7a7a7a7A7a7A7A7A7A7A7a7A" as Address;
const DELEGATOR = "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC" as Address;
const DELEGATE = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as Address;
const HANDLE_A = ("0x" + "a1".repeat(32)) as EncryptedValue;
const HANDLE_B = ("0x" + "b2".repeat(32)) as EncryptedValue;

/**
 * Swap out the SDK's delegated batch decrypt call so these tests can focus on
 * Token batching without priming the full EIP-712 sign flow.
 */
function stubDelegatedBatchDecrypt(sdk: ZamaSDK, values: Record<EncryptedValue, bigint>) {
  const stub = vi.fn().mockImplementation(
    async ({
      encryptedInputs,
    }: {
      encryptedInputs: {
        encryptedValue: EncryptedValue;
        contractAddress: Address;
      }[];
    }) => ({
      items: encryptedInputs.map(({ encryptedValue, contractAddress }) => {
        const value = values[encryptedValue];
        return value !== undefined
          ? { encryptedValue, contractAddress, value }
          : {
              encryptedValue,
              contractAddress,
              error: new Error(`No value for ${encryptedValue}`),
            };
      }),
    }),
  );
  Object.defineProperty(sdk.decryption, "delegatedBatchDecryptValues", {
    value: stub,
    configurable: true,
  });
  return stub;
}

describe("Token.batchDecryptBalancesAs", () => {
  test("decrypts balances for multiple tokens using delegated credentials", async ({
    relayer,
    createMockSigner,
    createMockProvider,
    createSDK,
  }) => {
    const delegateSigner = createMockSigner(DELEGATE);
    const delegateProvider = createMockProvider();
    const delegateSdk = createSDK({
      signer: delegateSigner,
      provider: delegateProvider,
    });

    vi.mocked(delegateProvider.readContract)
      .mockResolvedValueOnce(HANDLE_A) // confidentialBalanceOf(tokenA)
      .mockResolvedValueOnce(HANDLE_B) // confidentialBalanceOf(tokenB)
      .mockResolvedValueOnce(MAX_UINT64); // getDelegationExpiry → permanent
    vi.mocked(relayer.delegatedUserDecrypt)
      .mockResolvedValueOnce({ [HANDLE_A]: 100n })
      .mockResolvedValueOnce({ [HANDLE_B]: 200n });

    const tokenA = new Token(delegateSdk, TOKEN_A);
    const tokenB = new Token(delegateSdk, TOKEN_B);

    vi.mocked(relayer.delegatedUserDecrypt)
      .mockResolvedValueOnce({ [HANDLE_A]: 100n })
      .mockResolvedValueOnce({ [HANDLE_B]: 200n });

    const balances = await Token.batchDecryptBalancesAs([tokenA, tokenB], {
      delegatorAddress: DELEGATOR,
    });

    expect(balances.get(TOKEN_A)).toBe(100n);
    expect(balances.get(TOKEN_B)).toBe(200n);
  });

  test("returns empty map for empty token list", async () => {
    const result = await Token.batchDecryptBalancesAs([], {
      delegatorAddress: DELEGATOR,
    });
    expect(result.size).toBe(0);
  });

  test("returns 0n for zero handles without calling relayer", async ({
    relayer,
    createMockSigner,
    createMockProvider,
    createSDK,
  }) => {
    const delegateSigner = createMockSigner(DELEGATE);
    const delegateProvider = createMockProvider();
    const delegateSdk = createSDK({
      signer: delegateSigner,
      provider: delegateProvider,
    });
    const ZERO = ("0x" + "00".repeat(32)) as EncryptedValue;

    vi.mocked(delegateProvider.readContract).mockResolvedValueOnce(ZERO);

    const token = new Token(delegateSdk, TOKEN_A);

    const balances = await Token.batchDecryptBalancesAs([token], {
      delegatorAddress: DELEGATOR,
    });

    expect(balances.get(TOKEN_A)).toBe(0n);
    expect(relayer.delegatedUserDecrypt).not.toHaveBeenCalled();
    // Pre-flight is skipped only when every handle is zero — zero balances
    // need no authorization — so getDelegationExpiry never calls readContract.
    expect(delegateProvider.readContract).toHaveBeenCalledTimes(1);
  });

  test("runs pre-flight delegation check even when balance is pre-cached", async ({
    relayer,
    createMockSigner,
    createMockProvider,
    createSDK,
    cachingService,
  }) => {
    const delegateSigner = createMockSigner(DELEGATE);
    const delegateProvider = createMockProvider();
    const delegateSdk = createSDK({
      signer: delegateSigner,
      provider: delegateProvider,
    });
    // Pre-populate cache via shared storage: ownerAddress = DELEGATOR
    await cachingService.set(DELEGATOR, TOKEN_A, HANDLE_A, 42n);

    vi.mocked(delegateProvider.readContract)
      .mockResolvedValueOnce(HANDLE_A) // confidentialBalanceOf
      .mockResolvedValueOnce(MAX_UINT64); // getDelegationExpiry → permanent

    const token = new Token(delegateSdk, TOKEN_A);

    const balances = await Token.batchDecryptBalancesAs([token], {
      delegatorAddress: DELEGATOR,
    });

    // Delegation check now fires even when the cache resolves everything, so
    // revoked delegations can't leak stale cached values.
    expect(delegateProvider.readContract).toHaveBeenCalledTimes(2);
    expect(relayer.delegatedUserDecrypt).not.toHaveBeenCalled();
    expect(balances.get(TOKEN_A)).toBe(42n);
  });

  test("throws aggregated DecryptionFailedError on cache hit when delegation is revoked", async ({
    relayer,
    createMockSigner,
    createMockProvider,
    createSDK,
    cachingService,
  }) => {
    const delegateSigner = createMockSigner(DELEGATE);
    const delegateProvider = createMockProvider();
    const delegateSdk = createSDK({
      signer: delegateSigner,
      provider: delegateProvider,
    });
    await cachingService.set(DELEGATOR, TOKEN_A, HANDLE_A, 42n);

    vi.mocked(delegateProvider.readContract)
      .mockResolvedValueOnce(HANDLE_A) // confidentialBalanceOf
      .mockResolvedValueOnce(0n); // getDelegationExpiry → revoked

    const token = new Token(delegateSdk, TOKEN_A);

    await expect(
      Token.batchDecryptBalancesAs([token], {
        delegatorAddress: DELEGATOR,
      }),
    ).rejects.toMatchObject({
      code: "DECRYPTION_FAILED",
      message: expect.stringContaining(TOKEN_A),
      cause: expect.objectContaining({ code: "DELEGATION_NOT_FOUND" }),
    });
    expect(relayer.delegatedUserDecrypt).not.toHaveBeenCalled();
  });

  test("calls onError callback when decryption fails for a token", async ({
    createMockSigner,
    createMockProvider,
    createSDK,
  }) => {
    const delegateSigner = createMockSigner(DELEGATE);
    const delegateProvider = createMockProvider();
    const delegateSdk = createSDK({
      signer: delegateSigner,
      provider: delegateProvider,
    });

    vi.mocked(delegateProvider.readContract)
      .mockResolvedValueOnce(HANDLE_A)
      .mockResolvedValueOnce(MAX_UINT64);

    const token = new Token(delegateSdk, TOKEN_A);
    stubDelegatedBatchDecrypt(delegateSdk, {});
    const onError = vi.fn().mockReturnValue(0n);

    const balances = await Token.batchDecryptBalancesAs([token], {
      delegatorAddress: DELEGATOR,
      onError,
    });

    expect(balances.get(TOKEN_A)).toBe(0n);
    expect(onError).toHaveBeenCalledOnce();
  });

  test("throws aggregated DecryptionFailedError when no delegation exists", async ({
    relayer,
    createMockSigner,
    createMockProvider,
    createSDK,
  }) => {
    const delegateSigner = createMockSigner(DELEGATE);
    const delegateProvider = createMockProvider();
    const delegateSdk = createSDK({
      signer: delegateSigner,
      provider: delegateProvider,
    });

    vi.mocked(delegateProvider.readContract)
      .mockResolvedValueOnce(HANDLE_A) // confidentialBalanceOf → non-zero, goes to uncached
      .mockResolvedValueOnce(0n); // getDelegationExpiry → no delegation

    const token = new Token(delegateSdk, TOKEN_A);

    await expect(
      Token.batchDecryptBalancesAs([token], {
        delegatorAddress: DELEGATOR,
      }),
    ).rejects.toMatchObject({
      code: "DECRYPTION_FAILED",
      message: expect.stringContaining(TOKEN_A),
      cause: expect.objectContaining({ code: "DELEGATION_NOT_FOUND" }),
    });
    expect(relayer.delegatedUserDecrypt).not.toHaveBeenCalled();
  });

  test("throws aggregated DecryptionFailedError when delegation has expired", async ({
    relayer,
    createMockSigner,
    createMockProvider,
    createSDK,
  }) => {
    const delegateSigner = createMockSigner(DELEGATE);
    const delegateProvider = createMockProvider();
    const delegateSdk = createSDK({
      signer: delegateSigner,
      provider: delegateProvider,
    });

    vi.mocked(delegateProvider.readContract)
      .mockResolvedValueOnce(HANDLE_A)
      .mockResolvedValueOnce(1000n); // past timestamp
    vi.mocked(delegateProvider.getBlockTimestamp).mockResolvedValue(2000n);

    const token = new Token(delegateSdk, TOKEN_A);

    await expect(
      Token.batchDecryptBalancesAs([token], {
        delegatorAddress: DELEGATOR,
      }),
    ).rejects.toMatchObject({
      code: "DECRYPTION_FAILED",
      message: expect.stringContaining(TOKEN_A),
      cause: expect.objectContaining({ code: "DELEGATION_EXPIRED" }),
    });
    expect(relayer.delegatedUserDecrypt).not.toHaveBeenCalled();
  });

  test("batch succeeds when delegation is permanently active", async ({
    createMockSigner,
    createMockProvider,
    createSDK,
  }) => {
    const delegateSigner = createMockSigner(DELEGATE);
    const delegateProvider = createMockProvider();
    const delegateSdk = createSDK({
      signer: delegateSigner,
      provider: delegateProvider,
    });

    vi.mocked(delegateProvider.readContract)
      .mockResolvedValueOnce(HANDLE_A)
      .mockResolvedValueOnce(MAX_UINT64);

    const token = new Token(delegateSdk, TOKEN_A);
    stubDelegatedBatchDecrypt(delegateSdk, { [HANDLE_A]: 42n });

    const balances = await Token.batchDecryptBalancesAs([token], {
      delegatorAddress: DELEGATOR,
    });

    expect(balances.get(TOKEN_A)).toBe(42n);
    expect(delegateProvider.getBlockTimestamp).not.toHaveBeenCalled();
  });

  test("catches errors thrown by onError callback and aggregates them", async ({
    createMockSigner,
    createMockProvider,
    createSDK,
  }) => {
    const delegateSigner = createMockSigner(DELEGATE);
    const delegateProvider = createMockProvider();
    const delegateSdk = createSDK({
      signer: delegateSigner,
      provider: delegateProvider,
    });

    vi.mocked(delegateProvider.readContract)
      .mockResolvedValueOnce(HANDLE_A)
      .mockResolvedValueOnce(MAX_UINT64);

    const token = new Token(delegateSdk, TOKEN_A);
    stubDelegatedBatchDecrypt(delegateSdk, {});

    const throwingOnError = vi.fn().mockImplementation(() => {
      throw new Error("callback exploded");
    });

    await expect(
      Token.batchDecryptBalancesAs([token], {
        delegatorAddress: DELEGATOR,
        onError: throwingOnError,
      }),
    ).rejects.toThrow("callback exploded");
  });

  test("succeeds even when cache write fails", async ({
    createMockSigner,
    createMockProvider,
    createSDK,
    createMockStorage,
  }) => {
    const delegateSigner = createMockSigner(DELEGATE);
    const delegateProvider = createMockProvider();
    const storage = createMockStorage();
    const delegateSdk = createSDK({
      signer: delegateSigner,
      provider: delegateProvider,
      storage,
    });

    vi.mocked(delegateProvider.readContract)
      .mockResolvedValueOnce(HANDLE_A)
      .mockResolvedValueOnce(MAX_UINT64);

    const token = new Token(delegateSdk, TOKEN_A);
    stubDelegatedBatchDecrypt(delegateSdk, { [HANDLE_A]: 99n });

    // Sabotage the storage so any cache write fails — decrypt should still succeed.
    vi.spyOn(storage, "set").mockRejectedValue(new Error("storage full"));

    const balances = await Token.batchDecryptBalancesAs([token], {
      delegatorAddress: DELEGATOR,
    });

    expect(balances.get(TOKEN_A)).toBe(99n);
  });
});
