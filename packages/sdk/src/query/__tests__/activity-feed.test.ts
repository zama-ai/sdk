import { describe, expect, test, vi } from "../../test-fixtures";
import type { RawLog } from "../../events/onchain-events";
import { Topics } from "../../events/onchain-events";
import type { Address } from "../../token/token.types";
import { activityFeedQueryOptions } from "../activity-feed";

const USER = "0x2222222222222222222222222222222222222222";
const TOKEN = "0x1111111111111111111111111111111111111111";
const OTHER = "0x3333333333333333333333333333333333333333";

const topic = (hex: string) => `0x${hex.padStart(64, "0")}`;
const bytes32 = (hex: string): Address => `0x${hex.padStart(64, "0")}`;

function transferLog(from: string, to: string, handle: string): RawLog {
  return {
    topics: [Topics.ConfidentialTransfer, topic(from.slice(2)), topic(to.slice(2)), handle],
    data: "0x",
  };
}

describe("activityFeedQueryOptions", () => {
  test("uses expected key shape and staleTime Infinity", ({ mockToken }) => {
    const options = activityFeedQueryOptions(mockToken, {
      userAddress: USER,
      logs: [],
      logsKey: "log-cache-key",
    });

    expect(options.queryKey).toEqual([
      "zama.activityFeed",
      {
        tokenAddress: mockToken.address,
        userAddress: USER,
        logsKey: "log-cache-key",
        decrypt: true,
      },
    ]);
    expect(options.staleTime).toBe(Infinity);
  });

  test("enabled is false when userAddress is missing", ({ mockToken }) => {
    const options = activityFeedQueryOptions(mockToken, { logs: [] });

    expect(options.enabled).toBe(false);
  });

  test("enabled is false when logs are missing", ({ mockToken }) => {
    const options = activityFeedQueryOptions(mockToken, { userAddress: USER });

    expect(options.enabled).toBe(false);
  });

  test("enabled is false when query.enabled is false", ({ mockToken }) => {
    const options = activityFeedQueryOptions(
      mockToken,
      { userAddress: USER, logs: [] },
      { query: { enabled: false } },
    );

    expect(options.enabled).toBe(false);
  });

  test("queryFn returns empty array when required runtime params are missing", async ({
    token,
  }) => {
    const missingLogs = activityFeedQueryOptions(token, { userAddress: USER });
    const missingUser = activityFeedQueryOptions(token, { logs: [] });

    await expect(missingLogs.queryFn({ queryKey: missingLogs.queryKey })).resolves.toEqual([]);
    await expect(missingUser.queryFn({ queryKey: missingUser.queryKey })).resolves.toEqual([]);
  });

  test("queryFn parses, decrypts handles, applies decrypted values, and sorts", async ({
    createMockReadonlyToken,
  }) => {
    const token = createMockReadonlyToken(TOKEN);
    const handleA = bytes32("aa".repeat(32));
    const handleB = bytes32("bb".repeat(32));
    vi.mocked(token.decryptHandles).mockResolvedValue(
      new Map<Address, bigint>([
        [handleA, 7n],
        [handleB, 3n],
      ]),
    );

    const logs = [
      {
        ...transferLog(USER, OTHER, handleA),
        blockNumber: 5n,
        logIndex: 0,
      },
      {
        ...transferLog(OTHER, USER, handleB),
        blockNumber: 10n,
        logIndex: 0,
      },
    ];

    const options = activityFeedQueryOptions(token, {
      userAddress: USER,
      logs,
      logsKey: "pipeline",
    });

    const result = await options.queryFn({ queryKey: options.queryKey });

    expect(token.decryptHandles).toHaveBeenCalledWith([handleA, handleB], USER);
    expect(result).toHaveLength(2);
    expect(result[0]?.metadata.blockNumber).toBe(10n);
    expect(result[1]?.metadata.blockNumber).toBe(5n);
    expect(result[0]?.amount).toEqual({
      type: "encrypted",
      handle: handleB,
      decryptedValue: 3n,
    });
    expect(result[1]?.amount).toEqual({
      type: "encrypted",
      handle: handleA,
      decryptedValue: 7n,
    });
  });

  test("queryFn skips decryption when decrypt is false", async ({ createMockReadonlyToken }) => {
    const token = createMockReadonlyToken(TOKEN);
    const handle = bytes32("cc".repeat(32));
    const logs = [{ ...transferLog(USER, OTHER, handle), blockNumber: 1n, logIndex: 0 }];

    const options = activityFeedQueryOptions(token, {
      userAddress: USER,
      logs,
      decrypt: false,
      logsKey: "no-decrypt",
    });

    const result = await options.queryFn({ queryKey: options.queryKey });

    expect(token.decryptHandles).not.toHaveBeenCalled();
    expect(result).toEqual([
      expect.objectContaining({
        amount: { type: "encrypted", handle },
      }),
    ]);
  });
});
