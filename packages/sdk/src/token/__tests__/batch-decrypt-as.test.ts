import { describe, expect, test, vi } from "../../test-fixtures";
import { ReadonlyToken } from "../readonly-token";
import { MAX_UINT64 } from "../../contracts/constants";
import type { Address } from "viem";
import type { Handle } from "../../relayer/relayer-sdk.types";
import type { ZamaSDK } from "../../zama-sdk";
import type { ZamaConfig } from "../../config/types";
import type { GenericProvider, GenericSigner } from "../../types";

const TOKEN_A = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as Address;
const TOKEN_B = "0x7A7a7A7a7a7a7a7A7a7a7a7A7a7A7A7A7A7A7a7A" as Address;
const DELEGATOR = "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC" as Address;
const DELEGATE = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as Address;
const HANDLE_A = ("0x" + "a1".repeat(32)) as Handle;
const HANDLE_B = ("0x" + "b2".repeat(32)) as Handle;
const ZERO_HANDLE = ("0x" + "00".repeat(32)) as Handle;

type BatchHarness = {
  provider: GenericProvider;
  tokenA: ReadonlyToken;
  tokenB: ReadonlyToken;
};

function createBatchHarness({
  createMockSigner,
  createMockProvider,
  createSDK,
}: {
  createMockSigner: (address?: Address) => GenericSigner;
  createMockProvider: typeof createMockProvider;
  createSDK: (overrides?: Partial<ZamaConfig>) => ZamaSDK;
}): BatchHarness {
  const delegateSigner = createMockSigner(DELEGATE);
  const provider = createMockProvider();
  const sdk = createSDK({
    signer: delegateSigner,
    provider,
  });

  return {
    provider,
    tokenA: new ReadonlyToken(sdk, TOKEN_A),
    tokenB: new ReadonlyToken(sdk, TOKEN_B),
  };
}

async function expectBatchDecryptFailure(
  promise: Promise<unknown>,
  expectedTokenAddresses: Address[],
) {
  await expect(promise).rejects.toMatchObject({
    code: "DECRYPTION_FAILED",
    message: expect.stringContaining(`${expectedTokenAddresses.length} token(s)`),
  });

  try {
    await promise;
  } catch (error) {
    for (const address of expectedTokenAddresses) {
      expect((error as Error).message).toContain(address);
    }
  }
}

describe("ReadonlyToken.batchDecryptBalancesAs", () => {
  test("decrypts balances for multiple tokens using delegated credentials", async ({
    relayer,
    createMockSigner,
    createMockProvider,
    createSDK,
  }) => {
    const { provider, tokenA, tokenB } = createBatchHarness({
      createMockSigner,
      createMockProvider,
      createSDK,
    });

    vi.mocked(provider.readContract)
      .mockResolvedValueOnce(HANDLE_A)
      .mockResolvedValueOnce(HANDLE_B)
      .mockResolvedValueOnce(MAX_UINT64)
      .mockResolvedValueOnce(MAX_UINT64); // getDelegationExpiry → permanent

    vi.mocked(relayer.delegatedUserDecrypt)
      .mockResolvedValueOnce({ [HANDLE_A]: 100n })
      .mockResolvedValueOnce({ [HANDLE_B]: 200n });

    const balances = await ReadonlyToken.batchDecryptBalancesAs([tokenA, tokenB], {
      delegatorAddress: DELEGATOR,
    });

    expect(balances.get(TOKEN_A)).toBe(100n);
    expect(balances.get(TOKEN_B)).toBe(200n);
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
    createMockProvider,
    createSDK,
  }) => {
    const { provider, tokenA } = createBatchHarness({
      createMockSigner,
      createMockProvider,
      createSDK,
    });

    vi.mocked(provider.readContract).mockResolvedValueOnce(ZERO_HANDLE);

    const balances = await ReadonlyToken.batchDecryptBalancesAs([tokenA], {
      delegatorAddress: DELEGATOR,
    });

    expect(balances.get(TOKEN_A)).toBe(0n);
    expect(relayer.delegatedUserDecrypt).not.toHaveBeenCalled();
    // Pre-flight is skipped only when every handle is zero — zero balances
    // need no authorization — so getDelegationExpiry never calls readContract.
    expect(provider.readContract).toHaveBeenCalledTimes(1);
  });

  test("propagates delegated decrypt failures through the public aggregate error", async ({
    relayer,
    createMockSigner,
    createMockProvider,
    createSDK,
  }) => {
    const { provider, tokenA } = createBatchHarness({
      createMockSigner,
      createMockProvider,
      createSDK,
    });

    vi.mocked(provider.readContract)
      .mockResolvedValueOnce(HANDLE_A)
      .mockResolvedValueOnce(MAX_UINT64);

    vi.mocked(relayer.delegatedUserDecrypt).mockRejectedValue(new Error("decrypt failed"));

    await expectBatchDecryptFailure(
      ReadonlyToken.batchDecryptBalancesAs([tokenA], {
        delegatorAddress: DELEGATOR,
      }),
      [TOKEN_A],
    );
  });

  test("throws aggregated DecryptionFailedError when no delegation exists", async ({
    relayer,
    createMockSigner,
    createMockProvider,
    createSDK,
  }) => {
    const { provider, tokenA } = createBatchHarness({
      createMockSigner,
      createMockProvider,
      createSDK,
    });

    vi.mocked(provider.readContract).mockResolvedValueOnce(HANDLE_A).mockResolvedValueOnce(0n); // getDelegationExpiry → no delegation

    await expectBatchDecryptFailure(
      ReadonlyToken.batchDecryptBalancesAs([tokenA], {
        delegatorAddress: DELEGATOR,
      }),
      [TOKEN_A],
    );
    expect(relayer.delegatedUserDecrypt).not.toHaveBeenCalled();
  });

  test("throws aggregated DecryptionFailedError when delegation has expired", async ({
    relayer,
    createMockSigner,
    createMockProvider,
    createSDK,
  }) => {
    const { provider, tokenA } = createBatchHarness({
      createMockSigner,
      createMockProvider,
      createSDK,
    });

    vi.mocked(provider.readContract).mockResolvedValueOnce(HANDLE_A).mockResolvedValueOnce(1000n); // past timestamp
    vi.mocked(provider.getBlockTimestamp).mockResolvedValue(2000n);

    await expectBatchDecryptFailure(
      ReadonlyToken.batchDecryptBalancesAs([tokenA], {
        delegatorAddress: DELEGATOR,
      }),
      [TOKEN_A],
    );
    expect(relayer.delegatedUserDecrypt).not.toHaveBeenCalled();
  });

  test("batch succeeds when delegation is permanently active", async ({
    relayer,
    createMockSigner,
    createMockProvider,
    createSDK,
  }) => {
    const { provider, tokenA } = createBatchHarness({
      createMockSigner,
      createMockProvider,
      createSDK,
    });

    vi.mocked(provider.readContract)
      .mockResolvedValueOnce(HANDLE_A)
      .mockResolvedValueOnce(MAX_UINT64);

    vi.mocked(relayer.delegatedUserDecrypt).mockResolvedValueOnce({ [HANDLE_A]: 42n });

    const balances = await ReadonlyToken.batchDecryptBalancesAs([tokenA], {
      delegatorAddress: DELEGATOR,
    });

    expect(balances.get(TOKEN_A)).toBe(42n);
    expect(provider.getBlockTimestamp).not.toHaveBeenCalled();
  });

  test("throws when one token fails", async ({
    relayer,
    createMockSigner,
    createMockProvider,
    createSDK,
  }) => {
    const { provider, tokenA, tokenB } = createBatchHarness({
      createMockSigner,
      createMockProvider,
      createSDK,
    });

    vi.mocked(provider.readContract)
      .mockResolvedValueOnce(HANDLE_A)
      .mockResolvedValueOnce(HANDLE_B)
      .mockResolvedValueOnce(MAX_UINT64)
      .mockResolvedValueOnce(MAX_UINT64);

    vi.mocked(relayer.delegatedUserDecrypt)
      .mockRejectedValueOnce(new Error("batch decrypt failed"))
      .mockRejectedValueOnce(new Error("batch decrypt failed"))
      .mockResolvedValueOnce({ [HANDLE_A]: 100n })
      .mockRejectedValueOnce(new Error("decrypt failed"));

    await expectBatchDecryptFailure(
      ReadonlyToken.batchDecryptBalancesAs([tokenA, tokenB], {
        delegatorAddress: DELEGATOR,
        maxConcurrency: 1,
      }),
      [TOKEN_B],
    );
  });

  test("uses onError fallback for failed tokens", async ({
    relayer,
    createMockSigner,
    createMockProvider,
    createSDK,
  }) => {
    const { provider, tokenA, tokenB } = createBatchHarness({
      createMockSigner,
      createMockProvider,
      createSDK,
    });

    vi.mocked(provider.readContract)
      .mockResolvedValueOnce(HANDLE_A)
      .mockResolvedValueOnce(HANDLE_B)
      .mockResolvedValueOnce(MAX_UINT64)
      .mockResolvedValueOnce(MAX_UINT64);

    vi.mocked(relayer.delegatedUserDecrypt)
      .mockRejectedValueOnce(new Error("batch decrypt failed"))
      .mockRejectedValueOnce(new Error("batch decrypt failed"))
      .mockResolvedValueOnce({ [HANDLE_A]: 100n })
      .mockRejectedValueOnce(new Error("decrypt failed"));

    const onError = vi.fn().mockReturnValue(0n);
    const balances = await ReadonlyToken.batchDecryptBalancesAs([tokenA, tokenB], {
      delegatorAddress: DELEGATOR,
      maxConcurrency: 1,
      onError,
    });

    expect(balances.get(TOKEN_A)).toBe(100n);
    expect(balances.get(TOKEN_B)).toBe(0n);
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0]?.[1]).toBe(TOKEN_B);
  });
});
