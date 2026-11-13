import { getAddress } from "viem";
import { describe, expect, joinedLog, test } from "../../test-fixtures";
import { USER } from "../../test-fixtures/constants";
import { takeJoinedBatchId } from "../joined";

const ALPHA = getAddress("0xAaaAaAAaAaAAaAaAAaaAaaAaAaAAaAaAaAAAAaaA");
const BETA = getAddress("0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC");
const OTHER = getAddress("0x6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a");

describe("takeJoinedBatchId", () => {
  test("matches the batcher and the account, and removes the log it matched", () => {
    const logs = [
      joinedLog({ batcher: ALPHA, account: OTHER, batchId: 1n }),
      joinedLog({ batcher: ALPHA, account: USER, batchId: 2n }),
      joinedLog({ batcher: BETA, account: USER, batchId: 3n }),
    ];
    expect(takeJoinedBatchId(logs, BETA, USER)).toBe(3n);
    expect(takeJoinedBatchId(logs, ALPHA, USER)).toBe(2n);
    expect(logs).toHaveLength(1);
    expect(takeJoinedBatchId(logs, ALPHA, USER)).toBeNull();
  });

  test("pairs legs with logs in order when the adapter omits the emitter address", () => {
    const logs = [
      joinedLog({ batcher: ALPHA, account: USER, batchId: 4n }),
      joinedLog({ batcher: BETA, account: USER, batchId: 5n }),
    ].map(({ topics, data }) => ({ topics, data }));
    expect(takeJoinedBatchId(logs, ALPHA, USER)).toBe(4n);
    expect(takeJoinedBatchId(logs, BETA, USER)).toBe(5n);
  });
});
