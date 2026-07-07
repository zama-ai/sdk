import { parseAbi, type PublicClient } from "viem";
import type { DelegationStore } from "./delegation-store.js";
import type { DecryptCache } from "./decrypt-cache.js";
import type { BalanceStore, BalanceSnapshot } from "./balance-store.js";
import type { Logger } from "../logging/logger.js";

/**
 * `confidentialBalanceOf` is a plain, unrestricted `view` function — see
 * `IERC7984.sol` / the real OpenZeppelin implementation
 * (`return _balances[account];`, no access check). Reading the ciphertext
 * handle needs nothing from this service; only decrypting it does.
 */
const confidentialBalanceOfAbi = parseAbi([
  "function confidentialBalanceOf(address account) view returns (bytes32)",
]);

/**
 * Refreshes the cached decrypted balance for every currently-known-active
 * delegation. Cheap to call on a poll interval: `confidentialBalanceOf` is
 * a plain view read, and `DecryptCache` skips the relayer round-trip
 * entirely once a handle has already been decrypted once.
 */
export async function refreshBalances(params: {
  publicClient: PublicClient;
  store: DelegationStore;
  balanceStore: BalanceStore;
  decryptCache: DecryptCache;
  logger: Logger;
}): Promise<BalanceSnapshot[]> {
  const { publicClient, store, balanceStore, decryptCache, logger } = params;
  const atBlock = await publicClient.getBlockNumber();
  const snapshots: BalanceSnapshot[] = [];

  for (const delegation of await store.list()) {
    try {
      const handle = await publicClient.readContract({
        address: delegation.contractAddress,
        abi: confidentialBalanceOfAbi,
        functionName: "confidentialBalanceOf",
        args: [delegation.delegator],
      });
      const { clearValue } = await decryptCache.resolve({
        handle,
        contractAddress: delegation.contractAddress,
        delegatorAddress: delegation.delegator,
        atBlock,
      });
      const snapshot: BalanceSnapshot = {
        delegator: delegation.delegator,
        contractAddress: delegation.contractAddress,
        handle,
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
