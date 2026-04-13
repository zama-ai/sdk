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
  AclTopics,
  decodeDelegatedForUserDecryption,
  decodeRevokedDelegationForUserDecryption,
  decodeAclEvent,
  decodeAclEvents,
  findDelegatedForUserDecryption,
  findRevokedDelegationForUserDecryption,
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
    ["Wrapped(address,uint256)", Topics.Wrapped],
    ["UnwrapRequested(address,bytes32,bytes32)", Topics.UnwrapRequested],
    ["UnwrapFinalized(address,bytes32,bytes32,uint64)", Topics.UnwrappedFinalized],
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
  const amountIn = 2000n;

  const log: RawLog = {
    topics: [Topics.Wrapped, topic("dead")],
    data: `0x${word(amountIn.toString(16))}`,
  };

  it("decodes valid log", () => {
    const event = decodeWrapped(log);
    expect(event).toEqual({
      eventName: "Wrapped",
      to,
      amountIn,
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
  const unwrapRequestId = bytes32("ab".repeat(32));
  const amount = bytes32("ff".repeat(32));

  const log: RawLog = {
    topics: [Topics.UnwrapRequested, topic("1234"), unwrapRequestId],
    data: `0x${word("ff".repeat(32))}`,
  };

  it("decodes valid log", () => {
    const event = decodeUnwrapRequested(log);
    expect(event).toEqual({
      eventName: "UnwrapRequested",
      receiver,
      unwrapRequestId,
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
  // UnwrapFinalized(address indexed receiver, bytes32 indexed unwrapRequestId, bytes32 encryptedAmount, uint64 cleartextAmount)
  const receiver = addr("aabb");
  const unwrapRequestId = bytes32("ef".repeat(32));
  const encryptedHandle = bytes32("cd".repeat(32));
  const cleartextAmount = 450n;

  const log: RawLog = {
    topics: [Topics.UnwrappedFinalized, topic(receiver.slice(2)), unwrapRequestId],
    data: `0x${word(encryptedHandle.slice(2))}${word(cleartextAmount.toString(16))}`,
  };

  it("decodes valid log", () => {
    const event = decodeUnwrappedFinalized(log);
    expect(event).toEqual({
      eventName: "UnwrappedFinalized",
      receiver,
      unwrapRequestId,
      encryptedAmount: encryptedHandle,
      cleartextAmount,
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
      topics: [Topics.UnwrapRequested, topic("abcd"), bytes32("ab".repeat(32))],
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
        topics: [Topics.UnwrapRequested, topic("abcd"), bytes32("ab".repeat(32))],
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
        topics: [Topics.UnwrapRequested, topic("1234"), bytes32("ab".repeat(32))],
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
        topics: [Topics.Wrapped, topic("dead")],
        data: `0x${word(2000n.toString(16))}`,
      },
    ];
    const event = findWrapped(logs);
    expect(event?.eventName).toBe("Wrapped");
    expect(event?.amountIn).toBe(2000n);
  });

  it("returns null when none found", () => {
    expect(findWrapped([])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ACL delegation event decoders
// ---------------------------------------------------------------------------

describe("AclTopics constants match keccak256", () => {
  const cases: [string, string][] = [
    [
      "DelegatedForUserDecryption(address,address,address,uint64,uint64,uint64)",
      AclTopics.DelegatedForUserDecryption,
    ],
    [
      "RevokedDelegationForUserDecryption(address,address,address,uint64,uint64)",
      AclTopics.RevokedDelegationForUserDecryption,
    ],
  ];

  for (const [sig, expected] of cases) {
    it(sig, () => {
      expect(keccak256(toHex(toBytes(sig)))).toBe(expected);
    });
  }
});

describe("decodeDelegatedForUserDecryption", () => {
  const delegator = addr("aaa1");
  const delegate = addr("bbb2");
  const contractAddr = addr("ccc3");

  const log: RawLog = {
    topics: [AclTopics.DelegatedForUserDecryption, topic("aaa1"), topic("bbb2")],
    data: `0x${word("ccc3")}${word("5")}${word("0")}${word("3e8")}`,
  };

  it("decodes valid log", () => {
    const event = decodeDelegatedForUserDecryption(log);
    expect(event).toEqual({
      eventName: "DelegatedForUserDecryption",
      delegator,
      delegate,
      contractAddress: contractAddr,
      delegationCounter: 5n,
      oldExpirationDate: 0n,
      newExpirationDate: 1000n,
    });
  });

  it("returns null for wrong topic", () => {
    expect(
      decodeDelegatedForUserDecryption({
        ...log,
        topics: [Topics.Wrapped, ...log.topics.slice(1)],
      }),
    ).toBeNull();
  });

  it("returns null for insufficient topics", () => {
    expect(
      decodeDelegatedForUserDecryption({
        ...log,
        topics: [AclTopics.DelegatedForUserDecryption],
      }),
    ).toBeNull();
  });
});

describe("decodeRevokedDelegationForUserDecryption", () => {
  const delegator = addr("aaa1");
  const delegate = addr("bbb2");
  const contractAddr = addr("ccc3");

  const log: RawLog = {
    topics: [AclTopics.RevokedDelegationForUserDecryption, topic("aaa1"), topic("bbb2")],
    data: `0x${word("ccc3")}${word("3")}${word("3e8")}`,
  };

  it("decodes valid log", () => {
    const event = decodeRevokedDelegationForUserDecryption(log);
    expect(event).toEqual({
      eventName: "RevokedDelegationForUserDecryption",
      delegator,
      delegate,
      contractAddress: contractAddr,
      delegationCounter: 3n,
      oldExpirationDate: 1000n,
    });
  });

  it("returns null for wrong topic", () => {
    expect(
      decodeRevokedDelegationForUserDecryption({
        ...log,
        topics: [Topics.Wrapped, ...log.topics.slice(1)],
      }),
    ).toBeNull();
  });

  it("returns null for insufficient topics", () => {
    expect(
      decodeRevokedDelegationForUserDecryption({
        ...log,
        topics: [AclTopics.RevokedDelegationForUserDecryption],
      }),
    ).toBeNull();
  });
});

describe("decodeAclEvent", () => {
  it("dispatches to DelegatedForUserDecryption decoder", () => {
    const log: RawLog = {
      topics: [AclTopics.DelegatedForUserDecryption, topic("aaa1"), topic("bbb2")],
      data: `0x${word("ccc3")}${word("1")}${word("0")}${word("3e8")}`,
    };
    const event = decodeAclEvent(log);
    expect(event?.eventName).toBe("DelegatedForUserDecryption");
  });

  it("dispatches to RevokedDelegationForUserDecryption decoder", () => {
    const log: RawLog = {
      topics: [AclTopics.RevokedDelegationForUserDecryption, topic("aaa1"), topic("bbb2")],
      data: `0x${word("ccc3")}${word("1")}${word("3e8")}`,
    };
    const event = decodeAclEvent(log);
    expect(event?.eventName).toBe("RevokedDelegationForUserDecryption");
  });

  it("returns null for unknown event", () => {
    const log: RawLog = {
      topics: [topic("00".repeat(32))],
      data: "0x",
    };
    expect(decodeAclEvent(log)).toBeNull();
  });
});

describe("decodeAclEvents", () => {
  it("decodes array of mixed logs, skipping unknown", () => {
    const logs: RawLog[] = [
      {
        topics: [AclTopics.DelegatedForUserDecryption, topic("aaa1"), topic("bbb2")],
        data: `0x${word("ccc3")}${word("1")}${word("0")}${word("3e8")}`,
      },
      { topics: ["0xunknown" as Hex], data: "0x" as Hex },
      {
        topics: [AclTopics.RevokedDelegationForUserDecryption, topic("aaa1"), topic("bbb2")],
        data: `0x${word("ccc3")}${word("1")}${word("3e8")}`,
      },
    ];
    const events = decodeAclEvents(logs);
    expect(events).toHaveLength(2);
    expect(events[0].eventName).toBe("DelegatedForUserDecryption");
    expect(events[1].eventName).toBe("RevokedDelegationForUserDecryption");
  });
});

describe("findDelegatedForUserDecryption", () => {
  it("finds first DelegatedForUserDecryption in mixed logs", () => {
    const logs: RawLog[] = [
      { topics: ["0xunknown" as Hex], data: "0x" as Hex },
      {
        topics: [AclTopics.DelegatedForUserDecryption, topic("aaa1"), topic("bbb2")],
        data: `0x${word("ccc3")}${word("1")}${word("0")}${word("3e8")}`,
      },
    ];
    const event = findDelegatedForUserDecryption(logs);
    expect(event?.eventName).toBe("DelegatedForUserDecryption");
    expect(event?.delegator).toBe(addr("aaa1"));
  });

  it("returns null when none found", () => {
    expect(findDelegatedForUserDecryption([])).toBeNull();
  });
});

describe("findRevokedDelegationForUserDecryption", () => {
  it("finds first RevokedDelegationForUserDecryption in mixed logs", () => {
    const logs: RawLog[] = [
      {
        topics: [AclTopics.RevokedDelegationForUserDecryption, topic("aaa1"), topic("bbb2")],
        data: `0x${word("ccc3")}${word("1")}${word("3e8")}`,
      },
    ];
    const event = findRevokedDelegationForUserDecryption(logs);
    expect(event?.eventName).toBe("RevokedDelegationForUserDecryption");
  });

  it("returns null when none found", () => {
    expect(findRevokedDelegationForUserDecryption([])).toBeNull();
  });
});
