"use client";

import { useEffect, useMemo, useState } from "react";
import {
  decimalsContract,
  nameContract,
  rateContract,
  symbolContract,
  type Address,
} from "@zama-fhe/sdk";
import { getAddress, isAddress, parseAbi } from "viem";
import { useReadContracts } from "wagmi";
import { defineVault, type BatchRef } from "@zama-fhe/sdk/vaults";
import type { BatchVault } from "@/lib/networks";

/** The configured vault, on its own: every join has a single leg, so it lands in a single batch. */
export function singleVault(vault: BatchVault) {
  return defineVault({
    id: "main",
    chainId: vault.chainId,
    batchers: { deposit: vault.depositBatcher, redeem: vault.redeemBatcher },
  });
}

export type Vault = ReturnType<typeof singleVault>;

// What a batcher exposes about the vault it joins.
const BATCHER_ABI = parseAbi([
  "function fromToken() view returns (address)",
  "function toToken() view returns (address)",
  "function vault() view returns (address)",
]);

export interface VaultDetails {
  /** The ERC-4626 vault's name. */
  name: string;
  /** The ERC-4626 vault. */
  erc4626: Address;
  /** `rate` is the wrapper's underlying units per confidential unit. */
  asset: { address: Address; symbol: string; decimals: number; rate: bigint };
  share: { address: Address; symbol: string; decimals: number; rate: bigint };
}

/**
 * What each vault's deposit batcher points at, by vault index: the asset it takes, the share it
 * pays out, and the ERC-4626 vault, with their names, decimals and wrapper rates. A vault's
 * details are `undefined` while its reads load, and its error is set if one of them failed.
 */
export function useVaultDetails(vaults: BatchVault[]): {
  details: (VaultDetails | undefined)[];
  errors: (Error | undefined)[];
} {
  const { data: targets, error: targetsError } = useReadContracts({
    contracts: vaults.flatMap((vault) =>
      (["fromToken", "toToken", "vault"] as const).map((functionName) => ({
        address: vault.depositBatcher,
        abi: BATCHER_ABI,
        functionName,
        chainId: vault.chainId,
      })),
    ),
  });
  // Only the vaults whose batcher answered get their tokens read.
  const resolved = useMemo(
    () =>
      vaults.flatMap((vault, index) => {
        const [asset, share, erc4626] = [0, 1, 2].map((k) => targets?.[3 * index + k]?.result);
        return asset && share && erc4626
          ? [{ index, chainId: vault.chainId, asset, share, erc4626 }]
          : [];
      }),
    [vaults, targets],
  );
  const { data: reads, error: readsError } = useReadContracts({
    contracts: resolved.flatMap(({ chainId, asset, share, erc4626 }) => [
      { ...nameContract(erc4626), chainId },
      { ...symbolContract(asset), chainId },
      { ...decimalsContract(asset), chainId },
      { ...rateContract(asset), chainId },
      { ...symbolContract(share), chainId },
      { ...decimalsContract(share), chainId },
      { ...rateContract(share), chainId },
    ]),
    query: { enabled: resolved.length > 0 },
  });

  // TanStack keeps `targets` and `reads` stable between equal reads, so this is rebuilt only
  // when a read changes, and callers can key memos and queries on it.
  return useMemo(() => {
    const details: (VaultDetails | undefined)[] = vaults.map(() => undefined);
    const errors = vaults.map(
      (_, index) =>
        targetsError ??
        targets?.slice(3 * index, 3 * index + 3).find((read) => read.status === "failure")?.error,
    );
    resolved.forEach(({ index, asset, share, erc4626 }, k) => {
      const results = reads?.slice(7 * k, 7 * k + 7);
      const error = readsError ?? results?.find((read) => read.status === "failure")?.error;
      if (error) {
        errors[index] = error;
        return;
      }
      if (results?.length !== 7) {
        return;
      }
      // One vault's seven reads, in the order they were listed above.
      const [name, assetSymbol, assetDecimals, assetRate, shareSymbol, shareDecimals, shareRate] =
        results.map((read) => read.result) as [
          string,
          string,
          number,
          bigint,
          string,
          number,
          bigint,
        ];
      details[index] = {
        name,
        erc4626,
        asset: { address: asset, symbol: assetSymbol, decimals: assetDecimals, rate: assetRate },
        share: { address: share, symbol: shareSymbol, decimals: shareDecimals, rate: shareRate },
      };
    });
    return { details, errors };
  }, [vaults, targets, targetsError, resolved, reads, readsError]);
}

// Each deposit or withdrawal returns the batch it landed in, and the app needs it to read and act
// on that batch later. This app keeps them in localStorage. A production app would rather read
// them from an indexer of the batchers' `Joined` events, so they follow the user to another device.

/** One key per batch: joining the same open batch twice gives the same batch. */
export const batchKey = (batch: BatchRef) => `${batch.batcher}:${batch.batchId}`;

// Batch ids are bigints, which JSON cannot hold: store them as strings. Anything else in storage
// (an older format, a hand edit, another batcher than the configured one) is dropped.
function load(key: string, chainId: number, batcher: Address): BatchRef[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    if (!Array.isArray(stored)) {
      return [];
    }
    return stored.flatMap((entry: unknown): BatchRef[] => {
      const { batcher: stored, batchId } = (entry ?? {}) as Record<string, unknown>;
      return typeof stored === "string" &&
        isAddress(stored) &&
        getAddress(stored) === getAddress(batcher) &&
        typeof batchId === "string" &&
        /^\d+$/.test(batchId)
        ? [{ chainId, batcher: getAddress(stored), batchId: BigInt(batchId) }]
        : [];
    });
  } catch {
    return [];
  }
}

function save(key: string, batches: BatchRef[]) {
  try {
    localStorage.setItem(
      key,
      JSON.stringify(batches, (_name, value: unknown) =>
        typeof value === "bigint" ? value.toString() : value,
      ),
    );
  } catch {
    // Storage can be full or blocked: the batches then last until the page reloads.
  }
}

/** The batches `account` joined on `batcher` and has not claimed or taken back yet. */
export function useJoinedBatches(chainId: number, account: Address, batcher: Address) {
  const key = `vault-batches:${chainId}:${account.toLowerCase()}:${batcher.toLowerCase()}`;
  const [batches, setBatches] = useState(() => load(key, chainId, batcher));
  useEffect(() => save(key, batches), [key, batches]);
  return {
    batches,
    add: (batch: BatchRef) =>
      setBatches((current) =>
        current.some((stored) => batchKey(stored) === batchKey(batch))
          ? current
          : [...current, batch],
      ),
    remove: (batch: BatchRef) =>
      setBatches((current) => current.filter((stored) => batchKey(stored) !== batchKey(batch))),
  };
}
