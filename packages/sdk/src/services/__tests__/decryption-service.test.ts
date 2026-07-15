import { getAddress, type Address, type Hex } from "viem";
import { MAX_UINT64 } from "../../contracts";
import { anvil } from "../../chains";
import {
  DelegationNotPropagatedError,
  NotEntitledError,
  RpcRateLimitError,
  StaleKmsContextError,
} from "../../errors";
import { PermissionStore } from "../../credentials/permission-store";
import type { Permission } from "../../credentials/types";
import { checksum } from "../../schemas/primitives";
import { TEST_PUBLIC_KEY } from "../../test-fixtures/constants";
import type { EncryptedInput } from "../../query/user-decrypt";
import type { EncryptedValue } from "../../relayer/types";
import { describe, expect, test, vi } from "../../test-fixtures";
import { LoggerService } from "../logger-service";

import { CachingService } from "../caching-service";
import type { TypedValue } from "@fhevm/sdk/types";
import type { DecryptValuesParameters } from "@fhevm/sdk/actions/decrypt";

const CONTRACT_A = getAddress("0x3333333333333333333333333333333333333333") as Address;
const CONTRACT_B = getAddress("0x4444444444444444444444444444444444444444") as Address;
const HANDLE_A = `0x${"aa".repeat(32)}` as EncryptedValue;
const HANDLE_B = `0x${"bb".repeat(32)}` as EncryptedValue;
const ZERO_ENCRYPTED_VALUE = `0x${"00".repeat(32)}` as EncryptedValue;

/** Mirrors the literal message `@fhevm/sdk`'s KMS-context assertion throws (SDK-137). */
function staleKmsContextError(): Error {
  return new Error('extraData "0xaaa" does not match KmsSignersContext extraData "0xbbb".');
}

function handles(items: Array<[EncryptedValue, Address]>): EncryptedInput[] {
  return items.map(([encryptedValue, contractAddress]) => ({ encryptedValue, contractAddress }));
}

describe("DecryptionService", () => {
  test("decryptValues returns zero handles without credentials or relayer calls", async ({
    decryptionService,
    relayer,
    userAddress,
  }) => {
    await expect(
      decryptionService.decryptValues(handles([[ZERO_ENCRYPTED_VALUE, CONTRACT_A]]), userAddress),
    ).resolves.toEqual({ [ZERO_ENCRYPTED_VALUE]: 0n });
    expect(relayer.signDecryptionPermit).not.toHaveBeenCalled();
    expect(relayer.decryptValues).not.toHaveBeenCalled();
  });

  test("decryptValues decrypts uncached handles grouped by contract and writes cache", async ({
    cachingService,
    createDecryptionService,
    relayer,
    userAddress,
    events,
  }) => {
    const emitEvent = vi.fn();
    const service = createDecryptionService({ emitEvent });
    vi.mocked(relayer.decryptValues)
      .mockResolvedValueOnce([{ type: "uint64", value: 10n } as TypedValue])
      .mockResolvedValueOnce([{ type: "uint64", value: 20n } as TypedValue]);

    const result = await service.decryptValues(
      handles([
        [HANDLE_A, CONTRACT_A],
        [HANDLE_B, CONTRACT_B],
      ]),
      userAddress,
    );

    expect(result).toEqual({ [HANDLE_A]: 10n, [HANDLE_B]: 20n });
    await expect(cachingService.get(userAddress, CONTRACT_A, HANDLE_A)).resolves.toBe(10n);
    await expect(cachingService.get(userAddress, CONTRACT_B, HANDLE_B)).resolves.toBe(20n);
    expect(relayer.decryptValues).toHaveBeenCalledWith(
      expect.objectContaining({ encryptedValues: [HANDLE_A], contractAddress: CONTRACT_A }),
    );
    expect(relayer.decryptValues).toHaveBeenCalledWith(
      expect.objectContaining({ encryptedValues: [HANDLE_B], contractAddress: CONTRACT_B }),
    );
    expect(emitEvent).toHaveBeenCalledWith(expect.objectContaining({ type: events.DecryptStart }));
    expect(emitEvent).toHaveBeenCalledWith(expect.objectContaining({ type: events.DecryptEnd }));
  });

  test("decryptValues forwards per-call signal and timeout to the relayer", async ({
    createDecryptionService,
    relayer,
    userAddress,
  }) => {
    const service = createDecryptionService({ emitEvent: vi.fn() });
    vi.mocked(relayer.decryptValues).mockResolvedValueOnce([
      { type: "uint64", value: 10n } as TypedValue,
    ]);
    const { signal } = new AbortController();

    await service.decryptValues(handles([[HANDLE_A, CONTRACT_A]]), userAddress, {
      timeout: 1234,
      signal,
    });

    expect(relayer.decryptValues).toHaveBeenCalledWith(
      expect.objectContaining({ options: { timeout: 1234, signal } }),
    );
  });

  test("decryptValues splits one contract's handles across the 2048-bit request budget", async ({
    cachingService,
    decryptionService,
    relayer,
    userAddress,
  }) => {
    // 40 euint64 handles (64 bits each) on one contract = 2560 bits, over the
    // 2048 cap — must split into a 32-handle chunk (exactly 2048 bits) and an
    // 8-handle remainder, each within budget.
    const euint64Handles: EncryptedValue[] = Array.from(
      { length: 40 },
      (_, i) => `0x${i.toString(16).padStart(60, "0")}0500` as EncryptedValue,
    );
    const expected: Record<EncryptedValue, bigint> = {};
    euint64Handles.forEach((h, i) => {
      expected[h] = BigInt(i);
    });

    vi.mocked(relayer.decryptValues).mockImplementation(
      async ({ encryptedValues }: DecryptValuesParameters) => {
        return encryptedValues.map(
          (ev) => ({ type: "uint64", value: expected[ev as EncryptedValue] }) as TypedValue,
        );
      },
    );

    const result = await decryptionService.decryptValues(
      handles(euint64Handles.map((h) => [h, CONTRACT_A] as [EncryptedValue, Address])),
      userAddress,
    );

    expect(result).toEqual(expected);
    for (const h of euint64Handles) {
      await expect(cachingService.get(userAddress, CONTRACT_A, h)).resolves.toBe(expected[h]);
    }

    expect(relayer.decryptValues).toHaveBeenCalledTimes(2);
    const callSizes = vi
      .mocked(relayer.decryptValues)
      .mock.calls.map(([arg]) => arg.encryptedValues.length)
      .toSorted((a, b) => a - b);
    expect(callSizes).toEqual([8, 32]);
  });

  test("decryptValues serves cached values without prompting for credentials", async ({
    cachingService,
    decryptionService,
    relayer,
    userAddress,
  }) => {
    await cachingService.set(userAddress, CONTRACT_A, HANDLE_A, 42n);

    await expect(
      decryptionService.decryptValues(handles([[HANDLE_A, CONTRACT_A]]), userAddress),
    ).resolves.toEqual({ [HANDLE_A]: 42n });
    expect(relayer.signDecryptionPermit).not.toHaveBeenCalled();
    expect(relayer.decryptValues).not.toHaveBeenCalled();
  });

  test("decryptValues resolves credentials against all contracts including zero handles", async ({
    decryptionService,
    relayer,
    userAddress,
  }) => {
    vi.mocked(relayer.decryptValues).mockResolvedValue([
      { type: "uint64", value: 20n } as TypedValue,
    ]);

    await expect(
      decryptionService.decryptValues(
        handles([
          [ZERO_ENCRYPTED_VALUE, CONTRACT_A],
          [HANDLE_B, CONTRACT_B],
        ]),
        userAddress,
      ),
    ).resolves.toEqual({ [ZERO_ENCRYPTED_VALUE]: 0n, [HANDLE_B]: 20n });

    expect(relayer.signDecryptionPermit).toHaveBeenCalledWith(
      expect.objectContaining({ contractAddresses: [CONTRACT_A, CONTRACT_B] }),
    );
    expect(relayer.decryptValues).toHaveBeenCalledWith(
      expect.objectContaining({ encryptedValues: [HANDLE_B], contractAddress: CONTRACT_B }),
    );
  });

  test("delegatedDecryptValues validates delegation before returning cached values", async ({
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
      decryptionService.delegatedDecryptValues(
        handles([[HANDLE_A, CONTRACT_A]]),
        delegatorAddress,
        delegateAddress,
        userAddress,
      ),
    ).resolves.toEqual({ [HANDLE_A]: 42n });
    expect(relayer.decryptValues).not.toHaveBeenCalled();
  });

  test("delegatedDecryptValues fails fast when delegation is inactive", async ({
    decryptionService,
    provider,
    relayer,
    delegatorAddress,
    delegateAddress,
    userAddress,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValue(0n);

    await expect(
      decryptionService.delegatedDecryptValues(
        handles([[HANDLE_A, CONTRACT_A]]),
        delegatorAddress,
        delegateAddress,
        userAddress,
      ),
    ).rejects.toMatchObject({ code: "DELEGATION_NOT_FOUND" });
    expect(relayer.signDecryptionPermit).not.toHaveBeenCalled();
    expect(relayer.decryptValues).not.toHaveBeenCalled();
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
    vi.mocked(relayer.decryptValues)
      .mockRejectedValueOnce(new Error("batch failed"))
      .mockRejectedValueOnce(new Error("batch failed"))
      .mockResolvedValueOnce([{ type: "uint64", value: 10n } as TypedValue])
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
    vi.mocked(relayer.decryptValues).mockResolvedValue([]);

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
    vi.mocked(relayer.decryptValues).mockResolvedValue([
      { type: "uint64", value: 10n } as TypedValue,
    ]);

    await expect(
      service.decryptValues(handles([[HANDLE_A, CONTRACT_A]]), userAddress),
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
        decryptionService.delegatedDecryptValues(
          handles([[HANDLE_A, CONTRACT_A]]),
          delegatorAddress,
          delegateAddress,
          userAddress,
        ),
      ).rejects.toBeInstanceOf(RpcRateLimitError);
      expect(relayer.decryptValues).not.toHaveBeenCalled();
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
      // The relayer's ACL gate throws a message-only Error; after the worker
      // boundary only the message survives. On the delegated path that verdict
      // comes from the *delegator's* `persistAllowed` L1 read, which is false
      // transiently under propagation lag — so it is surfaced as the retryable
      // DelegationNotPropagatedError, not the terminal NotEntitledError used for a
      // direct signer denial.
      vi.mocked(relayer.decryptValues).mockRejectedValue(
        new Error(`User ${delegatorAddress} is not authorized to decrypt handle ${HANDLE_A}!`),
      );

      const error = await decryptionService
        .delegatedDecryptValues(
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

    test("delegatedDecryptValues rides out the propagation window and resolves once the delegation syncs", async ({
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
        const notPropagated = new Error(
          `User ${delegatorAddress} is not authorized to decrypt handle ${HANDLE_A}!`,
        );
        vi.mocked(relayer.decryptValues)
          .mockRejectedValueOnce(notPropagated)
          .mockRejectedValueOnce(notPropagated)
          .mockResolvedValueOnce([{ type: "uint64", value: 7n } as TypedValue]);

        const promise = decryptionService.delegatedDecryptValues(
          handles([[HANDLE_A, CONTRACT_A]]),
          delegatorAddress,
          delegateAddress,
          userAddress,
        );
        // Two 2s retries, then success on the third attempt.
        await vi.advanceTimersByTimeAsync(4000);

        await expect(promise).resolves.toEqual({ [HANDLE_A]: 7n });
        expect(relayer.decryptValues).toHaveBeenCalledTimes(3);
      } finally {
        vi.useRealTimers();
      }
    });

    test("delegatedDecryptValues gives up with DelegationNotPropagatedError after the retry budget", async ({
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
        vi.mocked(relayer.decryptValues).mockRejectedValue(
          new Error(`User ${delegatorAddress} is not authorized to decrypt handle ${HANDLE_A}!`),
        );

        const settled = decryptionService
          .delegatedDecryptValues(
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
        expect(vi.mocked(relayer.decryptValues).mock.calls.length).toBeGreaterThan(1);
      } finally {
        vi.useRealTimers();
      }
    });

    test("delegatedDecryptValues with waitForPropagation:false fails fast on the first response", async ({
      decryptionService,
      provider,
      relayer,
      delegatorAddress,
      delegateAddress,
      userAddress,
    }) => {
      vi.mocked(provider.readContract).mockResolvedValue(MAX_UINT64);
      vi.mocked(relayer.decryptValues).mockRejectedValue(
        new Error(`User ${delegatorAddress} is not authorized to decrypt handle ${HANDLE_A}!`),
      );

      await expect(
        decryptionService.delegatedDecryptValues(
          handles([[HANDLE_A, CONTRACT_A]]),
          delegatorAddress,
          delegateAddress,
          userAddress,
          { waitForPropagation: false },
        ),
      ).rejects.toBeInstanceOf(DelegationNotPropagatedError);
      expect(relayer.decryptValues).toHaveBeenCalledTimes(1);
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
      expect(relayer.decryptValues).not.toHaveBeenCalled();
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

      let bulkCalls = 0;
      let resolveAFailed = (): void => {};
      const aFailed = new Promise<void>((r) => {
        resolveAFailed = r;
      });
      vi.mocked(relayer.decryptValues).mockImplementation(
        async ({ encryptedValues }: DecryptValuesParameters) => {
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
            return [{ type: "uint64", value: 20n } as TypedValue];
          }
          return [{ type: "uint64", value: 30n } as TypedValue];
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
      expect(relayer.decryptValues).toHaveBeenCalledTimes(5);
    });
  });

  describe("KMS context rotation recovery (SDK-137)", () => {
    test("a stale-context failure invalidates the permit, re-signs once, and retries to success", async ({
      decryptionService,
      relayer,
      userAddress,
    }) => {
      vi.mocked(relayer.decryptValues)
        .mockRejectedValueOnce(staleKmsContextError())
        .mockResolvedValueOnce([{ type: "uint64", value: 10n } as TypedValue]);

      await expect(
        decryptionService.decryptValues(handles([[HANDLE_A, CONTRACT_A]]), userAddress),
      ).resolves.toEqual({ [HANDLE_A]: 10n });

      expect(relayer.decryptValues).toHaveBeenCalledTimes(2);
      // One signature for the initial permit, one more for the recovery re-sign.
      expect(relayer.signDecryptionPermit).toHaveBeenCalledTimes(2);
    });

    test("two consecutive stale-context failures throw StaleKmsContextError without a third attempt", async ({
      decryptionService,
      relayer,
      userAddress,
    }) => {
      vi.mocked(relayer.decryptValues).mockRejectedValue(staleKmsContextError());

      await expect(
        decryptionService.decryptValues(handles([[HANDLE_A, CONTRACT_A]]), userAddress),
      ).rejects.toBeInstanceOf(StaleKmsContextError);

      // Exactly one retry: two decrypt attempts, two signatures (initial + recovery).
      expect(relayer.decryptValues).toHaveBeenCalledTimes(2);
      expect(relayer.signDecryptionPermit).toHaveBeenCalledTimes(2);
    });

    test("a non-stale-context failure is not retried and is classified as before", async ({
      decryptionService,
      relayer,
      userAddress,
    }) => {
      vi.mocked(relayer.decryptValues).mockRejectedValue(new Error("boom"));

      await expect(
        decryptionService.decryptValues(handles([[HANDLE_A, CONTRACT_A]]), userAddress),
      ).rejects.toMatchObject({ code: "DECRYPTION_FAILED" });

      // No recovery attempt: exactly the initial decrypt call and signature.
      expect(relayer.decryptValues).toHaveBeenCalledTimes(1);
      expect(relayer.signDecryptionPermit).toHaveBeenCalledTimes(1);
    });

    test("a stale permission for one contract does not affect an already-granted permit for another", async ({
      decryptionService,
      credentialService,
      relayer,
      storage,
      userAddress,
    }) => {
      // Establish A's permit through the real signing flow, then append B's as
      // a separate permit directly — bypassing `findPermitToWiden` (SDK-136),
      // which would otherwise coalesce two low-usage permits into one shared
      // signature before the interesting part of this test even starts.
      vi.mocked(relayer.decryptValues).mockResolvedValueOnce([
        { type: "uint64", value: 1n } as TypedValue,
      ]);
      await decryptionService.decryptValues(handles([[HANDLE_A, CONTRACT_A]]), userAddress);

      const scope = {
        signerAddress: checksum(userAddress),
        chainId: anvil.id,
        delegatorAddress: checksum(userAddress),
      };
      const permissionB: Permission = {
        keypairPublicKey: TEST_PUBLIC_KEY,
        contractAddresses: [checksum(CONTRACT_B)],
        serializedPermit: {
          version: 1,
          eip712: { domain: {}, types: {}, message: {} },
          signature: `0x${"bb".repeat(65)}` as Hex,
          signerAddress: checksum(userAddress),
        },
        startTimestamp: Math.floor(Date.now() / 1000),
        durationDays: 1,
      };
      await new PermissionStore({ storage, logger: new LoggerService() }).append(scope, [
        permissionB,
      ]);

      const invalidateSpy = vi.spyOn(credentialService, "invalidatePermit");
      const signsBefore = vi.mocked(relayer.signDecryptionPermit).mock.calls.length;
      const decryptsBefore = vi.mocked(relayer.decryptValues).mock.calls.length;

      // New (uncached) handles on the same contracts: A's stored permit has gone
      // stale and recovers; B's stays covered throughout and is never retried.
      const HANDLE_A2 = `0x${"cc".repeat(32)}` as EncryptedValue;
      const HANDLE_B2 = `0x${"dd".repeat(32)}` as EncryptedValue;
      let contractACalls = 0;
      let contractBCalls = 0;
      vi.mocked(relayer.decryptValues).mockImplementation(
        async ({ contractAddress }: DecryptValuesParameters) => {
          if (contractAddress === CONTRACT_A) {
            contractACalls++;
            // First attempt uses the now-stale stored permit and fails; the
            // recovery retry (with a freshly signed permit) succeeds.
            if (contractACalls === 1) {
              throw staleKmsContextError();
            }
            return [{ type: "uint64", value: 30n } as TypedValue];
          }
          contractBCalls++;
          return [{ type: "uint64", value: 40n } as TypedValue];
        },
      );

      await expect(
        decryptionService.decryptValues(
          handles([
            [HANDLE_A2, CONTRACT_A],
            [HANDLE_B2, CONTRACT_B],
          ]),
          userAddress,
        ),
      ).resolves.toEqual({ [HANDLE_A2]: 30n, [HANDLE_B2]: 40n });

      // Only A's stale permit was invalidated — never B's, and the recovery
      // path was never entered for B (exactly one relayer attempt each for a
      // healthy contract, two for the recovering one).
      expect(invalidateSpy).toHaveBeenCalledExactlyOnceWith(checksum(CONTRACT_A));
      expect(contractACalls).toBe(2);
      expect(contractBCalls).toBe(1);
      expect(vi.mocked(relayer.decryptValues).mock.calls.length - decryptsBefore).toBe(3);
      // Exactly one extra signature for A's recovery — B's existing coverage
      // needs no new wallet prompt (whether or not it ends up sharing that
      // fresh permit via SDK-136 widening is an internal storage optimization,
      // not a second prompt).
      expect(vi.mocked(relayer.signDecryptionPermit).mock.calls.length - signsBefore).toBe(1);
    });

    test("delegatedDecryptValues applies the same stale-context recovery", async ({
      decryptionService,
      provider,
      relayer,
      delegatorAddress,
      delegateAddress,
      userAddress,
    }) => {
      vi.mocked(provider.readContract).mockResolvedValue(MAX_UINT64);
      vi.mocked(relayer.decryptValues)
        .mockRejectedValueOnce(staleKmsContextError())
        .mockResolvedValueOnce([{ type: "uint64", value: 10n } as TypedValue]);

      await expect(
        decryptionService.delegatedDecryptValues(
          handles([[HANDLE_A, CONTRACT_A]]),
          delegatorAddress,
          delegateAddress,
          userAddress,
        ),
      ).resolves.toEqual({ [HANDLE_A]: 10n });

      expect(relayer.decryptValues).toHaveBeenCalledTimes(2);
      expect(relayer.signDecryptionPermit).toHaveBeenCalledTimes(2);
    });

    test("a shared KMS rotation across multiple contracts recovers with exactly one batched re-sign, not one per contract", async ({
      decryptionService,
      credentialService,
      relayer,
      userAddress,
    }) => {
      const invalidateSpy = vi.spyOn(credentialService, "invalidatePermit");
      const signsBefore = vi.mocked(relayer.signDecryptionPermit).mock.calls.length;

      const attempts = new Map<Address, number>();
      vi.mocked(relayer.decryptValues).mockImplementation(
        async ({ contractAddress: rawContractAddress }: DecryptValuesParameters) => {
          const contractAddress = rawContractAddress as Address;
          const n = (attempts.get(contractAddress) ?? 0) + 1;
          attempts.set(contractAddress, n);
          if (n === 1) {
            throw staleKmsContextError();
          }
          return [
            { type: "uint64", value: contractAddress === CONTRACT_A ? 10n : 20n } as TypedValue,
          ];
        },
      );

      await expect(
        decryptionService.decryptValues(
          handles([
            [HANDLE_A, CONTRACT_A],
            [HANDLE_B, CONTRACT_B],
          ]),
          userAddress,
        ),
      ).resolves.toEqual({ [HANDLE_A]: 10n, [HANDLE_B]: 20n });

      expect(invalidateSpy).toHaveBeenCalledTimes(2);
      expect(invalidateSpy).toHaveBeenCalledWith(checksum(CONTRACT_A));
      expect(invalidateSpy).toHaveBeenCalledWith(checksum(CONTRACT_B));
      expect(attempts.get(CONTRACT_A)).toBe(2);
      expect(attempts.get(CONTRACT_B)).toBe(2);

      // One signature for the initial shared permit, plus exactly ONE more for the
      // batched recovery re-sign covering both contracts together (preserving
      // SDK-136 widening) — not two independent single-contract re-signs.
      expect(vi.mocked(relayer.signDecryptionPermit).mock.calls.length - signsBefore).toBe(2);
    });

    test("a failure while invalidating/re-signing during recovery keeps the original stale-context error traceable via cause", async ({
      decryptionService,
      credentialService,
      relayer,
      userAddress,
    }) => {
      vi.mocked(relayer.decryptValues).mockRejectedValue(staleKmsContextError());
      const recoveryFailure = new Error("wallet locked");
      vi.spyOn(credentialService, "invalidatePermit").mockRejectedValueOnce(recoveryFailure);

      const error: unknown = await decryptionService
        .decryptValues(handles([[HANDLE_A, CONTRACT_A]]), userAddress)
        .catch((e: unknown) => e);

      // The failure that actually surfaces (wallet locked, while invalidating the
      // stale permit) has nothing to do with staleness by itself -- the original
      // detection must still be reachable so a debugging engineer isn't looking at
      // a bare, context-free failure.
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).cause).toBeInstanceOf(AggregateError);
      const aggregated = ((error as Error).cause as AggregateError).errors as unknown[];
      expect(
        aggregated.some(
          (e) => e instanceof Error && e.message.includes("does not match KmsSignersContext"),
        ),
      ).toBe(true);
      expect(aggregated).toContain(recoveryFailure);
    });

    test("a retry failure for an unrelated reason after recovery keeps the original stale-context detection traceable via cause", async ({
      decryptionService,
      relayer,
      userAddress,
    }) => {
      const retryFailure = new Error("boom on retry");
      vi.mocked(relayer.decryptValues)
        .mockRejectedValueOnce(staleKmsContextError())
        .mockRejectedValueOnce(retryFailure);

      const error: unknown = await decryptionService
        .decryptValues(handles([[HANDLE_A, CONTRACT_A]]), userAddress)
        .catch((e: unknown) => e);

      expect(error).toMatchObject({ code: "DECRYPTION_FAILED" });
      expect((error as Error).cause).toBeInstanceOf(AggregateError);
      const aggregated = ((error as Error).cause as AggregateError).errors as unknown[];
      expect(
        aggregated.some(
          (e) => e instanceof Error && e.message.includes("does not match KmsSignersContext"),
        ),
      ).toBe(true);
    });

    test("DecryptEnd carries recoveredContracts: empty on the clean path, populated after a rotation recovery", async ({
      createDecryptionService,
      relayer,
      userAddress,
    }) => {
      const emitEvent = vi.fn();
      const service = createDecryptionService({ emitEvent });

      vi.mocked(relayer.decryptValues).mockResolvedValueOnce([
        { type: "uint64", value: 1n } as TypedValue,
      ]);
      await service.decryptValues(handles([[HANDLE_A, CONTRACT_A]]), userAddress);
      const cleanEnd = emitEvent.mock.calls.map(([e]) => e).find((e) => e.type === "decrypt:end");
      expect(cleanEnd?.recoveredContracts).toEqual([]);

      emitEvent.mockClear();
      const HANDLE_A2 = `0x${"ee".repeat(32)}` as EncryptedValue;
      vi.mocked(relayer.decryptValues)
        .mockRejectedValueOnce(staleKmsContextError())
        .mockResolvedValueOnce([{ type: "uint64", value: 2n } as TypedValue]);
      await service.decryptValues(handles([[HANDLE_A2, CONTRACT_A]]), userAddress);
      const recoveredEnd = emitEvent.mock.calls
        .map(([e]) => e)
        .find((e) => e.type === "decrypt:end");
      expect(recoveredEnd?.recoveredContracts).toEqual([checksum(CONTRACT_A)]);
    });

    test("an already-aborted signal short-circuits before the recovery re-sign fires", async ({
      decryptionService,
      credentialService,
      relayer,
      userAddress,
    }) => {
      vi.mocked(relayer.decryptValues).mockRejectedValue(staleKmsContextError());
      const invalidateSpy = vi.spyOn(credentialService, "invalidatePermit");
      const controller = new AbortController();
      controller.abort();

      await expect(
        decryptionService.decryptValues(handles([[HANDLE_A, CONTRACT_A]]), userAddress, {
          signal: controller.signal,
        }),
      ).rejects.toThrow();

      expect(invalidateSpy).not.toHaveBeenCalled();
    });
  });
});
