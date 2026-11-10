"use client";

import { useQuery, type QueryClient } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import { openBatchIds, VaultTopics } from "@zama-fhe/sdk/vaults";
import { pad, toHex } from "viem";
import { usePublicClient } from "wagmi";

// The SDK reads the state of a batch you name; it does not list the batches an account
// joined. This app rebuilds that list from the batcher's events. A production app would
// rather keep the ids in its backend or an indexer: public RPCs often cap getLogs ranges.

const openBatchesKey = (batcher: Address, account: Address) =>
  ["open-batches", batcher, account] as const;

// A bigint cannot go in a query key: TanStack hashes keys with JSON.stringify.
export const joinedAmountKey = (batcher: Address, account: Address, batchId: bigint) =>
  ["vault-joined-amount", batcher, account, batchId.toString()] as const;

/** The batches `account` joined on `batcher` and has not claimed or quit yet. */
export function useOpenBatches(
  batcher: Address,
  account: Address,
  fromBlock: bigint,
  chainId: number,
) {
  const publicClient = usePublicClient({ chainId });
  return useQuery({
    queryKey: openBatchesKey(batcher, account),
    queryFn: async () => {
      if (!publicClient) {
        throw new Error("No RPC client for the connected chain");
      }
      const logs = await publicClient.request({
        method: "eth_getLogs",
        params: [
          {
            address: batcher,
            // Joined, Claimed and Quit all index (batchId, account): filter on the account.
            topics: [
              [VaultTopics.Joined, VaultTopics.Claimed, VaultTopics.Quit],
              null,
              pad(account),
            ],
            fromBlock: toHex(fromBlock),
            toBlock: "latest",
          },
        ],
      });
      return openBatchIds(logs, batcher, account);
    },
    enabled: publicClient !== undefined,
    // Kept up to date by hand below, so a lagging RPC cannot drop a batch just joined.
    staleTime: Infinity,
  });
}

/** Records a deposit or withdrawal: it may have joined a batch the account is already in. */
export function addOpenBatch(
  queryClient: QueryClient,
  batcher: Address,
  account: Address,
  batchId: bigint,
) {
  queryClient.setQueryData<bigint[]>(openBatchesKey(batcher, account), (ids) =>
    ids && !ids.includes(batchId) ? [...ids, batchId] : ids,
  );
  void queryClient.invalidateQueries({ queryKey: joinedAmountKey(batcher, account, batchId) });
}

/** Drops a batch after a claim or quit: its on-chain state does not change. */
export function removeOpenBatch(
  queryClient: QueryClient,
  batcher: Address,
  account: Address,
  batchId: bigint,
) {
  queryClient.setQueryData<bigint[]>(openBatchesKey(batcher, account), (ids) =>
    ids?.filter((id) => id !== batchId),
  );
}
