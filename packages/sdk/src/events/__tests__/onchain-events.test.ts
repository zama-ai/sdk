import { describe, it, expect } from "../../test-fixtures";
import type { Hex } from "viem";
import type { RawLog } from "../../types/transaction";
import {
  Topics,
  TOKEN_TOPICS,
  decodeConfidentialTransfer,
  decodeWrapped,
  decodeUnwrapRequested,
  decodeUnwrappedFinalized,
  decodeUnwrappedStarted,
  decodeOnChainEvent,
  decodeOnChainEvents,
  findUnwrapRequested,
  findWrapped,
} from "../onchain-events";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal RawLog for testing. */
function makeLog(topic0: Hex, topics: Hex[], data: Hex = "0x"): RawLog {
  return { topics: [topic0, ...topics], data };
}

/** Encode a uint256 as a 64-char hex word (no 0x prefix). */
function uint256(n: bigint): string {
  return n.toString(16).padStart(64, "0");
}

/** Encode an address as a topic (0x + 24 zeros + 40 hex chars). */
function addressTopic(addr: string): Hex {
  return `0x${addr.replace("0x", "").toLowerCase().padStart(64, "0")}` as Hex;
}

/** Encode an address as a data word (64 hex chars, no 0x). */
function addressWord(addr: string): string {
  return addr.replace("0x", "").toLowerCase().padStart(64, "0");
}

// ---------------------------------------------------------------------------
// Test addresses and handles
// ---------------------------------------------------------------------------

const ALICE = "0x000000000000000000000000000000000000aA01" as Hex;
const BOB = "0x000000000000000000000000000000000000bB02" as Hex;
const HANDLE = "0x00000000000000000000000000000000000000000000000000000000deadbeef" as Hex;

// ---------------------------------------------------------------------------
// decodeConfidentialTransfer
// ---------------------------------------------------------------------------

describe("decodeConfidentialTransfer", () => {
  it("decodes a valid ConfidentialTransfer log", () => {
    const log = makeLog(Topics.ConfidentialTransfer, [
      addressTopic(ALICE),
      addressTopic(BOB),
      HANDLE,
    ]);
    const event = decodeConfidentialTransfer(log);
    expect(event).not.toBeNull();
    expect(event!.eventName).toBe("ConfidentialTransfer");
    expect(event!.from.toLowerCase()).toBe(ALICE.toLowerCase());
    expect(event!.to.toLowerCase()).toBe(BOB.toLowerCase());
    expect(event!.encryptedAmountHandle).toBe(HANDLE);
  });

  it("returns null for wrong topic0", () => {
    const log = makeLog(Topics.Wrapped, [addressTopic(ALICE), addressTopic(BOB), HANDLE]);
    expect(decodeConfidentialTransfer(log)).toBeNull();
  });

  it("returns null for insufficient topics", () => {
    const log = makeLog(Topics.ConfidentialTransfer, [addressTopic(ALICE)]);
    expect(decodeConfidentialTransfer(log)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// decodeWrapped
// ---------------------------------------------------------------------------

describe("decodeWrapped", () => {
  it("decodes a valid Wrapped log", () => {
    const data = `0x${uint256(500n)}` as Hex;
    const log = makeLog(Topics.Wrapped, [addressTopic(BOB)], data);
    const event = decodeWrapped(log);
    expect(event).not.toBeNull();
    expect(event!.eventName).toBe("Wrapped");
    expect(event!.to.toLowerCase()).toBe(BOB.toLowerCase());
    expect(event!.amountIn).toBe(500n);
  });

  it("returns null for wrong topic0", () => {
    const log = makeLog(Topics.ConfidentialTransfer, [addressTopic(BOB)]);
    expect(decodeWrapped(log)).toBeNull();
  });

  it("returns null for insufficient topics", () => {
    const log = makeLog(Topics.Wrapped, []);
    expect(decodeWrapped(log)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// decodeUnwrapRequested
// ---------------------------------------------------------------------------

const UNWRAP_REQUEST_ID = "0x00000000000000000000000000000000000000000000000000000000cafecafe" as Hex;

describe("decodeUnwrapRequested", () => {
  it("decodes a valid UnwrapRequested log", () => {
    // UnwrapRequested(address indexed receiver, bytes32 indexed unwrapRequestId, bytes32 amount)
    // topics[1] = receiver, topics[2] = unwrapRequestId, data = encryptedAmount
    const data = `0x${HANDLE.slice(2)}` as Hex;
    const log = makeLog(Topics.UnwrapRequested, [addressTopic(ALICE), UNWRAP_REQUEST_ID], data);
    const event = decodeUnwrapRequested(log);
    expect(event).not.toBeNull();
    expect(event!.eventName).toBe("UnwrapRequested");
    expect(event!.receiver.toLowerCase()).toBe(ALICE.toLowerCase());
    expect(event!.unwrapRequestId).toBe(UNWRAP_REQUEST_ID);
    expect(event!.encryptedAmount).toBe(HANDLE);
  });

  it("returns null for wrong topic0", () => {
    const log = makeLog(Topics.Wrapped, [addressTopic(ALICE), UNWRAP_REQUEST_ID]);
    expect(decodeUnwrapRequested(log)).toBeNull();
  });

  it("returns null for insufficient topics", () => {
    const log = makeLog(Topics.UnwrapRequested, [addressTopic(ALICE)]);
    expect(decodeUnwrapRequested(log)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// decodeUnwrappedFinalized
// ---------------------------------------------------------------------------

describe("decodeUnwrappedFinalized", () => {
  it("decodes a valid UnwrapFinalized log", () => {
    // UnwrapFinalized(address indexed receiver, bytes32 indexed unwrapRequestId, bytes32 encryptedAmount, uint64 cleartextAmount)
    // topics[1] = receiver, topics[2] = unwrapRequestId, data: encryptedAmount (word 0), cleartextAmount (word 1)
    const data = `0x${HANDLE.slice(2)}${uint256(450n)}` as Hex;
    const log = makeLog(Topics.UnwrappedFinalized, [addressTopic(ALICE), UNWRAP_REQUEST_ID], data);
    const event = decodeUnwrappedFinalized(log);
    expect(event).not.toBeNull();
    expect(event!.eventName).toBe("UnwrappedFinalized");
    expect(event!.receiver.toLowerCase()).toBe(ALICE.toLowerCase());
    expect(event!.unwrapRequestId).toBe(UNWRAP_REQUEST_ID);
    expect(event!.encryptedAmount).toBe(HANDLE);
    expect(event!.cleartextAmount).toBe(450n);
  });

  it("returns null for wrong topic0", () => {
    const log = makeLog(Topics.Wrapped, [addressTopic(ALICE), UNWRAP_REQUEST_ID]);
    expect(decodeUnwrappedFinalized(log)).toBeNull();
  });

  it("returns null for insufficient topics", () => {
    const log = makeLog(Topics.UnwrappedFinalized, [addressTopic(ALICE)]);
    expect(decodeUnwrappedFinalized(log)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// decodeUnwrappedStarted
// ---------------------------------------------------------------------------

describe("decodeUnwrappedStarted", () => {
  it("decodes a valid UnwrappedStarted log", () => {
    const data = `0x${uint256(1n)}${addressWord(BOB)}${HANDLE.slice(2)}${HANDLE.slice(2)}` as Hex;
    const log = makeLog(
      Topics.UnwrappedStarted,
      [`0x${uint256(1n)}` as Hex, `0x${uint256(2n)}` as Hex, addressTopic(ALICE)],
      data,
    );
    const event = decodeUnwrappedStarted(log);
    expect(event).not.toBeNull();
    expect(event!.eventName).toBe("UnwrappedStarted");
    expect(event!.requestId).toBe(1n);
    expect(event!.txId).toBe(2n);
    expect(event!.to.toLowerCase()).toBe(ALICE.toLowerCase());
    expect(event!.returnVal).toBe(true);
    expect(event!.refund.toLowerCase()).toBe(BOB.toLowerCase());
  });

  it("returns null for wrong topic0", () => {
    const log = makeLog(Topics.Wrapped, [
      `0x${uint256(1n)}` as Hex,
      `0x${uint256(2n)}` as Hex,
      addressTopic(ALICE),
    ]);
    expect(decodeUnwrappedStarted(log)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// decodeOnChainEvent / decodeOnChainEvents
// ---------------------------------------------------------------------------

describe("decodeOnChainEvent", () => {
  it("returns decoded event for a recognized log", () => {
    const log = makeLog(Topics.ConfidentialTransfer, [
      addressTopic(ALICE),
      addressTopic(BOB),
      HANDLE,
    ]);
    const event = decodeOnChainEvent(log);
    expect(event).not.toBeNull();
    expect(event!.eventName).toBe("ConfidentialTransfer");
  });

  it("returns null for an unrecognized log", () => {
    const log = makeLog("0xdeadbeef" as Hex, []);
    expect(decodeOnChainEvent(log)).toBeNull();
  });
});

describe("decodeOnChainEvents", () => {
  it("batch-decodes logs, skipping unrecognized ones", () => {
    const logs: RawLog[] = [
      makeLog(Topics.ConfidentialTransfer, [addressTopic(ALICE), addressTopic(BOB), HANDLE]),
      makeLog("0xdeadbeef" as Hex, []),
      makeLog(Topics.UnwrapRequested, [addressTopic(ALICE), UNWRAP_REQUEST_ID], `0x${HANDLE.slice(2)}` as Hex),
    ];
    const events = decodeOnChainEvents(logs);
    expect(events).toHaveLength(2);
    expect(events[0]!.eventName).toBe("ConfidentialTransfer");
    expect(events[1]!.eventName).toBe("UnwrapRequested");
  });

  it("returns empty array for no recognized logs", () => {
    expect(decodeOnChainEvents([makeLog("0x00" as Hex, [])])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// findUnwrapRequested / findWrapped
// ---------------------------------------------------------------------------

describe("findUnwrapRequested", () => {
  it("finds the first UnwrapRequested in logs", () => {
    const logs: RawLog[] = [
      makeLog(Topics.ConfidentialTransfer, [addressTopic(ALICE), addressTopic(BOB), HANDLE]),
      makeLog(Topics.UnwrapRequested, [addressTopic(BOB), UNWRAP_REQUEST_ID], `0x${HANDLE.slice(2)}` as Hex),
    ];
    const event = findUnwrapRequested(logs);
    expect(event).not.toBeNull();
    expect(event!.receiver.toLowerCase()).toBe(BOB.toLowerCase());
  });

  it("returns null when no UnwrapRequested exists", () => {
    const logs: RawLog[] = [
      makeLog(Topics.ConfidentialTransfer, [addressTopic(ALICE), addressTopic(BOB), HANDLE]),
    ];
    expect(findUnwrapRequested(logs)).toBeNull();
  });
});

describe("findWrapped", () => {
  it("finds the first Wrapped event in logs", () => {
    const data = `0x${uint256(50n)}` as Hex;
    const logs: RawLog[] = [makeLog(Topics.Wrapped, [addressTopic(ALICE)], data)];
    const event = findWrapped(logs);
    expect(event).not.toBeNull();
    expect(event!.amountIn).toBe(50n);
  });

  it("returns null when no Wrapped exists", () => {
    expect(findWrapped([])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TOKEN_TOPICS / Topics constants
// ---------------------------------------------------------------------------

describe("TOKEN_TOPICS", () => {
  it("contains all 5 event topic hashes", () => {
    expect(TOKEN_TOPICS).toHaveLength(5);
    expect(TOKEN_TOPICS).toContain(Topics.ConfidentialTransfer);
    expect(TOKEN_TOPICS).toContain(Topics.Wrapped);
    expect(TOKEN_TOPICS).toContain(Topics.UnwrapRequested);
    expect(TOKEN_TOPICS).toContain(Topics.UnwrappedFinalized);
    expect(TOKEN_TOPICS).toContain(Topics.UnwrappedStarted);
  });

  it("all topic hashes are 0x-prefixed 66-char hex strings", () => {
    for (const topic of TOKEN_TOPICS) {
      expect(topic).toMatch(/^0x[0-9a-f]{64}$/);
    }
  });
});
