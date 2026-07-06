import { describe, expect, it, vi } from "vitest";
import { DelegationNotPropagatedError, type ZamaSDK } from "@zama-fhe/sdk";
import { createLogger } from "../../src/logging/logger.js";
import { DecryptCache } from "../../src/indexer/decrypt-cache.js";
import { createInMemoryStore } from "../../src/storage/kv-store.js";

const HANDLE = "0xhandle00000000000000000000000000000000000000000000000000000000" as const;
const CONTRACT = "0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639" as const;
const DELEGATOR = "0x72059F5569B6c7ab165Bf05a280f2F870C73b4f8" as const;

const logger = createLogger({ quiet: true, verbose: false });

function fakeSdk(delegatedDecryptValues: ZamaSDK["decryption"]["delegatedDecryptValues"]): ZamaSDK {
  return { decryption: { delegatedDecryptValues } } as unknown as ZamaSDK;
}

describe("DecryptCache", () => {
  it("decrypts once and caches by handle (not by account)", async () => {
    const delegatedDecryptValues = vi.fn().mockResolvedValue({ [HANDLE]: 97_001021n });
    const cache = new DecryptCache({
      store: createInMemoryStore(),
      sdk: fakeSdk(delegatedDecryptValues),
      logger,
    });

    const first = await cache.resolve({
      handle: HANDLE,
      contractAddress: CONTRACT,
      delegatorAddress: DELEGATOR,
      atBlock: 1n,
    });
    const second = await cache.resolve({
      handle: HANDLE,
      contractAddress: CONTRACT,
      delegatorAddress: DELEGATOR,
      atBlock: 2n,
    });

    expect(first.clearValue).toBe(97_001021n);
    expect(second.clearValue).toBe(97_001021n);
    expect(delegatedDecryptValues).toHaveBeenCalledTimes(1);
    expect(delegatedDecryptValues).toHaveBeenCalledWith(
      [{ encryptedValue: HANDLE, contractAddress: CONTRACT }],
      DELEGATOR,
    );
  });

  it("retries on DelegationNotPropagatedError and eventually succeeds", async () => {
    const delegatedDecryptValues = vi
      .fn()
      .mockRejectedValueOnce(new DelegationNotPropagatedError("not propagated yet"))
      .mockResolvedValueOnce({ [HANDLE]: 5n });
    const cache = new DecryptCache({
      store: createInMemoryStore(),
      sdk: fakeSdk(delegatedDecryptValues),
      logger,
      maxRetries: 3,
      retryDelayMs: 1,
    });

    const result = await cache.resolve({
      handle: HANDLE,
      contractAddress: CONTRACT,
      delegatorAddress: DELEGATOR,
      atBlock: 1n,
    });

    expect(result.clearValue).toBe(5n);
    expect(delegatedDecryptValues).toHaveBeenCalledTimes(2);
  });

  it("gives up and throws after exhausting retries", async () => {
    const delegatedDecryptValues = vi
      .fn()
      .mockRejectedValue(new DelegationNotPropagatedError("still not there"));
    const cache = new DecryptCache({
      store: createInMemoryStore(),
      sdk: fakeSdk(delegatedDecryptValues),
      logger,
      maxRetries: 2,
      retryDelayMs: 1,
    });

    await expect(
      cache.resolve({
        handle: HANDLE,
        contractAddress: CONTRACT,
        delegatorAddress: DELEGATOR,
        atBlock: 1n,
      }),
    ).rejects.toBeInstanceOf(DelegationNotPropagatedError);
    expect(delegatedDecryptValues).toHaveBeenCalledTimes(2);
  });

  it("does not retry on a non-propagation error", async () => {
    const delegatedDecryptValues = vi.fn().mockRejectedValue(new Error("something else entirely"));
    const cache = new DecryptCache({
      store: createInMemoryStore(),
      sdk: fakeSdk(delegatedDecryptValues),
      logger,
      maxRetries: 5,
      retryDelayMs: 1,
    });

    await expect(
      cache.resolve({
        handle: HANDLE,
        contractAddress: CONTRACT,
        delegatorAddress: DELEGATOR,
        atBlock: 1n,
      }),
    ).rejects.toThrow("something else entirely");
    expect(delegatedDecryptValues).toHaveBeenCalledTimes(1);
  });
});
