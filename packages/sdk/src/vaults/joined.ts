import { getAddress, type Address } from "viem";
import { eventTopic, topicToAddress } from "../events/log-decoding";
import type { RawLog } from "../types/transaction";

const JOINED = eventTopic("Joined(uint256,address,bytes32)");

/**
 * The batch id of the first `Joined(batchId, account, amount)` log from
 * `batcher` to `account`, removed from `logs` so the next leg cannot match it.
 * A log without an emitter address still matches, since some adapters omit it;
 * walking the legs in order then pairs each leg with its own log.
 *
 * Internal on purpose: event decoding is not public API.
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
