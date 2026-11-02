import { keccak256, toBytes } from "viem";
import { describe, expect, test } from "../../test-fixtures";
import { HcuBlockLimitExceededError, HcuTransactionLimitExceededError } from "..";
import { matchHcuRevert } from "../hcu-revert";

const BLOCK_LIMIT = "0xad251174";
const TX_LIMIT = "0x77e3c293";
const DEPTH_LIMIT = "0xfc344870";

describe("matchHcuRevert", () => {
  test("maps viem's undecodable revert (raw + signature on a nested cause)", () => {
    // No SDK ABI carries HCULimit's errors, so viem cannot decode an errorName.
    const error = Object.assign(new Error("execution reverted"), {
      name: "ContractFunctionExecutionError",
      cause: Object.assign(new Error("reverted"), {
        name: "ContractFunctionRevertedError",
        raw: BLOCK_LIMIT,
        signature: BLOCK_LIMIT,
      }),
    });
    const mapped = matchHcuRevert(error);
    expect(mapped).toBeInstanceOf(HcuBlockLimitExceededError);
    expect(mapped?.cause).toBe(error);
    expect(mapped?.retryable).toBe(true);
  });

  test("maps ethers' CALL_EXCEPTION carrying the revert data", () => {
    const error = Object.assign(new Error("call revert exception"), {
      code: "CALL_EXCEPTION",
      data: TX_LIMIT,
    });
    const mapped = matchHcuRevert(error);
    expect(mapped).toBeInstanceOf(HcuTransactionLimitExceededError);
    expect(mapped?.retryable).toBe(false);
  });

  test("maps both per-transaction limits to the same error, with distinct messages", () => {
    const total = matchHcuRevert(new Error(`execution reverted: ${TX_LIMIT}`));
    const depth = matchHcuRevert(new Error(`execution reverted: ${DEPTH_LIMIT}`));
    expect(total).toBeInstanceOf(HcuTransactionLimitExceededError);
    expect(depth).toBeInstanceOf(HcuTransactionLimitExceededError);
    expect(depth?.message).toContain("depth");
    expect(total?.message).not.toContain("depth");
  });

  test("maps a message-only rendering that names the error", () => {
    expect(matchHcuRevert(new Error("reverted with HCUBlockLimitExceeded()"))).toBeInstanceOf(
      HcuBlockLimitExceededError,
    );
  });

  test("returns null for unrelated reverts and transport failures", () => {
    expect(matchHcuRevert(new Error("execution reverted"))).toBeNull();
    expect(matchHcuRevert(new Error("network error"))).toBeNull();
    expect(
      matchHcuRevert(
        Object.assign(new Error("reverted"), { code: "CALL_EXCEPTION", data: "0xdeadbeef" }),
      ),
    ).toBeNull();
    expect(matchHcuRevert(undefined)).toBeNull();
  });

  // Drift guard: the hardcoded selectors must stay the keccak of the Solidity
  // signatures HCULimit reverts with, or the typed errors silently stop firing.
  test("the selectors match the HCULimit error signatures", () => {
    const selector = (signature: string) => keccak256(toBytes(signature)).slice(0, 10);
    expect(selector("HCUBlockLimitExceeded()")).toBe(BLOCK_LIMIT);
    expect(selector("HCUTransactionLimitExceeded()")).toBe(TX_LIMIT);
    expect(selector("HCUTransactionDepthLimitExceeded()")).toBe(DEPTH_LIMIT);
  });
});
