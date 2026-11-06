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
  /** `Claimed(uint256 indexed batchId, address indexed account, euint64 amount)` */
  Claimed: eventTopic("Claimed(uint256,address,bytes32)"),
  /** `Quit(uint256 indexed batchId, address indexed account, euint64 amount)` */
  Quit: eventTopic("Quit(uint256,address,bytes32)"),
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

function matchJoined(
  log: RawLog,
  batcher: Address,
  account: Address | undefined,
): JoinedEvent | null {
  if (log.address !== undefined && getAddress(log.address) !== batcher) {
    return null;
  }
  const event = decodeJoined(log);
  if (!event || (account !== undefined && event.account !== account)) {
    return null;
  }
  return event;
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
  return takeJoined([...logs], batcher, account);
}

/**
 * {@link findJoined} for a receipt with several `Joined` logs to the same
 * account: removes the match from `logs`, so walking the legs in order pairs
 * each with its own log even when the adapter omits emitter addresses.
 */
export function takeJoined(
  logs: RawLog[],
  batcher: Address,
  account?: Address,
): JoinedEvent | null {
  const normalizedAccount = account ? getAddress(account) : undefined;
  for (const [index, log] of logs.entries()) {
    const event = matchJoined(log, batcher, normalizedAccount);
    if (event) {
      logs.splice(index, 1);
      return event;
    }
  }
  return null;
}

/**
 * The batches `account` joined and has not yet claimed or quit, by ascending
 * batch id: what a UI still has to show for that batcher.
 *
 * Pass the batcher's `Joined`, `Claimed` and `Quit` logs for the account in
 * chain order, as `getLogs` returns them. A quit followed by a new join in the
 * same batch opens it again. Logs from other batchers or accounts are ignored;
 * logs carrying no emitter address are kept, since some adapters omit it.
 *
 * @example
 * ```ts
 * const logs = await publicClient.request({
 *   method: "eth_getLogs",
 *   params: [{
 *     address: batcher,
 *     topics: [[VaultTopics.Joined, VaultTopics.Claimed, VaultTopics.Quit], null, pad(account)],
 *     fromBlock: toHex(deployBlock),
 *   }],
 * });
 * const open = openBatchIds(logs, batcher, account);
 * ```
 */
export function openBatchIds(
  logs: readonly RawLog[],
  batcher: Address,
  account: Address,
): bigint[] {
  const normalizedBatcher = getAddress(batcher);
  const normalizedAccount = getAddress(account);
  const open = new Set<bigint>();
  for (const log of logs) {
    if (log.address !== undefined && getAddress(log.address) !== normalizedBatcher) {
      continue;
    }
    const [topic, batchId, accountTopic] = log.topics;
    if (batchId === undefined || accountTopic === undefined) {
      continue;
    }
    if (topicToAddress(accountTopic) !== normalizedAccount) {
      continue;
    }
    if (topic === VaultTopics.Joined) {
      open.add(BigInt(batchId));
    } else if (topic === VaultTopics.Claimed || topic === VaultTopics.Quit) {
      open.delete(BigInt(batchId));
    }
  }
  return [...open].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
