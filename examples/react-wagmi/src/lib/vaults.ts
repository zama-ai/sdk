"use client";

import { useState } from "react";
import type { Address } from "@zama-fhe/sdk";
import { defineVaults, type Direction, type VaultRecord } from "@zama-fhe/sdk/vaults";
import type { BatchVault } from "@/lib/networks";

/** The vaults config for one vault: a group of one, so a join has a single leg. */
export function vaultsConfig(vault: BatchVault, asset: Address) {
  return defineVaults({
    chainId: vault.chainId,
    groups: {
      main: {
        asset,
        vaults: {
          main: { depositBatcher: vault.depositBatcher, redeemBatcher: vault.redeemBatcher },
        },
      },
    },
  });
}

export type Vaults = ReturnType<typeof vaultsConfig>;
export type JoinRecord = VaultRecord<Vaults>;

// Each deposit or withdrawal returns a join record, and the SDK needs it to read or exit the
// position later. This app keeps the records in localStorage. A production app would rather
// keep them in its backend, so they follow the user to another device.

/** One key per join: joining the same open batch twice gives the same record. */
export const recordKey = (record: JoinRecord) =>
  record.legs.map((leg) => `${leg.batcher}:${leg.batchId}`).join(",");

// A record holds bigint batch ids, which JSON cannot hold: store them as strings.
function load(key: string): JoinRecord[] {
  try {
    const json = localStorage.getItem(key);
    return json
      ? (JSON.parse(json, (name, value: unknown) =>
          name === "batchId" && typeof value === "string" ? BigInt(value) : value,
        ) as JoinRecord[])
      : [];
  } catch {
    return [];
  }
}

function save(key: string, records: JoinRecord[]) {
  try {
    localStorage.setItem(
      key,
      JSON.stringify(records, (_name, value: unknown) =>
        typeof value === "bigint" ? value.toString() : value,
      ),
    );
  } catch {
    // Storage can be full or blocked: the records then last until the page reloads.
  }
}

/** The join records `account` has not exited yet, for one direction of the vault. */
export function useJoinRecords(chainId: number, account: Address, direction: Direction) {
  const key = `vault-records:${chainId}:${account.toLowerCase()}:${direction}`;
  const [records, setRecords] = useState(() => load(key));
  const update = (next: (records: JoinRecord[]) => JoinRecord[]) =>
    setRecords((current) => {
      const updated = next(current);
      save(key, updated);
      return updated;
    });
  return {
    records,
    add: (record: JoinRecord) =>
      update((current) =>
        current.some((stored) => recordKey(stored) === recordKey(record))
          ? current
          : [...current, record],
      ),
    remove: (record: JoinRecord) =>
      update((current) => current.filter((stored) => recordKey(stored) !== recordKey(record))),
  };
}
