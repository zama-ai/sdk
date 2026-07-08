import type { PublicClient } from "viem";
import type { ZamaSDK } from "@zama-fhe/sdk";
import type { DelegationStore } from "./delegation-store.js";
import type { DecryptCache } from "./decrypt-cache.js";
import type { BalanceStore, BalanceSnapshot } from "./balance-store.js";
import type { Logger } from "../logging/logger.js";

/**
 * Refreshes the cached decrypted balance for every currently-known-active
 * delegation. Cheap to call on a poll interval: `Token.confidentialBalanceOf`
 * is a plain view read, and `DecryptCache` skips the relayer round-trip
 * entirely once a handle has already been decrypted once.
 */
export async function refreshBalances(params: {
  publicClient: PublicClient;
  sdk: ZamaSDK;
  store: DelegationStore;
  balanceStore: BalanceStore;
  decryptCache: DecryptCache;
  logger: Logger;
}): Promise<BalanceSnapshot[]> {
  const { publicClient, sdk, store, balanceStore, decryptCache, logger } = params;
  const atBlock = await publicClient.getBlockNumber();
  const snapshots: BalanceSnapshot[] = [];

  for (const delegation of await store.list()) {
    try {
      const encryptedValue = await sdk
        .createToken(delegation.contractAddress)
        .confidentialBalanceOf(delegation.delegator);
      const { clearValue } = await decryptCache.resolve({
        handle: encryptedValue,
        contractAddress: delegation.contractAddress,
        delegatorAddress: delegation.delegator,
        atBlock,
      });
      const snapshot: BalanceSnapshot = {
        delegator: delegation.delegator,
        contractAddress: delegation.contractAddress,
        encryptedValue,
        clearValue,
        decryptedAtBlock: atBlock,
      };
      await balanceStore.upsert(snapshot);
      snapshots.push(snapshot);
    } catch (error) {
      logger.warn(
        `Failed to refresh balance for ${delegation.delegator} on ${delegation.contractAddress}: ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return snapshots;
}
