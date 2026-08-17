import { getAddress, type Address } from "viem";
import { MAX_UINT64 } from "../../contracts";
import {
  DelegationNotPropagatedError,
  InvalidTransportKeyPairError,
  NotEntitledError,
  RevokedKmsContextError,
  RpcRateLimitError,
} from "../../errors";
import type { EncryptedInput } from "../../query/user-decrypt";
import type { EncryptedValue } from "../../relayer/types";
import { describe, expect, test, vi } from "../../test-fixtures";
import { TEST_TKMS_VERSION } from "../../test-fixtures/constants";
import { LoggerService } from "../logger-service";

import { CachingService } from "../caching-service";
import type { TypedValue } from "@fhevm/sdk/types";
import type { DecryptValuesParameters } from "@fhevm/sdk/actions/decrypt";

const CONTRACT_A = getAddress("0x3333333333333333333333333333333333333333") as Address;
const CONTRACT_B = getAddress("0x4444444444444444444444444444444444444444") as Address;
const HANDLE_A = `0x${"aa".repeat(32)}` as EncryptedValue;
const HANDLE_B = `0x${"bb".repeat(32)}` as EncryptedValue;
const ZERO_ENCRYPTED_VALUE = `0x${"00".repeat(32)}` as EncryptedValue;

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

  test("evicts the transport key pair and surfaces a typed error when the relayer rejects it", async ({
    decryptionService,
    credentialService,
    relayer,
    userAddress,
  }) => {
    // Pre-cache a permit so grantPermit resolves without re-signing — the first
    // parseTransportKeyPair of the flow then happens inside the decrypt path.
    await credentialService.grantPermit([CONTRACT_A]);
    const generateCalls = vi.mocked(relayer.generateTransportKeyPair).mock.calls.length;

    // The relayer can no longer re-derive the stored key pair (post KMS/TKMS rotation).
    vi.mocked(relayer.parseTransportKeyPair).mockRejectedValueOnce(
      new Error("invalid TransportKeyPairKeyPair"),
    );

    await expect(
      decryptionService.decryptValues(handles([[HANDLE_A, CONTRACT_A]]), userAddress),
    ).rejects.toBeInstanceOf(InvalidTransportKeyPairError);

    // Self-heal: the stale key pair was evicted, so the next resolution regenerates.
    await credentialService.grantPermit([CONTRACT_B]);
    expect(vi.mocked(relayer.generateTransportKeyPair).mock.calls.length).toBe(generateCalls + 1);
  });

  test("forwards the persisted tkmsVersion when re-deriving the key pair to decrypt", async ({
    decryptionService,
    credentialService,
    relayer,
    userAddress,
  }) => {
    // Warm a permit so the decrypt path re-derives the stored key pair; the TKMS
    // version persisted at generation must ride along so the relayer deserializes
    // the private key under the version it was generated with.
    await credentialService.grantPermit([CONTRACT_A]);
    vi.mocked(relayer.parseTransportKeyPair).mockClear();

    await decryptionService.decryptValues(handles([[HANDLE_A, CONTRACT_A]]), userAddress);

    expect(relayer.parseTransportKeyPair).toHaveBeenCalledWith(
      expect.objectContaining({ tkmsVersion: TEST_TKMS_VERSION }),
    );
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
      .sort((a, b) => a - b);
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

  describe("revoked KMS context recovery (SDK-294)", () => {
    // The KMS signers read reverting with InvalidKmsContext, as it reaches us
    // through viem without the error in the read's ABI: raw data only.
    const revokedContextRevert = (): Error =>
      Object.assign(new Error("execution reverted"), {
        cause: {
          name: "ContractFunctionRevertedError",
          raw: `0x77ddbe81${"22".repeat(32)}`,
          signature: "0x77ddbe81",
        },
      });

    test("evicts the dead permit, re-grants, and retries once with the fresh permit", async ({
      decryptionService,
      credentialService,
      relayer,
      signer,
      userAddress,
    }) => {
      await credentialService.grantPermit([CONTRACT_A]);
      const grantsBefore = vi.mocked(relayer.signDecryptionPermit).mock.calls.length;
      // A distinguishable signature for the recovery re-grant, so the retry
      // provably decrypts with the re-signed permit and not the dead one.
      const freshSignature = `0x${"44".repeat(65)}` as `0x${string}`;
      vi.mocked(signer.signTypedData).mockResolvedValueOnce(freshSignature);
      vi.mocked(relayer.decryptValues)
        .mockRejectedValueOnce(revokedContextRevert())
        .mockResolvedValueOnce([{ type: "uint64", value: 10n } as TypedValue]);

      await expect(
        decryptionService.decryptValues(handles([[HANDLE_A, CONTRACT_A]]), userAddress),
      ).resolves.toEqual({ [HANDLE_A]: 10n });

      // The pre-granted permit was evicted, so the retry re-signed exactly one.
      expect(vi.mocked(relayer.signDecryptionPermit).mock.calls.length).toBe(grantsBefore + 1);
      expect(relayer.decryptValues).toHaveBeenCalledTimes(2);
      const retryPermit = vi.mocked(relayer.decryptValues).mock.calls[1]![0]
        .signedPermit as unknown as { signature: string };
      expect(retryPermit.signature).toBe(freshSignature);
    });

    test("retries only the still-unresolved chunks after a partial first pass", async ({
      decryptionService,
      relayer,
      userAddress,
    }) => {
      let contractBFailed = false;
      vi.mocked(relayer.decryptValues).mockImplementation(
        async ({ contractAddress }: DecryptValuesParameters) => {
          if (contractAddress === CONTRACT_B && !contractBFailed) {
            contractBFailed = true;
            throw revokedContextRevert();
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

      // The satisfied chunk (A) is not re-decrypted by the retry.
      const calls = vi.mocked(relayer.decryptValues).mock.calls;
      expect(calls.filter(([p]) => p.contractAddress === CONTRACT_A)).toHaveLength(1);
      expect(calls.filter(([p]) => p.contractAddress === CONTRACT_B)).toHaveLength(2);
      expect(relayer.signDecryptionPermit).toHaveBeenCalledTimes(2);
    });

    test("a sibling failure settling first does not hide the revoked context", async ({
      decryptionService,
      relayer,
      signer,
      userAddress,
    }) => {
      // Contract A denies entitlement immediately; contract B's revoked-context
      // revert settles later. The recovery must still fire (the first-settled
      // rejection must not decide alone), then B succeeds under the fresh
      // permit while A's denial surfaces.
      let contractBFailed = false;
      vi.mocked(relayer.decryptValues).mockImplementation(
        async ({ contractAddress }: DecryptValuesParameters) => {
          if (contractAddress === CONTRACT_A) {
            throw new Error(`User ${userAddress} is not authorized to decrypt handle ${HANDLE_A}!`);
          }
          if (!contractBFailed) {
            contractBFailed = true;
            await new Promise((resolve) => setTimeout(resolve, 5));
            throw revokedContextRevert();
          }
          return [{ type: "uint64", value: 20n } as TypedValue];
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
      ).rejects.toBeInstanceOf(NotEntitledError);

      // The recovery fired exactly once despite the earlier-settling denial.
      expect(relayer.signDecryptionPermit).toHaveBeenCalledTimes(2);
      expect(signer.signTypedData).toHaveBeenCalledTimes(2);
    });

    test("surfaces the typed error after the single retry fails identically", async ({
      decryptionService,
      relayer,
      userAddress,
    }) => {
      // The @fhevm/sdk validity cache can serve a stale "valid" verdict for up
      // to 15 minutes, so the retry may re-hit the same revert. One recovery
      // only: evict, re-grant, retry, then surface.
      vi.mocked(relayer.decryptValues).mockRejectedValue(revokedContextRevert());

      await expect(
        decryptionService.decryptValues(handles([[HANDLE_A, CONTRACT_A]]), userAddress),
      ).rejects.toBeInstanceOf(RevokedKmsContextError);

      expect(relayer.decryptValues).toHaveBeenCalledTimes(2);
      // Initial grant + one recovery re-grant, no further loops.
      expect(relayer.signDecryptionPermit).toHaveBeenCalledTimes(2);
    });

    test("recovers once for the whole call when several contracts share the dead context", async ({
      decryptionService,
      relayer,
      userAddress,
    }) => {
      const clear: Record<string, bigint> = { [HANDLE_A]: 10n, [HANDLE_B]: 20n };
      let failuresLeft = 2;
      vi.mocked(relayer.decryptValues).mockImplementation(
        async ({ encryptedValues }: DecryptValuesParameters) => {
          if (failuresLeft > 0) {
            failuresLeft--;
            throw revokedContextRevert();
          }
          return encryptedValues.map(
            (ev) => ({ type: "uint64", value: clear[ev as EncryptedValue] }) as TypedValue,
          );
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

      // Both contracts failed on the first pass, yet the permit set was
      // re-granted once (one wallet prompt), not once per contract.
      expect(relayer.signDecryptionPermit).toHaveBeenCalledTimes(2);
      expect(relayer.decryptValues).toHaveBeenCalledTimes(4);
    });

    test("the delegated propagation retry loop does not re-arm the one-shot recovery", async ({
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
        // Attempt 1: revoked context, recovery fires, the retry then hits a
        // propagation-lag denial, so the outer loop schedules attempt 2, which
        // hits the revoked context again (the upstream validity cache). The
        // spent budget must surface the typed error instead of prompting again.
        vi.mocked(relayer.decryptValues)
          .mockRejectedValueOnce(revokedContextRevert())
          .mockRejectedValueOnce(
            new Error(`User ${delegatorAddress} is not authorized to decrypt handle ${HANDLE_A}!`),
          )
          .mockRejectedValue(revokedContextRevert());

        const settled = decryptionService
          .delegatedDecryptValues(
            handles([[HANDLE_A, CONTRACT_A]]),
            delegatorAddress,
            delegateAddress,
            userAddress,
          )
          .catch((e: unknown) => e);
        await vi.advanceTimersByTimeAsync(2_000);

        expect(await settled).toBeInstanceOf(RevokedKmsContextError);
        // Initial grant + one recovery re-grant across the whole loop, not one
        // per propagation attempt.
        expect(relayer.signDecryptionPermit).toHaveBeenCalledTimes(2);
        expect(relayer.decryptValues).toHaveBeenCalledTimes(3);
      } finally {
        vi.useRealTimers();
      }
    });

    test("delegated batch aborts instead of recovering per item", async ({
      decryptionService,
      provider,
      relayer,
      delegatorAddress,
      delegateAddress,
      userAddress,
    }) => {
      vi.mocked(provider.readContract).mockResolvedValue(MAX_UINT64);
      vi.mocked(relayer.decryptValues).mockRejectedValue(revokedContextRevert());

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
      ).rejects.toBeInstanceOf(RevokedKmsContextError);

      // The batch attempt spent the one allowed recovery (initial grant +
      // re-grant); the per-item fallback would have added one prompt per item.
      expect(relayer.signDecryptionPermit).toHaveBeenCalledTimes(2);
      // 2 contracts x 2 passes in the batch attempt, no per-item calls.
      expect(relayer.decryptValues).toHaveBeenCalledTimes(4);
    });
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
});
