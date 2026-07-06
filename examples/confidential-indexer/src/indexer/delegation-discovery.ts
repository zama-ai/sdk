import type { Address, PublicClient } from "viem";
import { fetchDelegationLogs } from "../acl/delegation-log.js";
import type { DelegationStore } from "./delegation-store.js";
import type { Logger } from "../logging/logger.js";

export interface DelegationDiscoveryState {
  lastScannedBlock: bigint;
}

/**
 * Scans the ACL contract for new grant/revoke logs targeting this
 * service's operational (delegate) address since the last scanned block,
 * and applies them to the store. Designed to be called on a poll interval
 * (see `cli.ts`), not as a one-shot historical backfill — `fromBlock` in
 * `config.ts` bounds how far back the very first scan goes.
 */
export async function discoverDelegations(params: {
  publicClient: PublicClient;
  aclAddress: Address;
  delegateAddress: Address;
  store: DelegationStore;
  state: DelegationDiscoveryState;
  logger: Logger;
}): Promise<void> {
  const { publicClient, aclAddress, delegateAddress, store, state, logger } = params;
  const currentBlock = await publicClient.getBlockNumber();
  if (currentBlock <= state.lastScannedBlock) return;

  const records = await fetchDelegationLogs({
    publicClient,
    aclAddress,
    delegateAddress,
    fromBlock: state.lastScannedBlock + 1n,
    toBlock: currentBlock,
  });

  if (records.length > 0) {
    store.apply(records);
    for (const record of records) {
      logger.info(
        `Delegation ${record.action}: ${record.delegator} -> ${delegateAddress} on ` +
          `${record.contractAddress} (block ${record.blockNumber})`,
      );
    }
  }

  state.lastScannedBlock = currentBlock;
}
