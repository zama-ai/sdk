import { decodeAbiParameters, encodeFunctionData, getAbiItem } from "viem";
import type { EncryptedValue } from "../../relayer/types";
import { describe, expect, test } from "../../test-fixtures";
import { vaultRouterAbi } from "../abi/vault-router.abi";
import { encodeAllocationData, type EncryptedAllocation } from "../allocation";

const ALLOCATION: EncryptedAllocation = {
  legs: [
    {
      batcher: "0x1111111111111111111111111111111111111111",
      token: "0x2222222222222222222222222222222222222222",
      amount: `0x${"11".repeat(32)}` as EncryptedValue,
    },
    {
      batcher: "0x3333333333333333333333333333333333333333",
      token: "0x2222222222222222222222222222222222222222",
      amount: `0x${"22".repeat(32)}` as EncryptedValue,
    },
  ],
  inputProof: "0xdeadbeef",
};

describe("encodeAllocationData", () => {
  test("round-trips the legs and the proof", () => {
    const [legs, inputProof] = decodeAbiParameters(
      getAbiItem({ abi: vaultRouterAbi, name: "join" }).inputs,
      encodeAllocationData(ALLOCATION),
    );
    expect(legs).toStrictEqual(ALLOCATION.legs);
    expect(inputProof).toBe(ALLOCATION.inputProof);
  });

  test("produces exactly the arguments of a `join` call", () => {
    // The router's push entry point decodes its `data` into the same pair
    // `join` takes, so the two encodings have to stay identical.
    const call = encodeFunctionData({
      abi: vaultRouterAbi,
      functionName: "join",
      args: [ALLOCATION.legs, ALLOCATION.inputProof],
    });
    expect(encodeAllocationData(ALLOCATION)).toBe(`0x${call.slice(10)}`);
  });

  test("keeps leg order, which is what pairs a handle with its batcher", () => {
    const swapped: EncryptedAllocation = {
      ...ALLOCATION,
      legs: [ALLOCATION.legs[1], ALLOCATION.legs[0]].filter((leg) => leg !== undefined),
    };
    expect(encodeAllocationData(swapped)).not.toBe(encodeAllocationData(ALLOCATION));
  });
});
