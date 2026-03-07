import { describe, it, expect } from "../test-fixtures";
import {
  parseActivityFeed,
  extractEncryptedHandles,
  applyDecryptedValues,
  sortByBlockNumber,
  type ActivityItem,
} from "../activity";
import type { Handle } from "../relayer/relayer-sdk.types";
import type { Hex } from "viem";
import { Topics, type RawLog } from "../events";

// Helpers (matching events.test.ts conventions)
const addr = (hex: string): Hex => `0x${hex.padStart(40, "0")}`;
const topic = (hex: string): Hex => `0x${hex.padStart(64, "0")}`;
const word = (hex: string) => hex.padStart(64, "0");
const bytes32 = (hex: string): Handle => `0x${hex.padStart(64, "0")}`;

const USER = addr("aaa1");
const OTHER = addr("bbb2");

// ---------------------------------------------------------------------------
// Log builders
// ---------------------------------------------------------------------------

function transferLog(from: string, to: string, handle: string): RawLog {
  return {
    topics: [Topics.ConfidentialTransfer, topic(from.slice(2)), topic(to.slice(2)), handle as Hex],
    data: "0x",
  };
}

function wrappedLog(to: string, amountIn: bigint, feeAmount: bigint): RawLog {
  return {
    topics: [Topics.Wrapped, topic(to.slice(2)), topic("1")],
    data: `0x${word(amountIn.toString(16))}${word(amountIn.toString(16))}${word(feeAmount.toString(16))}`,
  };
}

function unwrapRequestedLog(receiver: string, handle: string): RawLog {
  return {
    topics: [Topics.UnwrapRequested, topic(receiver.slice(2))],
    data: `0x${word(handle.slice(2))}`,
  };
}

function unwrappedStartedLog(to: string, requestedAmount: string): RawLog {
  return {
    topics: [
      Topics.UnwrappedStarted,
      topic("a"), // requestId
      topic("b"), // txId
      topic(to.slice(2)),
    ],
    data: `0x${word("1")}${word("beef")}${word(requestedAmount.slice(2))}${word("22".repeat(32))}` as Hex,
  };
}

function unwrappedFinalizedLog(unwrapAmount: bigint, feeAmount: bigint, success: boolean): RawLog {
  return {
    topics: [
      Topics.UnwrappedFinalized,
      bytes32("ab".repeat(32)), // burntAmountHandle
      topic("7"), // nextTxId
    ],
    data: `0x${word(success ? "1" : "0")}${word("1")}${word("1f4")}${word(unwrapAmount.toString(16))}${word(feeAmount.toString(16))}`,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("parseActivityFeed", () => {
  it("parses a ConfidentialTransfer as outgoing", () => {
    const handle = bytes32("cc".repeat(32));
    const logs = [transferLog(USER, OTHER, handle)];
    const items = parseActivityFeed(logs, USER);

    expect(items).toHaveLength(1);
    expect(items[0]!.type).toBe("transfer");
    expect(items[0]!.direction).toBe("outgoing");
    expect(items[0]!.amount).toEqual({ type: "encrypted", handle });
    expect(items[0]!.from).toBe(USER);
    expect(items[0]!.to).toBe(OTHER);
  });

  it("parses a ConfidentialTransfer as incoming", () => {
    const handle = bytes32("dd".repeat(32));
    const logs = [transferLog(OTHER, USER, handle)];
    const items = parseActivityFeed(logs, USER);

    expect(items).toHaveLength(1);
    expect(items[0]!.direction).toBe("incoming");
  });

  it("parses a self-transfer", () => {
    const handle = bytes32("ee".repeat(32));
    const logs = [transferLog(USER, USER, handle)];
    const items = parseActivityFeed(logs, USER);

    expect(items).toHaveLength(1);
    expect(items[0]!.direction).toBe("self");
  });

  it("handles case-insensitive address comparison", () => {
    const handle = bytes32("ff".repeat(32));
    const upperUser = USER.toUpperCase().replace("0X", "0x") as Hex;
    const logs = [transferLog(USER, OTHER, handle)];
    const items = parseActivityFeed(logs, upperUser);

    expect(items[0]!.direction).toBe("outgoing");
  });

  it("parses a Wrapped event as shield", () => {
    const logs = [wrappedLog(USER, 1000n, 50n)];
    const items = parseActivityFeed(logs, USER);

    expect(items).toHaveLength(1);
    expect(items[0]!.type).toBe("shield");
    expect(items[0]!.direction).toBe("incoming");
    expect(items[0]!.amount).toEqual({ type: "clear", value: 1000n });
    expect(items[0]!.fee).toBe(50n);
  });

  it("parses an UnwrapRequested event", () => {
    const handle = bytes32("ab".repeat(32));
    const logs = [unwrapRequestedLog(USER, handle)];
    const items = parseActivityFeed(logs, USER);

    expect(items).toHaveLength(1);
    expect(items[0]!.type).toBe("unshield_requested");
    expect(items[0]!.direction).toBe("incoming");
    expect(items[0]!.amount).toEqual({ type: "encrypted", handle });
  });

  it("parses an UnwrappedStarted event", () => {
    const handle = bytes32("11".repeat(32));
    const logs = [unwrappedStartedLog(USER, handle)];
    const items = parseActivityFeed(logs, USER);

    expect(items).toHaveLength(1);
    expect(items[0]!.type).toBe("unshield_started");
    expect(items[0]!.direction).toBe("incoming");
    expect(items[0]!.success).toBe(true);
  });

  it("parses an UnwrappedFinalized event", () => {
    const logs = [unwrappedFinalizedLog(450n, 50n, true)];
    const items = parseActivityFeed(logs, USER);

    expect(items).toHaveLength(1);
    expect(items[0]!.type).toBe("unshield_finalized");
    expect(items[0]!.amount).toEqual({ type: "clear", value: 450n });
    expect(items[0]!.fee).toBe(50n);
    expect(items[0]!.success).toBe(true);
  });

  it("preserves metadata from logs", () => {
    const handle = bytes32("cc".repeat(32));
    const log = {
      ...transferLog(USER, OTHER, handle),
      transactionHash: "0xdeadbeef" as Hex,
      blockNumber: 42n,
      logIndex: 3,
    };
    const items = parseActivityFeed([log], USER);

    expect(items[0]!.metadata).toEqual({
      transactionHash: "0xdeadbeef",
      blockNumber: 42n,
      logIndex: 3,
    });
  });

  it("skips unknown logs", () => {
    const logs: (RawLog & { blockNumber?: bigint })[] = [
      { topics: [topic("00".repeat(32))], data: "0x" as Hex },
      {
        ...transferLog(USER, OTHER, bytes32("cc".repeat(32))),
        blockNumber: 1n,
      },
    ];
    const items = parseActivityFeed(logs, USER);
    expect(items).toHaveLength(1);
  });

  it("parses mixed event types", () => {
    const logs = [
      transferLog(USER, OTHER, bytes32("cc".repeat(32))),
      wrappedLog(USER, 500n, 10n),
      unwrappedFinalizedLog(200n, 20n, false),
    ];
    const items = parseActivityFeed(logs, USER);

    expect(items).toHaveLength(3);
    expect(items[0]!.type).toBe("transfer");
    expect(items[1]!.type).toBe("shield");
    expect(items[2]!.type).toBe("unshield_finalized");
  });
});

describe("extractEncryptedHandles", () => {
  it("extracts unique encrypted handles", () => {
    const handle1 = bytes32("aa".repeat(32));
    const handle2 = bytes32("bb".repeat(32));

    const items: ActivityItem[] = [
      ...parseActivityFeed(
        [
          transferLog(USER, OTHER, handle1),
          transferLog(OTHER, USER, handle2),
          transferLog(USER, OTHER, handle1), // duplicate
        ],
        USER,
      ),
    ];

    const handles = extractEncryptedHandles(items);
    expect(handles).toHaveLength(2);
    expect(handles).toContain(handle1);
    expect(handles).toContain(handle2);
  });

  it("skips clear amounts", () => {
    const items = parseActivityFeed([wrappedLog(USER, 1000n, 50n)], USER);
    const handles = extractEncryptedHandles(items);
    expect(handles).toHaveLength(0);
  });

  it("skips zero handles", () => {
    const zeroHandle = bytes32("0".repeat(64));
    const items = parseActivityFeed([transferLog(USER, OTHER, zeroHandle)], USER);
    const handles = extractEncryptedHandles(items);
    expect(handles).toHaveLength(0);
  });

  it("skips already-decrypted items", () => {
    const handle = bytes32("aa".repeat(32));
    const items = parseActivityFeed([transferLog(USER, OTHER, handle)], USER);
    // Manually apply a decrypted value
    const decrypted = applyDecryptedValues(items, new Map([[handle, 100n]]));
    const handles = extractEncryptedHandles(decrypted);
    expect(handles).toHaveLength(0);
  });
});

describe("applyDecryptedValues", () => {
  it("populates decryptedValue on matching encrypted amounts", () => {
    const handle = bytes32("aa".repeat(32));
    const items = parseActivityFeed([transferLog(USER, OTHER, handle)], USER);
    const decryptedMap = new Map<Handle, bigint>([[handle, 42n]]);
    const result = applyDecryptedValues(items, decryptedMap);

    expect(result[0]!.amount).toEqual({
      type: "encrypted",
      handle,
      decryptedValue: 42n,
    });
  });

  it("leaves clear amounts unchanged", () => {
    const items = parseActivityFeed([wrappedLog(USER, 1000n, 50n)], USER);
    const result = applyDecryptedValues(items, new Map());

    expect(result[0]!.amount).toEqual({ type: "clear", value: 1000n });
  });

  it("leaves items with unknown handles unchanged", () => {
    const handle = bytes32("aa".repeat(32));
    const items = parseActivityFeed([transferLog(USER, OTHER, handle)], USER);
    const result = applyDecryptedValues(items, new Map());

    expect(result[0]!.amount).toEqual({ type: "encrypted", handle });
  });
});

describe("sortByBlockNumber", () => {
  it("sorts descending by block number", () => {
    const items = parseActivityFeed(
      [
        {
          ...transferLog(USER, OTHER, bytes32("aa".repeat(32))),
          blockNumber: 1n,
        },
        {
          ...transferLog(USER, OTHER, bytes32("bb".repeat(32))),
          blockNumber: 3n,
        },
        {
          ...transferLog(USER, OTHER, bytes32("cc".repeat(32))),
          blockNumber: 2n,
        },
      ],
      USER,
    );

    const sorted = sortByBlockNumber(items);
    expect(sorted[0]!.metadata.blockNumber).toBe(3n);
    expect(sorted[1]!.metadata.blockNumber).toBe(2n);
    expect(sorted[2]!.metadata.blockNumber).toBe(1n);
  });

  it("sorts by logIndex within same block", () => {
    const items = parseActivityFeed(
      [
        {
          ...transferLog(USER, OTHER, bytes32("aa".repeat(32))),
          blockNumber: 5n,
          logIndex: 0,
        },
        {
          ...transferLog(USER, OTHER, bytes32("bb".repeat(32))),
          blockNumber: 5n,
          logIndex: 2,
        },
        {
          ...transferLog(USER, OTHER, bytes32("cc".repeat(32))),
          blockNumber: 5n,
          logIndex: 1,
        },
      ],
      USER,
    );

    const sorted = sortByBlockNumber(items);
    expect(sorted[0]!.metadata.logIndex).toBe(2);
    expect(sorted[1]!.metadata.logIndex).toBe(1);
    expect(sorted[2]!.metadata.logIndex).toBe(0);
  });

  it("handles numeric block numbers", () => {
    const items = parseActivityFeed(
      [
        {
          ...transferLog(USER, OTHER, bytes32("aa".repeat(32))),
          blockNumber: 10,
        },
        {
          ...transferLog(USER, OTHER, bytes32("bb".repeat(32))),
          blockNumber: 20,
        },
      ],
      USER,
    );

    const sorted = sortByBlockNumber(items);
    expect(sorted[0]!.metadata.blockNumber).toBe(20);
    expect(sorted[1]!.metadata.blockNumber).toBe(10);
  });

  it("places items without blockNumber at the beginning", () => {
    const items = parseActivityFeed(
      [
        {
          ...transferLog(USER, OTHER, bytes32("aa".repeat(32))),
          blockNumber: 5n,
        },
        transferLog(USER, OTHER, bytes32("bb".repeat(32))), // no blockNumber
      ],
      USER,
    );

    const sorted = sortByBlockNumber(items);
    expect(sorted[0]!.metadata.blockNumber).toBeUndefined();
    expect(sorted[1]!.metadata.blockNumber).toBe(5n);
  });

  it("does not mutate the original array", () => {
    const items = parseActivityFeed(
      [
        {
          ...transferLog(USER, OTHER, bytes32("aa".repeat(32))),
          blockNumber: 1n,
        },
        {
          ...transferLog(USER, OTHER, bytes32("bb".repeat(32))),
          blockNumber: 2n,
        },
      ],
      USER,
    );

    const original = [...items];
    sortByBlockNumber(items);
    expect(items).toEqual(original);
  });
});
