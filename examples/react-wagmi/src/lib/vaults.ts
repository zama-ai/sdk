"use client";

import { useMemo, useSyncExternalStore } from "react";
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
    // The vault reads are cached by chain and id, so two vaults on a chain need distinct ids.
    id: vault.depositBatcher,
    chainId: vault.chainId,
    batchers: { deposit: vault.depositBatcher, redeem: vault.redeemBatcher },
  });
}

export type Vault = ReturnType<typeof singleVault>;

/** The vault's name, or its deposit batcher until the name is read. */
export function vaultLabel(vault: BatchVault, detail: VaultDetails | undefined): string {
  return detail?.name ?? `${vault.depositBatcher.slice(0, 6)}…${vault.depositBatcher.slice(-4)}`;
}

/**
 * The contracts one permit needs for a vault: its tokens for the balances, its batchers for the
 * amounts of the batches in progress.
 */
export function vaultPermitContracts(vault: BatchVault, detail: VaultDetails): Address[] {
  return [detail.asset.address, detail.share.address, vault.depositBatcher, vault.redeemBatcher];
}

const BATCHER_ABI = parseAbi([
  "function fromToken() view returns (address)",
  "function toToken() view returns (address)",
  "function vault() view returns (address)",
]);

export interface VaultDetails {
  /** The ERC-4626 vault's name. */
  name: string;
  erc4626: Address;
  /** `rate` is the wrapper's underlying units per confidential unit. */
  asset: { address: Address; symbol: string; decimals: number; rate: bigint };
  share: { address: Address; symbol: string; decimals: number; rate: bigint };
}

/** Each vault's asset, share and ERC-4626 vault, read through its deposit batcher, by vault index. */
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

// One shared copy per account and batcher, so the views of the same batches stay in step: a
// join in a vault's card shows in the list at the top, and a claim there removes it everywhere.
const cache = new Map<string, BatchRef[]>();
const listeners = new Set<() => void>();
let version = 0;
const NONE: BatchRef[] = [];

function storageKey(chainId: number, account: Address, batcher: Address) {
  return `vault-batches:${chainId}:${account.toLowerCase()}:${batcher.toLowerCase()}`;
}

function stored(chainId: number, account: Address, batcher: Address): BatchRef[] {
  if (typeof window === "undefined") {
    return NONE;
  }
  const key = storageKey(chainId, account, batcher);
  let batches = cache.get(key);
  if (!batches) {
    batches = load(key, chainId, batcher);
    cache.set(key, batches);
  }
  return batches;
}

// A change that leaves the list as it was notifies nobody, so removing a batch twice is harmless.
function update(account: Address, batch: BatchRef, change: (current: BatchRef[]) => BatchRef[]) {
  const current = stored(batch.chainId, account, batch.batcher);
  const next = change(current);
  if (next === current) {
    return;
  }
  const key = storageKey(batch.chainId, account, batch.batcher);
  cache.set(key, next);
  save(key, next);
  version += 1;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
const currentVersion = () => version;
const serverVersion = () => 0;

export function addJoinedBatch(account: Address, batch: BatchRef) {
  update(account, batch, (current) =>
    current.some((entry) => batchKey(entry) === batchKey(batch)) ? current : [...current, batch],
  );
}

/** Forget a batch once it is claimed or taken back. */
export function removeJoinedBatch(account: Address, batch: BatchRef) {
  update(account, batch, (current) =>
    current.some((entry) => batchKey(entry) === batchKey(batch))
      ? current.filter((entry) => batchKey(entry) !== batchKey(batch))
      : current,
  );
}

/** The batches `account` joined on each batcher and has not claimed or taken back yet. */
export function useJoinedBatches(
  account: Address,
  batchers: readonly { chainId: number; batcher: Address }[],
): BatchRef[][] {
  // Re-renders on every change to the store; each list is the cached array until it changes.
  useSyncExternalStore(subscribe, currentVersion, serverVersion);
  return batchers.map(({ chainId, batcher }) => stored(chainId, account, batcher));
}
