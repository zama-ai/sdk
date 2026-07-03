import { getAddress, type Address } from "viem";
import { MAX_UINT64 } from "../../contracts";
import { DelegationNotPropagatedError, NotEntitledError, RpcRateLimitError } from "../../errors";
import type { EncryptedInput } from "../../query/user-decrypt";
import type { EncryptedValue } from "../../relayer/relayer-sdk.types";
import { describe, expect, test, vi } from "../../test-fixtures";
import { LoggerService } from "../logger-service";

const TEST_PUBLIC_KEY = `0x${"11".repeat(32)}` as const;
import { CachingService } from "../caching-service";

const CONTRACT_A = getAddress("0x3333333333333333333333333333333333333333") as Address;
const CONTRACT_B = getAddress("0x4444444444444444444444444444444444444444") as Address;
const HANDLE_A = `0x${"aa".repeat(32)}` as EncryptedValue;
const HANDLE_B = `0x${"bb".repeat(32)}` as EncryptedValue;
const ZERO_ENCRYPTED_VALUE = `0x${"00".repeat(32)}` as EncryptedValue;

function handles(items: Array<[EncryptedValue, Address]>): EncryptedInput[] {
  return items.map(([encryptedValue, contractAddress]) => ({ encryptedValue, contractAddress }));
}

describe("DecryptionService", () => {
  test("userDecrypt returns zero handles without credentials or relayer calls", async ({
    decryptionService,
    relayer,
    userAddress,
  }) => {
    await expect(
      decryptionService.userDecrypt(handles([[ZERO_ENCRYPTED_VALUE, CONTRACT_A]]), userAddress),
    ).resolves.toEqual({ [ZERO_ENCRYPTED_VALUE]: 0n });
    expect(relayer.createEIP712).not.toHaveBeenCalled();
    expect(relayer.userDecrypt).not.toHaveBeenCalled();
  });

  test("userDecrypt decrypts uncached handles grouped by contract and writes cache", async ({
    cachingService,
    createDecryptionService,
    relayer,
    userAddress,
    events,
  }) => {
    const emitEvent = vi.fn();
    const service = createDecryptionService({ emitEvent });
    vi.mocked(relayer.userDecrypt)
      .mockResolvedValueOnce({ [HANDLE_A]: 10n })
      .mockResolvedValueOnce({ [HANDLE_B]: 20n });

    const result = await service.userDecrypt(
      handles([
        [HANDLE_A, CONTRACT_A],
        [HANDLE_B, CONTRACT_B],
      ]),
      userAddress,
    );

    expect(result).toEqual({ [HANDLE_A]: 10n, [HANDLE_B]: 20n });
    await expect(cachingService.get(userAddress, CONTRACT_A, HANDLE_A)).resolves.toBe(10n);
    await expect(cachingService.get(userAddress, CONTRACT_B, HANDLE_B)).resolves.toBe(20n);
    expect(relayer.userDecrypt).toHaveBeenCalledWith(
      expect.objectContaining({ encryptedValues: [HANDLE_A], contractAddress: CONTRACT_A }),
    );
    expect(relayer.userDecrypt).toHaveBeenCalledWith(
      expect.objectContaining({ encryptedValues: [HANDLE_B], contractAddress: CONTRACT_B }),
    );
    expect(emitEvent).toHaveBeenCalledWith(expect.objectContaining({ type: events.DecryptStart }));
    expect(emitEvent).toHaveBeenCalledWith(expect.objectContaining({ type: events.DecryptEnd }));
  });

  test("userDecrypt serves cached values without prompting for credentials", async ({
    cachingService,
    decryptionService,
    relayer,
    userAddress,
  }) => {
    await cachingService.set(userAddress, CONTRACT_A, HANDLE_A, 42n);

    await expect(
      decryptionService.userDecrypt(handles([[HANDLE_A, CONTRACT_A]]), userAddress),
    ).resolves.toEqual({ [HANDLE_A]: 42n });
    expect(relayer.createEIP712).not.toHaveBeenCalled();
    expect(relayer.userDecrypt).not.toHaveBeenCalled();
  });

  test("userDecrypt resolves credentials against all contracts including zero handles", async ({
    decryptionService,
    relayer,
    userAddress,
  }) => {
    vi.mocked(relayer.userDecrypt).mockResolvedValue({ [HANDLE_B]: 20n });

    await expect(
      decryptionService.userDecrypt(
        handles([
          [ZERO_ENCRYPTED_VALUE, CONTRACT_A],
          [HANDLE_B, CONTRACT_B],
        ]),
        userAddress,
      ),
    ).resolves.toEqual({ [ZERO_ENCRYPTED_VALUE]: 0n, [HANDLE_B]: 20n });

    expect(relayer.createEIP712).toHaveBeenCalledWith(
      TEST_PUBLIC_KEY,
      [CONTRACT_A, CONTRACT_B],
      expect.anything(),
      expect.any(Number),
    );
    expect(relayer.userDecrypt).toHaveBeenCalledWith(
      expect.objectContaining({ encryptedValues: [HANDLE_B], contractAddress: CONTRACT_B }),
    );
  });

  test("delegatedUserDecrypt validates delegation before returning cached values", async ({
    cachingService,
    decryptionService,
    provider,
    relayer,
    delegatorAddress,
    delegateAddress,
    userAddress,
  }) => {
    await cachingService.set(userAddress, CONTRACT_A, HANDLE_A, 42n);
    vi.mocked(provider.readContract).mockResolvedValue(MAX_UINT64);

    await expect(
      decryptionService.delegatedUserDecrypt(
        handles([[HANDLE_A, CONTRACT_A]]),
        delegatorAddress,
        delegateAddress,
        userAddress,
      ),
    ).resolves.toEqual({ [HANDLE_A]: 42n });
    expect(relayer.delegatedUserDecrypt).not.toHaveBeenCalled();
  });

  test("delegatedUserDecrypt fails fast when delegation is inactive", async ({
    decryptionService,
    provider,
    relayer,
    delegatorAddress,
    delegateAddress,
    userAddress,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValue(0n);

    await expect(
      decryptionService.delegatedUserDecrypt(
        handles([[HANDLE_A, CONTRACT_A]]),
        delegatorAddress,
        delegateAddress,
        userAddress,
      ),
    ).rejects.toMatchObject({ code: "DELEGATION_NOT_FOUND" });
    expect(relayer.createDelegatedUserDecryptEIP712).not.toHaveBeenCalled();
    expect(relayer.delegatedUserDecrypt).not.toHaveBeenCalled();
  });

  test("delegatedBatchDecryptHandlesAs isolates per-handle failures after batch failure", async ({
    decryptionService,
    provider,
    relayer,
    delegatorAddress,
    delegateAddress,
    userAddress,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValue(MAX_UINT64);
    vi.mocked(relayer.createDelegatedUserDecryptEIP712).mockResolvedValue({
      domain: { name: "test", version: "1", chainId: 1, verifyingContract: "0xkms" },
      types: { DelegatedUserDecryptRequestVerification: [] },
      message: {
        publicKey: TEST_PUBLIC_KEY,
        contractAddresses: [CONTRACT_A],
        delegatorAddress,
        startTimestamp: 1000n,
        durationDays: 1n,
        extraData: "0x",
      },
    } as never);
    vi.mocked(relayer.delegatedUserDecrypt)
      .mockRejectedValueOnce(new Error("batch failed"))
      .mockRejectedValueOnce(new Error("batch failed"))
      .mockResolvedValueOnce({ [HANDLE_A]: 10n })
      .mockRejectedValueOnce(new Error("handle failed"));

    const result = await decryptionService.delegatedBatchDecryptHandlesAs({
      encryptedInputs: handles([
        [HANDLE_A, CONTRACT_A],
        [HANDLE_B, CONTRACT_B],
      ]),
      delegatorAddress,
      delegateAddress,
      accountAddress: userAddress,
      maxConcurrency: 1,
    });

    expect(result.items).toEqual([
      { encryptedValue: HANDLE_A, contractAddress: CONTRACT_A, value: 10n },
      {
        encryptedValue: HANDLE_B,
        contractAddress: CONTRACT_B,
        error: expect.objectContaining({ code: "DECRYPTION_FAILED" }),
      },
    ]);
  });

  test("delegatedBatchDecryptHandlesAs records missing non-zero relayer values as item errors", async ({
    decryptionService,
    provider,
    relayer,
    delegatorAddress,
    delegateAddress,
    userAddress,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValue(MAX_UINT64);
    vi.mocked(relayer.delegatedUserDecrypt).mockResolvedValue({});

    const result = await decryptionService.delegatedBatchDecryptHandlesAs({
      encryptedInputs: handles([[HANDLE_A, CONTRACT_A]]),
      delegatorAddress,
      delegateAddress,
      accountAddress: userAddress,
    });

    expect(result.items).toEqual([
      {
        encryptedValue: HANDLE_A,
        contractAddress: CONTRACT_A,
        error: expect.objectContaining({ code: "DECRYPTION_FAILED" }),
      },
    ]);
  });

  test("cache write failures do not fail a successful decrypt", async ({
    createDecryptionService,
    createMockStorage,
    relayer,
    userAddress,
  }) => {
    const storage = createMockStorage();
    storage.set = async () => {
      throw new Error("cache unavailable");
    };
    const service = createDecryptionService({
      cache: new CachingService(storage, new LoggerService()),
    });
    vi.mocked(relayer.userDecrypt).mockResolvedValue({ [HANDLE_A]: 10n });

    await expect(
      service.userDecrypt(handles([[HANDLE_A, CONTRACT_A]]), userAddress),
    ).resolves.toEqual({ [HANDLE_A]: 10n });
  });

  describe("RPC rate-limit classification (SDK-239)", () => {
    test("delegatedUserDecrypt throws RpcRateLimitError when a delegation pre-check read is rate-limited", async ({
      decryptionService,
      provider,
      relayer,
      delegatorAddress,
      delegateAddress,
      userAddress,
    }) => {
      const rpcError = Object.assign(new Error("Too Many Requests"), { code: -32005 });
      vi.mocked(provider.readContract).mockRejectedValue(rpcError);

      await expect(
        decryptionService.delegatedUserDecrypt(
          handles([[HANDLE_A, CONTRACT_A]]),
          delegatorAddress,
          delegateAddress,
          userAddress,
        ),
      ).rejects.toBeInstanceOf(RpcRateLimitError);
      expect(relayer.delegatedUserDecrypt).not.toHaveBeenCalled();
    });

    test("maps the relayer's not-entitled failure on the delegated path to transient DelegationNotPropagatedError", async ({
      decryptionService,
      provider,
      relayer,
      delegatorAddress,
      delegateAddress,
      userAddress,
    }) => {
      vi.mocked(provider.readContract).mockResolvedValue(MAX_UINT64);
      vi.mocked(relayer.createDelegatedUserDecryptEIP712).mockResolvedValue({
        domain: { name: "test", version: "1", chainId: 1, verifyingContract: "0xkms" },
        types: { DelegatedUserDecryptRequestVerification: [] },
        message: {
          publicKey: TEST_PUBLIC_KEY,
          contractAddresses: [CONTRACT_A],
          delegatorAddress,
          startTimestamp: 1000n,
          durationDays: 1n,
          extraData: "0x",
        },
      } as never);
      // The relayer's ACL gate throws a message-only Error; after the worker
      // boundary only the message survives. On the delegated path that verdict
      // comes from the *delegator's* `persistAllowed` L1 read, which is false
      // transiently under propagation lag — so it is surfaced as the retryable
      // DelegationNotPropagatedError, not the terminal NotEntitledError used for a
      // direct signer denial.
      vi.mocked(relayer.delegatedUserDecrypt).mockRejectedValue(
        new Error(
          `User address ${delegatorAddress} is not authorized to user decrypt handle ${HANDLE_A}!`,
        ),
      );

      const error = await decryptionService
        .delegatedUserDecrypt(
          handles([[HANDLE_A, CONTRACT_A]]),
          delegatorAddress,
          delegateAddress,
          userAddress,
          // Assert the mapping only — opt out of the propagation retry so the
          // first not-propagated response surfaces immediately.
          { waitForPropagation: false },
        )
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(DelegationNotPropagatedError);
      expect(error).not.toBeInstanceOf(NotEntitledError);
    });

    const notPropagatedEip712 = (delegatorAddress: Address) =>
      ({
        domain: { name: "test", version: "1", chainId: 1, verifyingContract: "0xkms" },
        types: { DelegatedUserDecryptRequestVerification: [] },
        message: {
          publicKey: TEST_PUBLIC_KEY,
          contractAddresses: [CONTRACT_A],
          delegatorAddress,
          startTimestamp: 1000n,
          durationDays: 1n,
          extraData: "0x",
        },
      }) as never;

    test("delegatedUserDecrypt rides out the propagation window and resolves once the delegation syncs", async ({
      decryptionService,
      provider,
      relayer,
      delegatorAddress,
      delegateAddress,
      userAddress,
    }) => {
      vi.useFakeTimers();
      try {
        vi.mocked(provider.readContract).mockResolvedValue(MAX_UINT64);
        vi.mocked(relayer.createDelegatedUserDecryptEIP712).mockResolvedValue(
          notPropagatedEip712(delegatorAddress),
        );
        const notPropagated = new Error(
          `User address ${delegatorAddress} is not authorized to user decrypt handle ${HANDLE_A}!`,
        );
        vi.mocked(relayer.delegatedUserDecrypt)
          .mockRejectedValueOnce(notPropagated)
          .mockRejectedValueOnce(notPropagated)
          .mockResolvedValueOnce({ [HANDLE_A]: 7n });

        const promise = decryptionService.delegatedUserDecrypt(
          handles([[HANDLE_A, CONTRACT_A]]),
          delegatorAddress,
          delegateAddress,
          userAddress,
        );
        // Two 2s retries, then success on the third attempt.
        await vi.advanceTimersByTimeAsync(4000);

        await expect(promise).resolves.toEqual({ [HANDLE_A]: 7n });
        expect(relayer.delegatedUserDecrypt).toHaveBeenCalledTimes(3);
      } finally {
        vi.useRealTimers();
      }
    });

    test("delegatedUserDecrypt gives up with DelegationNotPropagatedError after the retry budget", async ({
      decryptionService,
      provider,
      relayer,
      delegatorAddress,
      delegateAddress,
      userAddress,
    }) => {
      vi.useFakeTimers();
      try {
        vi.mocked(provider.readContract).mockResolvedValue(MAX_UINT64);
        vi.mocked(relayer.createDelegatedUserDecryptEIP712).mockResolvedValue(
          notPropagatedEip712(delegatorAddress),
        );
        vi.mocked(relayer.delegatedUserDecrypt).mockRejectedValue(
          new Error(
            `User address ${delegatorAddress} is not authorized to user decrypt handle ${HANDLE_A}!`,
          ),
        );

        const settled = decryptionService
          .delegatedUserDecrypt(
            handles([[HANDLE_A, CONTRACT_A]]),
            delegatorAddress,
            delegateAddress,
            userAddress,
          )
          .catch((e: unknown) => e);
        // Exhaust the ~30s budget.
        await vi.advanceTimersByTimeAsync(30_000);

        expect(await settled).toBeInstanceOf(DelegationNotPropagatedError);
        // It retried rather than giving up on the first response.
        expect(vi.mocked(relayer.delegatedUserDecrypt).mock.calls.length).toBeGreaterThan(1);
      } finally {
        vi.useRealTimers();
      }
    });

    test("delegatedUserDecrypt with waitForPropagation:false fails fast on the first response", async ({
      decryptionService,
      provider,
      relayer,
      delegatorAddress,
      delegateAddress,
      userAddress,
    }) => {
      vi.mocked(provider.readContract).mockResolvedValue(MAX_UINT64);
      vi.mocked(relayer.createDelegatedUserDecryptEIP712).mockResolvedValue(
        notPropagatedEip712(delegatorAddress),
      );
      vi.mocked(relayer.delegatedUserDecrypt).mockRejectedValue(
        new Error(
          `User address ${delegatorAddress} is not authorized to user decrypt handle ${HANDLE_A}!`,
        ),
      );

      await expect(
        decryptionService.delegatedUserDecrypt(
          handles([[HANDLE_A, CONTRACT_A]]),
          delegatorAddress,
          delegateAddress,
          userAddress,
          { waitForPropagation: false },
        ),
      ).rejects.toBeInstanceOf(DelegationNotPropagatedError);
      expect(relayer.delegatedUserDecrypt).toHaveBeenCalledTimes(1);
    });

    test("delegatedBatchDecryptHandlesAs aborts on RpcRateLimitError instead of per-item retry", async ({
      decryptionService,
      provider,
      relayer,
      delegatorAddress,
      delegateAddress,
      userAddress,
    }) => {
      vi.mocked(provider.readContract).mockRejectedValue(
        Object.assign(new Error("Too Many Requests"), { code: -32005 }),
      );

      await expect(
        decryptionService.delegatedBatchDecryptHandlesAs({
          encryptedInputs: handles([
            [HANDLE_A, CONTRACT_A],
            [HANDLE_B, CONTRACT_B],
          ]),
          delegatorAddress,
          delegateAddress,
          accountAddress: userAddress,
          maxConcurrency: 1,
        }),
      ).rejects.toBeInstanceOf(RpcRateLimitError);
      expect(relayer.delegatedUserDecrypt).not.toHaveBeenCalled();
    });

    test("a fatal error in the per-item fallback short-circuits the still-queued items", async ({
      decryptionService,
      provider,
      relayer,
      delegatorAddress,
      delegateAddress,
      userAddress,
    }) => {
      // 3 handles, concurrency 2: the bulk attempt fails non-fatally (so we fall
      // into the per-item loop), then the first per-item worker hits a fatal
      // RpcRateLimitError. Without the shared abort flag the freed worker would
      // pick up the third item and re-hit the throttled relayer; we assert it
      // does not.
      const CONTRACT_C = getAddress("0x5555555555555555555555555555555555555555") as Address;
      const HANDLE_C = `0x${"cc".repeat(32)}` as EncryptedValue;
      vi.mocked(provider.readContract).mockResolvedValue(MAX_UINT64);
      vi.mocked(relayer.createDelegatedUserDecryptEIP712).mockResolvedValue({
        domain: { name: "test", version: "1", chainId: 1, verifyingContract: "0xkms" },
        types: { DelegatedUserDecryptRequestVerification: [] },
        message: {
          publicKey: TEST_PUBLIC_KEY,
          contractAddresses: [CONTRACT_A],
          delegatorAddress,
          startTimestamp: 1000n,
          durationDays: 1n,
          extraData: "0x",
        },
      } as never);

      let bulkCalls = 0;
      let resolveAFailed = (): void => {};
      const aFailed = new Promise<void>((r) => {
        resolveAFailed = r;
      });
      vi.mocked(relayer.delegatedUserDecrypt).mockImplementation(
        async ({ encryptedValues }: { encryptedValues: EncryptedValue[] }) => {
          // Bulk phase: one call per contract, all reject non-fatally.
          if (bulkCalls < 3) {
            bulkCalls++;
            throw new Error("batch failed");
          }
          // Per-item phase.
          const ev = encryptedValues[0];
          if (ev === HANDLE_A) {
            resolveAFailed();
            throw Object.assign(new Error("Too Many Requests"), { code: -32005 });
          }
          if (ev === HANDLE_B) {
            // Let HANDLE_A's fatal classification flip the abort flag first, then
            // a macrotask hop so the freed worker re-enters the loop afterwards.
            await aFailed;
            await new Promise((r) => setTimeout(r, 5));
            return { [HANDLE_B]: 20n };
          }
          return { [HANDLE_C]: 30n };
        },
      );

      await expect(
        decryptionService.delegatedBatchDecryptHandlesAs({
          encryptedInputs: handles([
            [HANDLE_A, CONTRACT_A],
            [HANDLE_B, CONTRACT_B],
            [HANDLE_C, CONTRACT_C],
          ]),
          delegatorAddress,
          delegateAddress,
          accountAddress: userAddress,
          maxConcurrency: 2,
        }),
      ).rejects.toBeInstanceOf(RpcRateLimitError);

      // 3 bulk calls (one per contract) + 2 per-item calls (HANDLE_A fatal,
      // HANDLE_B in-flight). HANDLE_C is short-circuited by the abort flag, so it
      // never reaches the relayer — without the flag this would be 6.
      expect(relayer.delegatedUserDecrypt).toHaveBeenCalledTimes(5);
    });
  });
});
