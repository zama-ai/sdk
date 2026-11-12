import { getAddress, type Address } from "viem";
import { eventTopic, topicToAddress } from "../events/log-decoding";
import type { RawLog } from "../types/transaction";

const JOINED = eventTopic("Joined(uint256,address,bytes32)");

/**
 * The batch id of the first `Joined` log of `batcher` for `account`, or `null` if there is none.
 * Removes that log from `logs`. A log with no emitter address matches any `batcher`.
 */
export function takeJoinedBatchId(
  logs: RawLog[],
  batcher: Address,
  account: Address,
): bigint | null {
  for (const [index, log] of logs.entries()) {
    const [topic, batchId, accountTopic] = log.topics;
    if (
      topic !== JOINED ||
      batchId === undefined ||
      accountTopic === undefined ||
      // Some adapters omit the emitter address.
      (log.address !== undefined && getAddress(log.address) !== batcher) ||
      topicToAddress(accountTopic) !== account
    ) {
      continue;
    }
    logs.splice(index, 1);
    return BigInt(batchId);
  }
  return null;
}
