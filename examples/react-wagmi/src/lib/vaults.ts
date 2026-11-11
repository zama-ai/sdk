"use client";

import { useState } from "react";
import type { Address } from "@zama-fhe/sdk";
import { defineVaultGroup, type BatchRef, type Direction } from "@zama-fhe/sdk/vaults";
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

// Batch ids are bigints, which JSON cannot hold: store them as strings.
function load(key: string): BatchRef[] {
  try {
    const json = localStorage.getItem(key);
    return json
      ? (JSON.parse(json, (name, value: unknown) =>
          name === "batchId" && typeof value === "string" ? BigInt(value) : value,
        ) as BatchRef[])
      : [];
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

/** The batches `account` joined and has not claimed or taken back yet, for one direction of the vault. */
export function useJoinedBatches(chainId: number, account: Address, direction: Direction) {
  const key = `vault-batches:${chainId}:${account.toLowerCase()}:${direction}`;
  const [batches, setBatches] = useState(() => load(key));
  const update = (next: (batches: BatchRef[]) => BatchRef[]) =>
    setBatches((current) => {
      const updated = next(current);
      save(key, updated);
      return updated;
    });
  return {
    batches,
    add: (batch: BatchRef) =>
      update((current) =>
        current.some((stored) => batchKey(stored) === batchKey(batch))
          ? current
          : [...current, batch],
      ),
    remove: (batch: BatchRef) =>
      update((current) => current.filter((stored) => batchKey(stored) !== batchKey(batch))),
  };
}
