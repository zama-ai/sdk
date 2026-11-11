"use client";

import { useEffect, useState } from "react";
import type { Address } from "@zama-fhe/sdk";
import { getAddress, isAddress } from "viem";
import { defineVaultGroup, type BatchRef } from "@zama-fhe/sdk/vaults";
import type { BatchVault } from "@/lib/networks";

/** The vault as a group of one: every join has a single leg, so it lands in a single batch. */
export function vaultGroup(vault: BatchVault, asset: Address, share: Address) {
  return defineVaultGroup({
    id: "main",
    chainId: vault.chainId,
    asset,
    vaults: [
      {
        id: "main",
        batchers: { deposit: vault.depositBatcher, redeem: vault.redeemBatcher },
        share,
      },
    ],
  });
}

export type Vault = ReturnType<typeof vaultGroup>;

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
