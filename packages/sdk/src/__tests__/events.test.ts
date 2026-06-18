import { describe, test, expect } from "../test-fixtures";
import { getAddress, keccak256, toHex, toBytes, type Address, type Hex } from "viem";
import {
  Topics,
  decodeConfidentialTransfer,
  decodeWrapped,
  decodeUnwrapRequested,
  decodeUnwrapFinalized,
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
    ["UnwrapFinalized(address,bytes32,bytes32,uint64)", Topics.UnwrapFinalized],
  ];

  for (const [sig, expected] of cases) {
    test(sig, () => {
      expect(keccak256(toHex(toBytes(sig)))).toBe(expected);
    });
  }
});

describe("decodeConfidentialTransfer", () => {
  const from = addr("aaa1");
  const to = addr("bbb2");
  const encryptedAmount = bytes32("cc".repeat(32));

  const log: RawLog = {
    topics: [Topics.ConfidentialTransfer, topic("aaa1"), topic("bbb2"), encryptedAmount],
    data: "0x",
  };

  test("decodes valid log", () => {
    const event = decodeConfidentialTransfer(log);
    expect(event).toEqual({
      eventName: "ConfidentialTransfer",
      from,
      to,
      encryptedAmount,
    });
  });

  test("returns null for wrong topic", () => {
    expect(
      decodeConfidentialTransfer({
        ...log,
        topics: [Topics.Wrapped, ...log.topics.slice(1)],
      }),
    ).toBeNull();
  });

  test("returns null for insufficient topics", () => {
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

  test("decodes valid log", () => {
    const event = decodeWrapped(log);
    expect(event).toEqual({
      eventName: "Wrapped",
      to,
      amountIn,
    });
  });

  test("returns null for wrong topic", () => {
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
  const unwrapRequestId = bytes32("aa".repeat(32));

  const log: RawLog = {
    topics: [Topics.UnwrapRequested, topic("1234"), unwrapRequestId],
    data: `0x${word("ff".repeat(32))}`,
  };

  test("decodes valid log with unwrapRequestId", () => {
    const event = decodeUnwrapRequested(log);
    expect(event).toEqual({
      eventName: "UnwrapRequested",
      receiver,
      unwrapRequestId,
      encryptedAmount: amount,
    });
  });

  test("returns null for wrong topic", () => {
    expect(
      decodeUnwrapRequested({
        ...log,
        topics: [Topics.Wrapped, ...log.topics.slice(1)],
      }),
    ).toBeNull();
  });
});

describe("decodeUnwrapFinalized", () => {
  const receiver = addr("aabb");
  const encryptedHandle = bytes32("cd".repeat(32));
  const unwrapRequestId = bytes32("ab".repeat(32));
  const cleartextAmount = 450n;

  const log: RawLog = {
    topics: [Topics.UnwrapFinalized, topic(receiver.slice(2)), unwrapRequestId],
    data: `0x${word(encryptedHandle.slice(2))}${word(cleartextAmount.toString(16))}`,
  };

  test("decodes valid log with unwrapRequestId", () => {
    const event = decodeUnwrapFinalized(log);
    expect(event).toEqual({
      eventName: "UnwrapFinalized",
      receiver,
      unwrapRequestId,
      encryptedAmount: encryptedHandle,
      cleartextAmount,
    });
  });

  test("returns null for wrong topic", () => {
    expect(
      decodeUnwrapFinalized({
        ...log,
        topics: [Topics.Wrapped, ...log.topics.slice(1)],
      }),
    ).toBeNull();
  });
});

describe("decodeOnChainEvent", () => {
  test("dispatches to correct decoder", () => {
    const log: RawLog = {
      topics: [Topics.UnwrapRequested, topic("abcd"), bytes32("ab".repeat(32))],
      data: `0x${word("ff".repeat(32))}`,
    };
    const event = decodeOnChainEvent(log);
    expect(event?.eventName).toBe("UnwrapRequested");
  });

  test("decodes upgraded UnwrapFinalized logs with the canonical event name", () => {
    const log: RawLog = {
      topics: [Topics.UnwrapFinalized, topic("abcd"), bytes32("aa".repeat(32))],
      data: `0x${word("ff".repeat(32))}${word("1")}`,
    };
    const event = decodeOnChainEvent(log);
    expect(event?.eventName).toBe("UnwrapFinalized");
    expect("unwrapRequestId" in event! && event.unwrapRequestId).toBe(bytes32("aa".repeat(32)));
  });

  test("returns null for unknown event", () => {
    const log: RawLog = {
      topics: [topic("00".repeat(32))],
      data: "0x",
    };
    expect(decodeOnChainEvent(log)).toBeNull();
  });
});

describe("decodeOnChainEvents", () => {
  test("decodes array of mixed logs, skipping unknown", () => {
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
      {
        topics: [Topics.UnwrapFinalized, topic("abcd"), bytes32("aa".repeat(32))],
        data: `0x${word("11".repeat(32))}${word("1")}`,
      },
    ];
    const events = decodeOnChainEvents(logs);
    expect(events).toHaveLength(3);
    expect(events[0].eventName).toBe("UnwrapRequested");
    expect(events[1].eventName).toBe("ConfidentialTransfer");
    expect(events[2].eventName).toBe("UnwrapFinalized");
  });
});

describe("findUnwrapRequested", () => {
  test("finds first UnwrapRequested in mixed logs", () => {
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
    expect(event?.unwrapRequestId).toBe(bytes32("ab".repeat(32)));
  });

  test("returns null when none found", () => {
    expect(findUnwrapRequested([])).toBeNull();
  });
});

describe("findWrapped", () => {
  test("finds first Wrapped in mixed logs", () => {
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

  test("returns null when none found", () => {
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
    test(sig, () => {
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

  test("decodes valid log", () => {
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

  test("returns null for wrong topic", () => {
    expect(
      decodeDelegatedForUserDecryption({
        ...log,
        topics: [Topics.Wrapped, ...log.topics.slice(1)],
      }),
    ).toBeNull();
  });

  test("returns null for insufficient topics", () => {
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

  test("decodes valid log", () => {
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

  test("returns null for wrong topic", () => {
    expect(
      decodeRevokedDelegationForUserDecryption({
        ...log,
        topics: [Topics.Wrapped, ...log.topics.slice(1)],
      }),
    ).toBeNull();
  });

  test("returns null for insufficient topics", () => {
    expect(
      decodeRevokedDelegationForUserDecryption({
        ...log,
        topics: [AclTopics.RevokedDelegationForUserDecryption],
      }),
    ).toBeNull();
  });
});

describe("decodeAclEvent", () => {
  test("dispatches to DelegatedForUserDecryption decoder", () => {
    const log: RawLog = {
      topics: [AclTopics.DelegatedForUserDecryption, topic("aaa1"), topic("bbb2")],
      data: `0x${word("ccc3")}${word("1")}${word("0")}${word("3e8")}`,
    };
    const event = decodeAclEvent(log);
    expect(event?.eventName).toBe("DelegatedForUserDecryption");
  });

  test("dispatches to RevokedDelegationForUserDecryption decoder", () => {
    const log: RawLog = {
      topics: [AclTopics.RevokedDelegationForUserDecryption, topic("aaa1"), topic("bbb2")],
      data: `0x${word("ccc3")}${word("1")}${word("3e8")}`,
    };
    const event = decodeAclEvent(log);
    expect(event?.eventName).toBe("RevokedDelegationForUserDecryption");
  });

  test("returns null for unknown event", () => {
    const log: RawLog = {
      topics: [topic("00".repeat(32))],
      data: "0x",
    };
    expect(decodeAclEvent(log)).toBeNull();
  });
});

describe("decodeAclEvents", () => {
  test("decodes array of mixed logs, skipping unknown", () => {
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
  test("finds first DelegatedForUserDecryption in mixed logs", () => {
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

  test("returns null when none found", () => {
    expect(findDelegatedForUserDecryption([])).toBeNull();
  });
});

describe("findRevokedDelegationForUserDecryption", () => {
  test("finds first RevokedDelegationForUserDecryption in mixed logs", () => {
    const logs: RawLog[] = [
      {
        topics: [AclTopics.RevokedDelegationForUserDecryption, topic("aaa1"), topic("bbb2")],
        data: `0x${word("ccc3")}${word("1")}${word("3e8")}`,
      },
    ];
    const event = findRevokedDelegationForUserDecryption(logs);
    expect(event?.eventName).toBe("RevokedDelegationForUserDecryption");
  });

  test("returns null when none found", () => {
    expect(findRevokedDelegationForUserDecryption([])).toBeNull();
  });
});
