import type { PublicClient } from "viem";
import { fetchConfidentialTransfers } from "../acl/transfer-log.js";
import type { DelegationStore } from "./delegation-store.js";
import type { DecryptCache } from "./decrypt-cache.js";
import type { TransferStore } from "./transfer-store.js";
import type { Logger } from "../logging/logger.js";

/** Per-(delegator, contractAddress) last-scanned block, so re-polling only fetches new logs. */
export class TransferScanState {
  readonly #lastScanned = new Map<string, bigint>();

  get(delegator: string, contractAddress: string): bigint {
    return this.#lastScanned.get(`${delegator}:${contractAddress}`) ?? 0n;
  }

  set(delegator: string, contractAddress: string, block: bigint): void {
    this.#lastScanned.set(`${delegator}:${contractAddress}`, block);
  }
}

/**
 * For every currently-known-active delegation, fetches new
 * `ConfidentialTransfer` logs involving that delegator and decrypts the
 * amount handle — using the delegator's own delegation, since the amount
 * handle is typically ACL-allowed for both transfer parties independently
 * (observed in a real transaction trace, not derived from source — see
 * WALKTHROUGH.md).
 */
export async function trackTransfers(params: {
  publicClient: PublicClient;
  store: DelegationStore;
  transferStore: TransferStore;
  decryptCache: DecryptCache;
  scanState: TransferScanState;
  fromBlockFloor: bigint;
  logger: Logger;
}): Promise<void> {
  const { publicClient, store, transferStore, decryptCache, scanState, fromBlockFloor, logger } =
    params;
  const currentBlock = await publicClient.getBlockNumber();

  for (const delegation of await store.list()) {
    const lastScanned =
      scanState.get(delegation.delegator, delegation.contractAddress) || fromBlockFloor;
    if (currentBlock <= lastScanned) continue;

    try {
      const transfers = await fetchConfidentialTransfers({
        publicClient,
        contractAddress: delegation.contractAddress,
        account: delegation.delegator,
        fromBlock: lastScanned + 1n,
        toBlock: currentBlock,
      });

      for (const transfer of transfers) {
        const { clearValue } = await decryptCache.resolve({
          handle: transfer.amountHandle,
          contractAddress: transfer.contractAddress,
          delegatorAddress: delegation.delegator,
          atBlock: transfer.blockNumber,
        });
        await transferStore.upsert({
          contractAddress: transfer.contractAddress,
          from: transfer.from,
          to: transfer.to,
          amountHandle: transfer.amountHandle,
          clearAmount: clearValue,
          blockNumber: transfer.blockNumber,
          transactionHash: transfer.transactionHash,
        });
      }

      scanState.set(delegation.delegator, delegation.contractAddress, currentBlock);
    } catch (error) {
      logger.warn(
        `Failed to track transfers for ${delegation.delegator} on ${delegation.contractAddress}: ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
