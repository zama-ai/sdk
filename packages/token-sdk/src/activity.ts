/**
 * Higher-level activity feed helpers for confidential token events.
 * Normalizes all 5 event types into a single renderable "activity item",
 * classifies direction (incoming/outgoing/self) relative to the user,
 * and supports batch-decryption of encrypted transfer amounts.
 *
 * Pure functions, no framework dependency — works with any provider.
 */

import {
  decodeConfidentialTokenEvent,
  type RawLog,
  type ConfidentialTokenEvent,
  type ConfidentialTransferEvent,
  type WrappedEvent,
  type UnwrapRequestedEvent,
  type UnwrappedFinalizedEvent,
  type UnwrappedStartedEvent,
} from "./events";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ActivityDirection = "incoming" | "outgoing" | "self";

export type ActivityType =
  | "transfer"
  | "shield"
  | "unshield_requested"
  | "unshield_started"
  | "unshield_finalized";

export type ActivityAmount =
  | { readonly type: "clear"; readonly value: bigint }
  | {
      readonly type: "encrypted";
      readonly handle: string;
      readonly decryptedValue?: bigint;
    };

export interface ActivityLogMetadata {
  readonly transactionHash?: string;
  readonly blockNumber?: bigint | number;
  readonly logIndex?: number;
}

export interface ActivityItem {
  readonly type: ActivityType;
  readonly direction: ActivityDirection;
  readonly amount: ActivityAmount;
  readonly from?: string;
  readonly to?: string;
  readonly fee?: bigint;
  readonly success?: boolean;
  readonly metadata: ActivityLogMetadata;
  readonly rawEvent: ConfidentialTokenEvent;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function addressesEqual(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function classifyDirection(
  userAddress: string,
  from: string | undefined,
  to: string | undefined,
): ActivityDirection {
  const isFrom = from !== undefined && addressesEqual(userAddress, from);
  const isTo = to !== undefined && addressesEqual(userAddress, to);

  if (isFrom && isTo) return "self";
  if (isFrom) return "outgoing";
  return "incoming";
}

function eventToActivityItem(
  event: ConfidentialTokenEvent,
  userAddress: string,
  metadata: ActivityLogMetadata,
): ActivityItem {
  switch (event.eventName) {
    case "ConfidentialTransfer":
      return buildTransfer(event, userAddress, metadata);
    case "Wrapped":
      return buildShield(event, userAddress, metadata);
    case "UnwrapRequested":
      return buildUnshieldRequested(event, userAddress, metadata);
    case "UnwrappedStarted":
      return buildUnshieldStarted(event, userAddress, metadata);
    case "UnwrappedFinalized":
      return buildUnshieldFinalized(event, metadata);
  }
}

function buildTransfer(
  event: ConfidentialTransferEvent,
  userAddress: string,
  metadata: ActivityLogMetadata,
): ActivityItem {
  return {
    type: "transfer",
    direction: classifyDirection(userAddress, event.from, event.to),
    amount: { type: "encrypted", handle: event.encryptedAmountHandle },
    from: event.from,
    to: event.to,
    metadata,
    rawEvent: event,
  };
}

function buildShield(
  event: WrappedEvent,
  userAddress: string,
  metadata: ActivityLogMetadata,
): ActivityItem {
  return {
    type: "shield",
    direction: classifyDirection(userAddress, undefined, event.to),
    amount: { type: "clear", value: event.amountIn },
    to: event.to,
    fee: event.feeAmount,
    metadata,
    rawEvent: event,
  };
}

function buildUnshieldRequested(
  event: UnwrapRequestedEvent,
  userAddress: string,
  metadata: ActivityLogMetadata,
): ActivityItem {
  return {
    type: "unshield_requested",
    direction: classifyDirection(userAddress, undefined, event.receiver),
    amount: { type: "encrypted", handle: event.encryptedAmount },
    to: event.receiver,
    metadata,
    rawEvent: event,
  };
}

function buildUnshieldStarted(
  event: UnwrappedStartedEvent,
  userAddress: string,
  metadata: ActivityLogMetadata,
): ActivityItem {
  return {
    type: "unshield_started",
    direction: classifyDirection(userAddress, undefined, event.to),
    amount: { type: "encrypted", handle: event.requestedAmount },
    to: event.to,
    success: event.returnVal,
    metadata,
    rawEvent: event,
  };
}

function buildUnshieldFinalized(
  event: UnwrappedFinalizedEvent,
  metadata: ActivityLogMetadata,
): ActivityItem {
  return {
    type: "unshield_finalized",
    // Finalized events don't carry from/to addresses, always treat as incoming
    direction: "incoming",
    amount: { type: "clear", value: event.unwrapAmount },
    fee: event.feeAmount,
    success: event.finalizeSuccess,
    metadata,
    rawEvent: event,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Decode raw logs into classified activity items.
 * Skips logs that don't match any confidential token event.
 */
export function parseActivityFeed(
  logs: readonly (RawLog & Partial<ActivityLogMetadata>)[],
  userAddress: string,
): ActivityItem[] {
  const items: ActivityItem[] = [];
  for (const log of logs) {
    const event = decodeConfidentialTokenEvent(log);
    if (!event) continue;

    const metadata: ActivityLogMetadata = {
      transactionHash: log.transactionHash,
      blockNumber: log.blockNumber,
      logIndex: log.logIndex,
    };
    items.push(eventToActivityItem(event, userAddress, metadata));
  }
  return items;
}

/**
 * Extract unique non-zero encrypted handles that need decryption.
 */
export function extractEncryptedHandles(
  items: readonly ActivityItem[],
): string[] {
  const handles = new Set<string>();
  for (const item of items) {
    if (
      item.amount.type === "encrypted" &&
      item.amount.decryptedValue === undefined
    ) {
      const h = item.amount.handle;
      // Skip zero handles
      if (h !== "0x" && h !== "0x" + "0".repeat(64)) {
        handles.add(h);
      }
    }
  }
  return [...handles];
}

/**
 * Return new activity items with decrypted values populated.
 * Items whose handles aren't in the map are returned unchanged.
 */
export function applyDecryptedValues(
  items: readonly ActivityItem[],
  decryptedMap: ReadonlyMap<string, bigint>,
): ActivityItem[] {
  return items.map((item) => {
    if (item.amount.type !== "encrypted") return item;

    const value = decryptedMap.get(item.amount.handle);
    if (value === undefined) return item;

    return {
      ...item,
      amount: {
        type: "encrypted" as const,
        handle: item.amount.handle,
        decryptedValue: value,
      },
    };
  });
}

/**
 * Sort activity items by block number, most recent first.
 * Items without a block number are placed at the beginning (most recent).
 */
export function sortByBlockNumber(
  items: readonly ActivityItem[],
): ActivityItem[] {
  return [...items].sort((a, b) => {
    const aBlock = a.metadata.blockNumber;
    const bBlock = b.metadata.blockNumber;

    if (aBlock === undefined && bBlock === undefined) return 0;
    if (aBlock === undefined) return -1;
    if (bBlock === undefined) return 1;

    // Convert to bigint for comparison
    const aBig = typeof aBlock === "bigint" ? aBlock : BigInt(aBlock);
    const bBig = typeof bBlock === "bigint" ? bBlock : BigInt(bBlock);

    if (bBig > aBig) return 1;
    if (bBig < aBig) return -1;

    // Same block: sort by logIndex descending
    const aIdx = a.metadata.logIndex ?? 0;
    const bIdx = b.metadata.logIndex ?? 0;
    return bIdx - aIdx;
  });
}
