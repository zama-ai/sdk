import { describe, expect, test } from "vitest";
import type { Address } from "viem";
import type { EIP712TypedData } from "../../relayer/types";
import { toViemTypedData } from "../typed-data";

const VERIFYING_CONTRACT = "0x2222222222222222222222222222222222222222" as Address;

const TYPES: EIP712TypedData["types"] = {
  EIP712Domain: [
    { name: "name", type: "string" },
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" },
  ],
  Permit: [
    { name: "startTimestamp", type: "uint256" },
    { name: "amounts", type: "uint256[]" },
    { name: "inner", type: "Inner" },
    { name: "payload", type: "bytes" },
  ],
  Inner: [{ name: "value", type: "uint64" }],
};

function createTypedData(overrides: Partial<EIP712TypedData> = {}): EIP712TypedData {
  return {
    domain: { name: "Decryption", chainId: 1n, verifyingContract: VERIFYING_CONTRACT },
    types: TYPES,
    primaryType: "Permit",
    message: { startTimestamp: 1000n, amounts: [1n, 2n], inner: { value: 3n }, payload: "0x" },
    ...overrides,
  };
}

describe("toViemTypedData", () => {
  test("strips EIP712Domain, numbers the chainId and stringifies nested bigints", () => {
    const result = toViemTypedData(createTypedData());

    expect(result.types).not.toHaveProperty("EIP712Domain");
    expect(result.domain).toEqual({
      name: "Decryption",
      chainId: 1,
      verifyingContract: VERIFYING_CONTRACT,
    });
    expect(result.message).toEqual({
      startTimestamp: "1000",
      amounts: ["1", "2"],
      inner: { value: "3" },
      payload: "0x",
    });
  });

  test("leaves a domain without chainId alone", () => {
    const result = toViemTypedData(
      createTypedData({ domain: { name: "Decryption", verifyingContract: VERIFYING_CONTRACT } }),
    );

    expect(result.domain).toEqual({ name: "Decryption", verifyingContract: VERIFYING_CONTRACT });
  });

  test("passes non-plain objects through untouched", () => {
    const payload = new Uint8Array([1, 2, 3]);
    const result = toViemTypedData(
      createTypedData({ message: { startTimestamp: "1000", amounts: [], inner: {}, payload } }),
    );

    expect((result.message as { payload: unknown }).payload).toBe(payload);
  });
});
