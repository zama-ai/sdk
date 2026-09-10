import { describe, expect, test } from "vitest";
import { getAddress } from "viem";
import { ConfigurationError } from "../../errors";
import { parsePreparedPermit } from "../parse-prepared-permit";

const signer = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
const prepared = {
  version: 1,
  signerAddress: signer,
  eip712: { domain: {}, types: {}, message: {} },
};

describe("parsePreparedPermit", () => {
  test("normalizes addresses without imposing authorization policy", () => {
    const eip712 = {
      ...prepared.eip712,
      message: { durationDays: "365", startTimestamp: "1", delegatorAddress: signer },
    };
    expect(parsePreparedPermit({ ...prepared, eip712 })).toEqual({
      ...prepared,
      signerAddress: getAddress(signer),
      eip712,
    });
  });

  test.each([
    null,
    [],
    { ...prepared, version: 2 },
    { ...prepared, signerAddress: "bad" },
    { ...prepared, eip712: { message: {} } },
  ])("rejects malformed prepared permits", (value) => {
    expect(() => parsePreparedPermit(value)).toThrow(ConfigurationError);
  });
});
