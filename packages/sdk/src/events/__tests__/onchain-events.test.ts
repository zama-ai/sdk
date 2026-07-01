import { describe, test, expect } from "../../test-fixtures";
import type { Hex } from "viem";
import type { RawLog } from "../../types/transaction";
import {
  Topics,
  TOKEN_TOPICS,
  decodeConfidentialTransfer,
  decodeWrap,
  decodeUnwrapRequested,
  decodeUnwrapFinalized,
  decodeOnChainEvent,
  decodeOnChainEvents,
  findUnwrapRequested,
  findWrap,
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

// ---------------------------------------------------------------------------
// Test addresses and handles
// ---------------------------------------------------------------------------

const ALICE = "0x000000000000000000000000000000000000aA01" as Hex;
const BOB = "0x000000000000000000000000000000000000bB02" as Hex;
const HANDLE = "0x00000000000000000000000000000000000000000000000000000000deadbeef" as Hex;
const UNWRAP_REQUEST_ID =
  "0x00000000000000000000000000000000000000000000000000000000feedbabe" as Hex;

// ---------------------------------------------------------------------------
// decodeConfidentialTransfer
// ---------------------------------------------------------------------------

describe("decodeConfidentialTransfer", () => {
  test("decodes a valid ConfidentialTransfer log", () => {
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
    expect(event!.encryptedAmount).toBe(HANDLE);
  });

  test("returns null for wrong topic0", () => {
    const log = makeLog(Topics.Wrap, [addressTopic(ALICE), addressTopic(BOB), HANDLE]);
    expect(decodeConfidentialTransfer(log)).toBeNull();
  });

  test("returns null for insufficient topics", () => {
    const log = makeLog(Topics.ConfidentialTransfer, [addressTopic(ALICE)]);
    expect(decodeConfidentialTransfer(log)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// decodeWrap
// ---------------------------------------------------------------------------

describe("decodeWrap", () => {
  test("decodes a valid Wrap log", () => {
    const data = `0x${uint256(500n)}${HANDLE.slice(2)}` as Hex;
    const log = makeLog(Topics.Wrap, [addressTopic(BOB)], data);
    const event = decodeWrap(log);
    expect(event).not.toBeNull();
    expect(event!.eventName).toBe("Wrap");
    expect(event!.to.toLowerCase()).toBe(BOB.toLowerCase());
    expect(event!.roundedAmount).toBe(500n);
    expect(event!.encryptedWrappedAmount).toBe(HANDLE);
  });

  test("returns null for wrong topic0", () => {
    const log = makeLog(Topics.ConfidentialTransfer, [addressTopic(BOB)]);
    expect(decodeWrap(log)).toBeNull();
  });

  test("returns null for insufficient topics", () => {
    const log = makeLog(Topics.Wrap, []);
    expect(decodeWrap(log)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// decodeUnwrapRequested
// ---------------------------------------------------------------------------

describe("decodeUnwrapRequested", () => {
  test("decodes a valid UnwrapRequested log with unwrapRequestId", () => {
    const data = `0x${HANDLE.slice(2)}` as Hex;
    const log = makeLog(Topics.UnwrapRequested, [addressTopic(ALICE), UNWRAP_REQUEST_ID], data);
    const event = decodeUnwrapRequested(log);
    expect(event).not.toBeNull();
    expect(event!.eventName).toBe("UnwrapRequested");
    expect(event!.receiver.toLowerCase()).toBe(ALICE.toLowerCase());
    expect(event!.unwrapRequestId).toBe(UNWRAP_REQUEST_ID);
    expect(event!.encryptedAmount).toBe(HANDLE);
  });

  test("returns null for wrong topic0", () => {
    const log = makeLog(Topics.Wrap, [addressTopic(ALICE), UNWRAP_REQUEST_ID]);
    expect(decodeUnwrapRequested(log)).toBeNull();
  });

  test("returns null for insufficient topics", () => {
    const log = makeLog(Topics.UnwrapRequested, []);
    expect(decodeUnwrapRequested(log)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// decodeUnwrapFinalized
// ---------------------------------------------------------------------------

describe("decodeUnwrapFinalized", () => {
  test("decodes a valid UnwrapFinalized log with unwrapRequestId", () => {
    const data = `0x${HANDLE.slice(2)}${uint256(450n)}` as Hex;
    const log = makeLog(Topics.UnwrapFinalized, [addressTopic(ALICE), UNWRAP_REQUEST_ID], data);
    const event = decodeUnwrapFinalized(log);
    expect(event).not.toBeNull();
    expect(event!.eventName).toBe("UnwrapFinalized");
    expect(event!.receiver.toLowerCase()).toBe(ALICE.toLowerCase());
    expect(event!.unwrapRequestId).toBe(UNWRAP_REQUEST_ID);
    expect(event!.encryptedAmount).toBe(HANDLE);
    expect(event!.cleartextAmount).toBe(450n);
  });

  test("returns null for wrong topic0", () => {
    const log = makeLog(Topics.Wrap, [addressTopic(ALICE), UNWRAP_REQUEST_ID]);
    expect(decodeUnwrapFinalized(log)).toBeNull();
  });

  test("returns null for insufficient topics", () => {
    const log = makeLog(Topics.UnwrapFinalized, []);
    expect(decodeUnwrapFinalized(log)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// decodeOnChainEvent / decodeOnChainEvents
// ---------------------------------------------------------------------------

describe("decodeOnChainEvent", () => {
  test("returns decoded event for a recognized log", () => {
    const log = makeLog(Topics.ConfidentialTransfer, [
      addressTopic(ALICE),
      addressTopic(BOB),
      HANDLE,
    ]);
    const event = decodeOnChainEvent(log);
    expect(event).not.toBeNull();
    expect(event!.eventName).toBe("ConfidentialTransfer");
  });

  test("decodes upgraded UnwrapFinalized logs with the canonical event name", () => {
    const data = `0x${HANDLE.slice(2)}${uint256(450n)}` as Hex;
    const log = makeLog(Topics.UnwrapFinalized, [addressTopic(ALICE), UNWRAP_REQUEST_ID], data);
    const event = decodeOnChainEvent(log);
    expect(event).not.toBeNull();
    expect(event!.eventName).toBe("UnwrapFinalized");
    expect("unwrapRequestId" in event! && event.unwrapRequestId).toBe(UNWRAP_REQUEST_ID);
  });

  test("returns null for an unrecognized log", () => {
    const log = makeLog("0xdeadbeef" as Hex, []);
    expect(decodeOnChainEvent(log)).toBeNull();
  });
});

describe("decodeOnChainEvents", () => {
  test("batch-decodes logs, skipping unrecognized ones", () => {
    const logs: RawLog[] = [
      makeLog(Topics.ConfidentialTransfer, [addressTopic(ALICE), addressTopic(BOB), HANDLE]),
      makeLog("0xdeadbeef" as Hex, []),
      makeLog(
        Topics.UnwrapRequested,
        [addressTopic(ALICE), UNWRAP_REQUEST_ID],
        `0x${HANDLE.slice(2)}` as Hex,
      ),
      makeLog(
        Topics.UnwrapFinalized,
        [addressTopic(ALICE), UNWRAP_REQUEST_ID],
        `0x${HANDLE.slice(2)}${uint256(450n)}` as Hex,
      ),
    ];
    const events = decodeOnChainEvents(logs);
    expect(events).toHaveLength(3);
    expect(events[0]!.eventName).toBe("ConfidentialTransfer");
    expect(events[1]!.eventName).toBe("UnwrapRequested");
    expect(events[2]!.eventName).toBe("UnwrapFinalized");
  });

  test("returns empty array for no recognized logs", () => {
    expect(decodeOnChainEvents([makeLog("0x00" as Hex, [])])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// findUnwrapRequested / findWrap
// ---------------------------------------------------------------------------

describe("findUnwrapRequested", () => {
  test("finds the first UnwrapRequested in logs", () => {
    const logs: RawLog[] = [
      makeLog(Topics.ConfidentialTransfer, [addressTopic(ALICE), addressTopic(BOB), HANDLE]),
      makeLog(
        Topics.UnwrapRequested,
        [addressTopic(BOB), UNWRAP_REQUEST_ID],
        `0x${HANDLE.slice(2)}` as Hex,
      ),
    ];
    const event = findUnwrapRequested(logs);
    expect(event).not.toBeNull();
    expect(event!.receiver.toLowerCase()).toBe(BOB.toLowerCase());
  });

  test("returns null when no UnwrapRequested exists", () => {
    const logs: RawLog[] = [
      makeLog(Topics.ConfidentialTransfer, [addressTopic(ALICE), addressTopic(BOB), HANDLE]),
    ];
    expect(findUnwrapRequested(logs)).toBeNull();
  });
});

describe("findWrap", () => {
  test("finds the first Wrap event in logs", () => {
    const data = `0x${uint256(50n)}${HANDLE.slice(2)}` as Hex;
    const logs: RawLog[] = [makeLog(Topics.Wrap, [addressTopic(ALICE)], data)];
    const event = findWrap(logs);
    expect(event).not.toBeNull();
    expect(event!.roundedAmount).toBe(50n);
    expect(event!.encryptedWrappedAmount).toBe(HANDLE);
  });

  test("returns null when no Wrap exists", () => {
    expect(findWrap([])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TOKEN_TOPICS / Topics constants
// ---------------------------------------------------------------------------

describe("TOKEN_TOPICS", () => {
  test("contains all token event topic hashes", () => {
    expect(TOKEN_TOPICS).toHaveLength(4);
    expect(TOKEN_TOPICS).toContain(Topics.ConfidentialTransfer);
    expect(TOKEN_TOPICS).toContain(Topics.Wrap);
    expect(TOKEN_TOPICS).toContain(Topics.UnwrapRequested);
    expect(TOKEN_TOPICS).toContain(Topics.UnwrapFinalized);
  });

  test("all topic hashes are 0x-prefixed 66-char hex strings", () => {
    for (const topic of TOKEN_TOPICS) {
      expect(topic).toMatch(/^0x[0-9a-f]{64}$/);
    }
  });
});
