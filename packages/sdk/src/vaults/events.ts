import { getAddress, type Address } from "viem";
import { eventTopic, topicToAddress, wordToBytes32 } from "../events/log-decoding";
import type { EncryptedValue } from "../relayer/types";
import type { RawLog } from "../types/transaction";

/**
 * Vault batcher event topic0 constants (keccak256 of the canonical Solidity
 * signature). Pass to `getLogs({ topics: [Object.values(VaultTopics)] })`.
 */
export const VaultTopics = {
  /** `Joined(uint256 indexed batchId, address indexed account, euint64 amount)` */
  Joined: eventTopic("Joined(uint256,address,bytes32)"),
} as const;

/** A decoded `Joined` event. */
export interface JoinedEvent {
  /** The batch the join landed in. */
  batchId: bigint;
  /** The account credited — the beneficiary a join named, which may not be the caller. */
  account: Address;
  /** The encrypted amount credited, which can be zero when the pull transferred nothing. */
  confidentialAmount: EncryptedValue;
}

/**
 * Joined(uint256 indexed batchId, address indexed account, euint64 amount)
 * Indexed: batchId (topics[1]), account (topics[2])
 * Data: amount (bytes32)
 */
export function decodeJoined(log: RawLog): JoinedEvent | null {
  const [topic, batchId, account] = log.topics;
  if (topic !== VaultTopics.Joined || batchId === undefined || account === undefined) {
    return null;
  }

  return {
    batchId: BigInt(batchId),
    account: topicToAddress(account),
    confidentialAmount: wordToBytes32(log.data, 0),
  };
}

/**
 * Filters on `batcher`, and on `account` when given, rather than taking the
 * first match: one transaction can join several batchers and credit several
 * beneficiaries, so an unfiltered search can return someone else's batch id.
 * Logs carrying no emitter address are kept, since some adapters omit it.
 */
export function findJoined(
  logs: readonly RawLog[],
  batcher: Address,
  account?: Address,
): JoinedEvent | null {
  const normalizedAccount = account ? getAddress(account) : undefined;
  for (const log of logs) {
    if (log.address !== undefined && getAddress(log.address) !== batcher) {
      continue;
    }
    const event = decodeJoined(log);
    if (!event) {
      continue;
    }
    if (normalizedAccount !== undefined && event.account !== normalizedAccount) {
      continue;
    }
    return event;
  }
  return null;
}
