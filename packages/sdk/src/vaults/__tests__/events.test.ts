import type { Address } from "viem";
import { describe, expect, joinedLog, test } from "../../test-fixtures";
import type { RawLog } from "../../types/transaction";
import { openBatchIds, VaultTopics } from "../events";

const BATCHER = "0x7777777777777777777777777777777777777777" as Address;
const OTHER_BATCHER = "0x8b8b8b8b8B8B8b8B8B8b8b8b8b8B8B8B8B8b8B8b" as Address;
const ACCOUNT = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address;
const OTHER_ACCOUNT = "0x1111111111111111111111111111111111111111" as Address;

function log(topic: keyof typeof VaultTopics, batchId: bigint, account = ACCOUNT): RawLog {
  const joined = joinedLog({ batcher: BATCHER, batchId, account });
  return { ...joined, topics: [VaultTopics[topic], ...joined.topics.slice(1)] };
}

describe("openBatchIds", () => {
  test("keeps joined batches and drops claimed and quit ones", () => {
    const logs = [
      log("Joined", 3n),
      log("Joined", 1n),
      log("Joined", 2n),
      log("Claimed", 1n),
      log("Quit", 2n),
    ];
    expect(openBatchIds(logs, BATCHER, ACCOUNT)).toEqual([3n]);
  });

  test("reopens a batch joined again after a quit, and sorts by batch id", () => {
    const logs = [log("Joined", 5n), log("Joined", 4n), log("Quit", 5n), log("Joined", 5n)];
    expect(openBatchIds(logs, BATCHER, ACCOUNT)).toEqual([4n, 5n]);
  });

  test("ignores other batchers and other accounts", () => {
    const logs = [
      { ...log("Joined", 1n), address: OTHER_BATCHER },
      log("Joined", 2n, OTHER_ACCOUNT),
      log("Joined", 3n),
    ];
    expect(openBatchIds(logs, BATCHER, ACCOUNT.toLowerCase() as Address)).toEqual([3n]);
  });
});
