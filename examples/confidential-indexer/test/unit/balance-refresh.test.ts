import { describe, expect, it, vi } from "vitest";
import type { PublicClient } from "viem";
import type { ZamaSDK } from "@zama-fhe/sdk";
import { createLogger } from "../../src/logging/logger.js";
import { DelegationStore } from "../../src/indexer/delegation-store.js";
import { BalanceStore } from "../../src/indexer/balance-store.js";
import { DecryptCache } from "../../src/indexer/decrypt-cache.js";
import { createInMemoryStore } from "../../src/storage/kv-store.js";
import { refreshBalances } from "../../src/indexer/balance-refresh.js";

const HANDLE = "0xhandle00000000000000000000000000000000000000000000000000000000" as const;
const CONTRACT = "0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639" as const;
const DELEGATOR = "0x72059F5569B6c7ab165Bf05a280f2F870C73b4f8" as const;

const logger = createLogger({ quiet: true, verbose: false });

function fakePublicClient(blockNumber: bigint): PublicClient {
  return { getBlockNumber: vi.fn().mockResolvedValue(blockNumber) } as unknown as PublicClient;
}

describe("refreshBalances", () => {
  it("reads the balance via Token.confidentialBalanceOf and stores the result under encryptedValue", async () => {
    const delegationStore = new DelegationStore(createInMemoryStore());
    await delegationStore.apply([
      {
        delegator: DELEGATOR,
        delegate: DELEGATOR,
        contractAddress: CONTRACT,
        expirationDate: 2n ** 64n - 1n,
        blockNumber: 1n,
        transactionHash: "0xabc",
        logIndex: 0,
        action: "granted",
      },
    ]);
    const balanceStore = new BalanceStore(createInMemoryStore());

    const confidentialBalanceOf = vi.fn().mockResolvedValue(HANDLE);
    const createToken = vi.fn().mockReturnValue({ confidentialBalanceOf });
    const delegatedDecryptValues = vi.fn().mockResolvedValue({ [HANDLE]: 97_001021n });
    const sdk = { createToken, decryption: { delegatedDecryptValues } } as unknown as ZamaSDK;
    const decryptCache = new DecryptCache({ store: createInMemoryStore(), sdk, logger });

    const snapshots = await refreshBalances({
      publicClient: fakePublicClient(42n),
      sdk,
      store: delegationStore,
      balanceStore,
      decryptCache,
      logger,
    });

    expect(createToken).toHaveBeenCalledWith(CONTRACT);
    expect(confidentialBalanceOf).toHaveBeenCalledWith(DELEGATOR);
    expect(snapshots).toEqual([
      {
        delegator: DELEGATOR,
        contractAddress: CONTRACT,
        encryptedValue: HANDLE,
        clearValue: 97_001021n,
        decryptedAtBlock: 42n,
      },
    ]);
    expect(await balanceStore.get(DELEGATOR, CONTRACT)).toMatchObject({
      encryptedValue: HANDLE,
      clearValue: 97_001021n,
    });
  });
});
