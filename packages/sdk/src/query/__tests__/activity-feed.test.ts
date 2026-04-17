import { describe, expect, test, mockQueryContext } from "../../test-fixtures";
import type { vi } from "../../test-fixtures";
import type { RawLog } from "../../events/onchain-events";
import { Topics } from "../../events/onchain-events";

import { activityFeedQueryOptions } from "../activity-feed";
import type { Address } from "viem";

const USER = "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B";
const TOKEN = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a";
const OTHER = "0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C";

const topic = (hex: string): `0x${string}` => `0x${hex.padStart(64, "0")}`;
const bytes32 = (hex: string): Address => `0x${hex.padStart(64, "0")}`;

function transferLog(from: `0x${string}`, to: `0x${string}`, handle: `0x${string}`): RawLog {
  return {
    topics: [
      Topics.ConfidentialTransfer,
      topic(from.slice(2)),
      topic(to.slice(2)),
      `0x${handle.slice(2)}`,
    ],
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

  test("derives distinct cache identity from logs when logsKey is omitted", ({ mockToken }) => {
    const logA = { ...transferLog(USER, OTHER, bytes32("aa".repeat(32))), blockNumber: 1n };
    const logB = { ...transferLog(USER, OTHER, bytes32("bb".repeat(32))), blockNumber: 1n };

    const first = activityFeedQueryOptions(mockToken, {
      userAddress: USER,
      logs: [logA],
    });
    const second = activityFeedQueryOptions(mockToken, {
      userAddress: USER,
      logs: [logB],
    });

    expect(first.queryKey).not.toEqual(second.queryKey);
  });

  test("queryFn throws when required runtime params are missing", async ({ token }) => {
    const missingLogs = activityFeedQueryOptions(token, { userAddress: USER });
    const missingUser = activityFeedQueryOptions(token, { logs: [] });

    await expect(missingLogs.queryFn(mockQueryContext(missingLogs.queryKey))).rejects.toThrow(
      "activityFeedQueryOptions: logs must not be null or undefined",
    );
    await expect(missingUser.queryFn(mockQueryContext(missingUser.queryKey))).rejects.toThrow(
      "activityFeedQueryOptions: userAddress must not be null or undefined",
    );
  });

  test("queryFn parses, decrypts handles, applies decrypted values, and sorts", async ({
    createMockReadonlyToken,
  }) => {
    const token = createMockReadonlyToken(TOKEN);
    const handleA = bytes32("aa".repeat(32));
    const handleB = bytes32("bb".repeat(32));
    (token.sdk.userDecrypt as ReturnType<typeof vi.fn>).mockResolvedValue({
      [handleA]: 7n,
      [handleB]: 3n,
    });

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

    const result = await options.queryFn(mockQueryContext(options.queryKey));

    expect(token.sdk.userDecrypt).toHaveBeenCalledWith([
      { handle: handleA, contractAddress: token.address },
      { handle: handleB, contractAddress: token.address },
    ]);
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

    const result = await options.queryFn(mockQueryContext(options.queryKey));

    expect(token.sdk.userDecrypt).not.toHaveBeenCalled();
    expect(result).toEqual([
      expect.objectContaining({
        amount: { type: "encrypted", handle },
      }),
    ]);
  });
});
