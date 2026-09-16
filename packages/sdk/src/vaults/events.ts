import { getAddress, keccak256, toBytes, type Address, type Hex } from "viem";
import type { EncryptedValue } from "../relayer/types";
import type { RawLog } from "../types/transaction";

/** `Joined(uint256 indexed batchId, address indexed account, euint64 amount)` */
const JOINED_TOPIC: Hex = keccak256(toBytes("Joined(uint256,address,bytes32)"));

/** A decoded `Joined` event. */
export interface JoinedEvent {
  /** The batch the join landed in. */
  batchId: bigint;
  /** The account credited — the beneficiary a join named, which may not be the caller. */
  account: Address;
  /** The encrypted amount credited, which can be zero when the pull transferred nothing. */
  confidentialAmount: EncryptedValue;
}

function decodeJoined(log: RawLog): JoinedEvent | null {
  const [topic, batchId, account] = log.topics;
  if (topic !== JOINED_TOPIC || batchId === undefined || account === undefined) {
    return null;
  }
  return {
    batchId: BigInt(batchId),
    account: getAddress(`0x${account.slice(-40)}`),
    // The sole non-indexed argument, so it occupies the first data word.
    confidentialAmount: `0x${log.data.slice(2, 66)}` as EncryptedValue,
  };
}

/**
 * Scoped to `batcher` rather than taking the first match: one transaction can
 * join several batchers, and each must read its own event. Logs that carry no
 * emitter address (older custom adapters) are kept.
 */
export function findJoined(logs: readonly RawLog[], batcher: Address): JoinedEvent | null {
  for (const log of logs) {
    if (log.address !== undefined && getAddress(log.address) !== batcher) {
      continue;
    }
    const event = decodeJoined(log);
    if (event) {
      return event;
    }
  }
  return null;
}
