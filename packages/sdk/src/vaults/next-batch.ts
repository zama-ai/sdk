import type { Address } from "viem";
import { VaultBatcherPausedError, VaultBatcherReadFailedError } from "../errors";
import type { GenericProvider } from "../types";
import { batchersOf, type BatcherEntry, type Vault } from "./config";
import {
  batchCreatedAtContract,
  batchMinBatchAgeContract,
  batchStateContract,
  closedContract,
  currentBatchIdContract,
  pausedContract,
} from "./contracts";
import type { JoinDirection } from "./types";

/** A join sent this close to its batch's due time can land after the dispatch and wait a whole cycle. */
export const JOIN_MARGIN_SECONDS = 60n;

// The index of "dispatched" in the batcher's `BatchState` enum.
const DISPATCHED = 1;

/** What one batcher offers a join. */
export type BatcherOffer =
  | {
      readonly status: "open";
      readonly batcher: Address;
      readonly batchId: bigint;
      readonly dispatchableAt: bigint;
      /** The previous batch is still in flight, so `dispatchBatch` reverts until it settles. */
      readonly blocked: boolean;
    }
  | {
      readonly status: "paused";
      readonly batcher: Address;
      readonly batchId: bigint;
      readonly dispatchableAt: bigint;
    }
  /** Closed on chain, or past its configured `lastBatchId`: it never takes a join again. */
  | { readonly status: "closed"; readonly batcher: Address };

export type OpenOffer = Extract<BatcherOffer, { status: "open" }>;
export type PausedOffer = Extract<BatcherOffer, { status: "paused" }>;

function soonest(offers: readonly OpenOffer[]): OpenOffer | undefined {
  return [...offers].sort((a, b) => {
    if (a.dispatchableAt !== b.dispatchableAt) {
      return a.dispatchableAt < b.dispatchableAt ? -1 : 1;
    }
    // Same order on every client, so a tie does not split the joins.
    const [left, right] = [a.batcher.toLowerCase(), b.batcher.toLowerCase()];
    return left < right ? -1 : left > right ? 1 : 0;
  })[0];
}

/**
 * The batch a join reaches, or a paused batcher's batch when none is open; `undefined` when every batcher is closed.
 *
 * @internal
 */
export function pickNextBatch(
  offers: readonly BatcherOffer[],
  now: bigint,
): OpenOffer | PausedOffer | undefined {
  const open = offers.filter((offer): offer is OpenOffer => offer.status === "open");
  return (
    soonest(open.filter((o) => !o.blocked && o.dispatchableAt >= now + JOIN_MARGIN_SECONDS)) ??
    soonest(open.filter((o) => o.blocked)) ??
    soonest(open) ??
    offers.find((offer): offer is PausedOffer => offer.status === "paused")
  );
}

/**
 * The batch a join into each vault reaches, in vault order, and the chain time it was picked at.
 * Never cached: it moves with every dispatch.
 *
 * @internal
 * @throws if a vault lists no batcher, or an address or `lastBatchId` is invalid. {@link ConfigurationError}
 * @throws if every batcher of a vault is closed. {@link VaultBatcherPausedError}
 * @throws if a batcher cannot be read. {@link VaultBatcherReadFailedError}
 */
export async function readNextBatches(
  provider: GenericProvider,
  chainId: number,
  vaults: readonly Vault[],
  direction: JoinDirection,
): Promise<{ readonly now: bigint; readonly next: readonly (OpenOffer | PausedOffer)[] }> {
  const listed = vaults.map((vault) => ({ vault, entries: batchersOf(vault, direction) }));
  const [now, offers] = await Promise.all([
    provider.getBlockTimestamp(chainId),
    Promise.all(
      listed.map(({ vault, entries }) =>
        Promise.all(entries.map((entry) => offerOf(provider, chainId, vault.id, entry))),
      ),
    ),
  ]);
  const next = listed.map(({ vault, entries }, index) => {
    const picked = pickNextBatch(offers[index] ?? [], now);
    if (picked === undefined) {
      throw new VaultBatcherPausedError(
        `Every ${direction} batcher of vault "${vault.id}" is closed, so the vault takes no joins`,
        { batcher: entries[0].address, vaultId: vault.id },
      );
    }
    return picked;
  });
  return { now, next };
}

/**
 * Whether the batch before `batchId` is still in flight. `dispatchBatch` reverts then, on
 * batchers with `PreviousBatchInFlight`.
 *
 * @internal
 */
export async function waitsOnPrevious(
  provider: GenericProvider,
  chainId: number,
  batcher: Address,
  batchId: bigint,
): Promise<boolean> {
  if (batchId <= 1n) {
    return false;
  }
  const state = await provider.readContract({
    ...batchStateContract(batcher, batchId - 1n),
    chainId,
  });
  return state === DISPATCHED;
}

async function offerOf(
  provider: GenericProvider,
  chainId: number,
  vaultId: string,
  entry: BatcherEntry,
): Promise<BatcherOffer> {
  const details = { batcher: entry.address, vaultId };
  const where = `vault "${vaultId}"`;
  let offer: BatcherOffer | undefined;
  try {
    // A stale read is most likely one block behind, so one more read settles it.
    offer =
      (await readOffer(provider, chainId, entry)) ?? (await readOffer(provider, chainId, entry));
  } catch (cause) {
    throw new VaultBatcherReadFailedError(
      `Could not read batcher ${entry.address} of ${where}`,
      details,
      { cause },
    );
  }
  if (offer === undefined) {
    throw new VaultBatcherReadFailedError(
      `Batcher ${entry.address} of ${where} has no open batch but is not closed; the RPC returned reads from different blocks`,
      details,
      { retryable: true },
    );
  }
  return offer;
}

// `undefined` when the reads disagree: a current batch with no creation time on a batcher that is not closed.
async function readOffer(
  provider: GenericProvider,
  chainId: number,
  { address: batcher, lastBatchId }: BatcherEntry,
): Promise<BatcherOffer | undefined> {
  const [paused, batchId] = await Promise.all([
    provider.readContract({ ...pausedContract(batcher), chainId }),
    provider.readContract({ ...currentBatchIdContract(batcher), chainId }),
  ]);
  if (lastBatchId !== undefined && batchId > lastBatchId) {
    return { status: "closed", batcher };
  }
  const [createdAt, minAge, blocked] = await Promise.all([
    provider.readContract({ ...batchCreatedAtContract(batcher, batchId), chainId }),
    provider.readContract({ ...batchMinBatchAgeContract(batcher, batchId), chainId }),
    paused ? false : waitsOnPrevious(provider, chainId, batcher, batchId),
  ]);
  // A closed batcher never opens its next batch. Otherwise, a node behind the one that
  // returned `batchId` has not seen the batch open yet.
  if (createdAt === 0n) {
    return (await isClosed(provider, chainId, batcher)) ? { status: "closed", batcher } : undefined;
  }
  const dispatchableAt = createdAt + minAge;
  return paused
    ? { status: "paused", batcher, batchId, dispatchableAt }
    : { status: "open", batcher, batchId, dispatchableAt, blocked };
}

// A batcher deployed before `closed()` reverts on it, and it never closes on chain either.
async function isClosed(
  provider: GenericProvider,
  chainId: number,
  batcher: Address,
): Promise<boolean> {
  try {
    return await provider.readContract({ ...closedContract(batcher), chainId });
  } catch {
    return false;
  }
}
