import { decodeAbiParameters, encodeFunctionData, getAbiItem, type Hex } from "viem";
import type { EncryptedValue } from "../../relayer/types";
import { describe, expect, test } from "../../test-fixtures";
import { vaultRouterAbi } from "../abi/vault-router.abi";
import { encodeAllocationData, type EncryptedAllocationLeg } from "../contracts/vault-router";

const LEGS: readonly EncryptedAllocationLeg[] = [
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
];
const PROOF: Hex = "0xdeadbeef";

describe("encodeAllocationData", () => {
  test("round-trips the legs and the proof", () => {
    const [legs, inputProof] = decodeAbiParameters(
      getAbiItem({ abi: vaultRouterAbi, name: "join" }).inputs,
      encodeAllocationData(LEGS, PROOF),
    );
    expect(legs).toStrictEqual(LEGS);
    expect(inputProof).toBe(PROOF);
  });

  test("produces exactly the arguments of a `join` call", () => {
    const call = encodeFunctionData({
      abi: vaultRouterAbi,
      functionName: "join",
      args: [LEGS, PROOF],
    });
    expect(encodeAllocationData(LEGS, PROOF)).toBe(`0x${call.slice(10)}`);
  });

  test("keeps leg order, which is what pairs a handle with its batcher", () => {
    const swapped = [LEGS[1], LEGS[0]].filter((leg) => leg !== undefined);
    expect(encodeAllocationData(swapped, PROOF)).not.toBe(encodeAllocationData(LEGS, PROOF));
  });
});
