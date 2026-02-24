import { describe, it, expect } from "vitest";
import {
  confidentialTransferContract,
  wrapContract,
  setOperatorContract,
} from "@zama-fhe/sdk";

type Address = `0x${string}`;

/**
 * Wagmi adapter hooks delegate to contract call builders + wagmi's useWriteContract.
 * Since wagmi is an optional peer dependency (not installed in test env),
 * we test the contract call builders that the hooks compose, verifying they
 * produce the correct ContractCallConfig for wagmi's mutate().
 */
describe("confidentialTransferContract", () => {
  it("returns correct contract call config", () => {
    const handle = new Uint8Array([1, 2, 3]);
    const inputProof = new Uint8Array([4, 5, 6]);
    const config = confidentialTransferContract(
      "0x1111111111111111111111111111111111111111" as Address,
      "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address,
      handle,
      inputProof,
    );

    expect(config.address).toBe("0x1111111111111111111111111111111111111111");
    expect(config.functionName).toBe("confidentialTransfer");
    expect(config.abi).toBeDefined();
    expect(config.args).toHaveLength(3);
  });
});

describe("wrapContract", () => {
  it("returns correct contract call config", () => {
    const config = wrapContract(
      "0x4444444444444444444444444444444444444444" as Address,
      "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address,
      100n,
    );

    expect(config.address).toBe("0x4444444444444444444444444444444444444444");
    expect(config.functionName).toBe("wrap");
    expect(config.abi).toBeDefined();
    expect(config.args).toEqual(["0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", 100n]);
  });
});

describe("setOperatorContract", () => {
  it("returns correct contract call config with default timestamp", () => {
    const config = setOperatorContract(
      "0x1111111111111111111111111111111111111111" as Address,
      "0x3333333333333333333333333333333333333333" as Address,
    );

    expect(config.address).toBe("0x1111111111111111111111111111111111111111");
    expect(config.functionName).toBe("setOperator");
    expect(config.abi).toBeDefined();
    expect(config.args[0]).toBe("0x3333333333333333333333333333333333333333");
    // Default: Math.floor(Date.now() / 1000) + 3600
    expect(config.args[1]).toBeGreaterThan(0);
  });

  it("returns correct contract call config with custom timestamp", () => {
    const config = setOperatorContract(
      "0x1111111111111111111111111111111111111111" as Address,
      "0x3333333333333333333333333333333333333333" as Address,
      12345,
    );

    expect(config.args[0]).toBe("0x3333333333333333333333333333333333333333");
    expect(config.args[1]).toBe(12345);
  });
});
