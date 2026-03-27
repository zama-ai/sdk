import { describe, it, expect } from "../test-fixtures";
import { getAddress, keccak256, toHex, toBytes, type Address, type Hex } from "viem";
import {
  Topics,
  decodeConfidentialTransfer,
  decodeWrapped,
  decodeUnwrapRequested,
  decodeUnwrappedFinalized,
  decodeUnwrappedStarted,
  decodeOnChainEvent,
  decodeOnChainEvents,
  findUnwrapRequested,
  findWrapped,
  type RawLog,
} from "../events";

// Helpers
const addr = (hex: string): Address => getAddress(`0x${hex.padStart(40, "0")}`);
const topic = (hex: string): Hex => `0x${hex.padStart(64, "0")}`;
const word = (hex: string) => hex.padStart(64, "0");
const bytes32 = (hex: string): Hex => `0x${hex.padStart(64, "0")}`;

describe("Topic constants match keccak256", () => {
  const cases: [string, string][] = [
    ["ConfidentialTransfer(address,address,bytes32)", Topics.ConfidentialTransfer],
    ["Wrapped(uint64,uint256,uint256,address,uint256)", Topics.Wrapped],
    ["UnwrapRequested(address,bytes32)", Topics.UnwrapRequested],
    [
      "UnwrappedFinalized(bytes32,bool,bool,uint64,uint256,uint256,uint256)",
      Topics.UnwrappedFinalized,
    ],
    [
      "UnwrappedStarted(bool,uint256,uint256,address,address,bytes32,bytes32)",
      Topics.UnwrappedStarted,
    ],
  ];

  for (const [sig, expected] of cases) {
    it(sig, () => {
      expect(keccak256(toHex(toBytes(sig)))).toBe(expected);
    });
  }
});

describe("decodeConfidentialTransfer", () => {
  const from = addr("aaa1");
  const to = addr("bbb2");
  const handle = bytes32("cc".repeat(32));

  const log: RawLog = {
    topics: [Topics.ConfidentialTransfer, topic("aaa1"), topic("bbb2"), handle],
    data: "0x",
  };

  it("decodes valid log", () => {
    const event = decodeConfidentialTransfer(log);
    expect(event).toEqual({
      eventName: "ConfidentialTransfer",
      from,
      to,
      encryptedAmountHandle: handle,
    });
  });

  it("returns null for wrong topic", () => {
    expect(
      decodeConfidentialTransfer({
        ...log,
        topics: [Topics.Wrapped, ...log.topics.slice(1)],
      }),
    ).toBeNull();
  });

  it("returns null for insufficient topics", () => {
    expect(
      decodeConfidentialTransfer({
        ...log,
        topics: [Topics.ConfidentialTransfer],
      }),
    ).toBeNull();
  });
});

describe("decodeWrapped", () => {
  const to = addr("dead");
  const mintTxId = 42n;
  const mintAmount = 1000n;
  const amountIn = 2000n;
  const feeAmount = 50n;

  const log: RawLog = {
    topics: [Topics.Wrapped, topic("dead"), topic(mintTxId.toString(16))],
    data: `0x${word(mintAmount.toString(16))}${word(amountIn.toString(16))}${word(feeAmount.toString(16))}`,
  };

  it("decodes valid log", () => {
    const event = decodeWrapped(log);
    expect(event).toEqual({
      eventName: "Wrapped",
      to,
      mintTxId,
      mintAmount,
      amountIn,
      feeAmount,
    });
  });

  it("returns null for wrong topic", () => {
    expect(
      decodeWrapped({
        ...log,
        topics: [Topics.UnwrapRequested, ...log.topics.slice(1)],
      }),
    ).toBeNull();
  });
});

describe("decodeUnwrapRequested", () => {
  const receiver = addr("1234");
  const amount = bytes32("ff".repeat(32));

  const log: RawLog = {
    topics: [Topics.UnwrapRequested, topic("1234")],
    data: `0x${word("ff".repeat(32))}`,
  };

  it("decodes valid log", () => {
    const event = decodeUnwrapRequested(log);
    expect(event).toEqual({
      eventName: "UnwrapRequested",
      receiver,
      encryptedAmount: amount,
    });
  });

  it("returns null for wrong topic", () => {
    expect(
      decodeUnwrapRequested({
        ...log,
        topics: [Topics.Wrapped, ...log.topics.slice(1)],
      }),
    ).toBeNull();
  });
});

describe("decodeUnwrappedFinalized", () => {
  const burntHandle = bytes32("ab".repeat(32));
  const nextTxId = 7n;

  const log: RawLog = {
    topics: [Topics.UnwrappedFinalized, burntHandle, topic(nextTxId.toString(16))],
    data: `0x${word("1")}${word("0")}${word(500n.toString(16))}${word(450n.toString(16))}${word(50n.toString(16))}`,
  };

  it("decodes valid log", () => {
    const event = decodeUnwrappedFinalized(log);
    expect(event).toEqual({
      eventName: "UnwrappedFinalized",
      burntAmountHandle: burntHandle,
      nextTxId,
      finalizeSuccess: true,
      feeTransferSuccess: false,
      burnAmount: 500n,
      unwrapAmount: 450n,
      feeAmount: 50n,
    });
  });

  it("returns null for wrong topic", () => {
    expect(
      decodeUnwrappedFinalized({
        ...log,
        topics: [Topics.Wrapped, ...log.topics.slice(1)],
      }),
    ).toBeNull();
  });
});

describe("decodeUnwrappedStarted", () => {
  const requestId = 10n;
  const txId = 20n;
  const toAddr = addr("cafe");
  const refund = addr("beef");
  const requestedAmount = bytes32("11".repeat(32));
  const burnAmount = bytes32("22".repeat(32));

  const log: RawLog = {
    topics: [
      Topics.UnwrappedStarted,
      topic(requestId.toString(16)),
      topic(txId.toString(16)),
      topic("cafe"),
    ],
    data: `0x${word("1")}${word("beef")}${word("11".repeat(32))}${word("22".repeat(32))}`,
  };

  it("decodes valid log", () => {
    const event = decodeUnwrappedStarted(log);
    expect(event).toEqual({
      eventName: "UnwrappedStarted",
      requestId,
      txId,
      to: toAddr,
      returnVal: true,
      refund,
      requestedAmount,
      burnAmount,
    });
  });

  it("returns null for wrong topic", () => {
    expect(
      decodeUnwrappedStarted({
        ...log,
        topics: [Topics.Wrapped, ...log.topics.slice(1)],
      }),
    ).toBeNull();
  });
});

describe("decodeOnChainEvent", () => {
  it("dispatches to correct decoder", () => {
    const log: RawLog = {
      topics: [Topics.UnwrapRequested, topic("abcd")],
      data: `0x${word("ff".repeat(32))}`,
    };
    const event = decodeOnChainEvent(log);
    expect(event?.eventName).toBe("UnwrapRequested");
  });

  it("returns null for unknown event", () => {
    const log: RawLog = {
      topics: [topic("00".repeat(32))],
      data: "0x",
    };
    expect(decodeOnChainEvent(log)).toBeNull();
  });
});

describe("decodeOnChainEvents", () => {
  it("decodes array of mixed logs, skipping unknown", () => {
    const logs: RawLog[] = [
      {
        topics: [Topics.UnwrapRequested, topic("abcd")],
        data: `0x${word("ff".repeat(32))}`,
      },
      { topics: ["0xunknown" as Hex], data: "0x" as Hex },
      {
        topics: [
          Topics.ConfidentialTransfer,
          topic("aaa1"),
          topic("bbb2"),
          bytes32("cc".repeat(32)),
        ],
        data: "0x",
      },
    ];
    const events = decodeOnChainEvents(logs);
    expect(events).toHaveLength(2);
    expect(events[0].eventName).toBe("UnwrapRequested");
    expect(events[1].eventName).toBe("ConfidentialTransfer");
  });
});

describe("findUnwrapRequested", () => {
  it("finds first UnwrapRequested in mixed logs", () => {
    const logs: RawLog[] = [
      {
        topics: [
          Topics.ConfidentialTransfer,
          topic("aaa1"),
          topic("bbb2"),
          bytes32("cc".repeat(32)),
        ],
        data: "0x",
      },
      {
        topics: [Topics.UnwrapRequested, topic("1234")],
        data: `0x${word("ff".repeat(32))}`,
      },
    ];
    const event = findUnwrapRequested(logs);
    expect(event?.eventName).toBe("UnwrapRequested");
    expect(event?.receiver).toBe(addr("1234"));
  });

  it("returns null when none found", () => {
    expect(findUnwrapRequested([])).toBeNull();
  });
});

describe("findWrapped", () => {
  it("finds first Wrapped in mixed logs", () => {
    const logs: RawLog[] = [
      {
        topics: [Topics.Wrapped, topic("dead"), topic(42n.toString(16))],
        data: `0x${word(1000n.toString(16))}${word(2000n.toString(16))}${word(50n.toString(16))}`,
      },
    ];
    const event = findWrapped(logs);
    expect(event?.eventName).toBe("Wrapped");
    expect(event?.mintAmount).toBe(1000n);
  });

  it("returns null when none found", () => {
    expect(findWrapped([])).toBeNull();
  });
});
