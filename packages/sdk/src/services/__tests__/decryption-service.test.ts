import { getAddress, type Address } from "viem";
import { MAX_UINT64 } from "../../contracts";
import type { EncryptedInput } from "../../query/user-decrypt";
import type { EncryptedValue } from "../../relayer/types";
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
  test("decryptValues returns zero handles without credentials or relayer calls", async ({
    decryptionService,
    relayer,
    userAddress,
  }) => {
    await expect(
      decryptionService.decryptValues(handles([[ZERO_ENCRYPTED_VALUE, CONTRACT_A]]), userAddress),
    ).resolves.toEqual({ [ZERO_ENCRYPTED_VALUE]: 0n });
    expect(relayer.createEIP712).not.toHaveBeenCalled();
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
      .mockResolvedValueOnce({ [HANDLE_A]: 10n })
      .mockResolvedValueOnce({ [HANDLE_B]: 20n });

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
    expect(relayer.createEIP712).not.toHaveBeenCalled();
    expect(relayer.decryptValues).not.toHaveBeenCalled();
  });

  test("decryptValues resolves credentials against all contracts including zero handles", async ({
    decryptionService,
    relayer,
    userAddress,
  }) => {
    vi.mocked(relayer.decryptValues).mockResolvedValue({ [HANDLE_B]: 20n });

    await expect(
      decryptionService.decryptValues(
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
    expect(relayer.delegatedDecryptValues).not.toHaveBeenCalled();
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
    expect(relayer.createDelegatedUserDecryptEIP712).not.toHaveBeenCalled();
    expect(relayer.delegatedDecryptValues).not.toHaveBeenCalled();
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
    vi.mocked(relayer.delegatedDecryptValues)
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
    vi.mocked(relayer.delegatedDecryptValues).mockResolvedValue({});

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
    vi.mocked(relayer.decryptValues).mockResolvedValue({ [HANDLE_A]: 10n });

    await expect(
      service.decryptValues(handles([[HANDLE_A, CONTRACT_A]]), userAddress),
    ).resolves.toEqual({ [HANDLE_A]: 10n });
  });
});
