import { getAddress, type Address, type Hex } from "viem";
import { z } from "zod/mini";
import { describe, expect, test } from "../../test-fixtures";
import { prepareTransactionParams, writeContractConfig } from "../offline";

const FROM = "0x1111111111111111111111111111111111111111" as Address;
const CONTRACT = "0x2222222222222222222222222222222222222222" as Address;

/** A minimal, structurally-valid write-contract config. */
const calldata = {
  address: CONTRACT,
  abi: [{ type: "function", name: "setOperator" }],
  functionName: "setOperator",
  args: [FROM, 1_900_000_000],
} as const;

describe("writeContractConfig schema", () => {
  test("accepts a structurally-valid config, with optional value/gas", () => {
    expect(z.safeParse(writeContractConfig, calldata).success).toBe(true);
    expect(z.safeParse(writeContractConfig, { ...calldata, value: 1n, gas: 21_000n }).success).toBe(
      true,
    );
  });

  test("rejects a non-array abi and a non-array args", () => {
    expect(z.safeParse(writeContractConfig, { ...calldata, abi: "0xabi" }).success).toBe(false);
    expect(z.safeParse(writeContractConfig, { ...calldata, args: 42 }).success).toBe(false);
  });

  test("rejects a non-address `address` and a numeric `value`/`gas`", () => {
    expect(z.safeParse(writeContractConfig, { ...calldata, address: "nope" }).success).toBe(false);
    // `value`/`gas` are bigint-only so a JS caller can't slip a `number` in.
    expect(z.safeParse(writeContractConfig, { ...calldata, value: 1 }).success).toBe(false);
  });
});

describe("prepareTransactionParams schema", () => {
  test("accepts from + calldata alone, and with the optional overrides", () => {
    expect(z.safeParse(prepareTransactionParams, { from: FROM, calldata }).success).toBe(true);
    expect(
      z.safeParse(prepareTransactionParams, {
        from: FROM,
        calldata,
        nonce: 3,
        gasLimit: 90_000n,
        fees: { maxFeePerGas: 2n, maxPriorityFeePerGas: 1n },
      }).success,
    ).toBe(true);
  });

  test("EIP-55 checksums `from` on parse (the custodian keys off it)", () => {
    const lower = "0xabcdef0123456789abcdef0123456789abcdef01" as Address;
    const parsed = z.parse(prepareTransactionParams, { from: lower, calldata });
    expect(parsed.from).toBe(getAddress(lower));
    expect(parsed.from).not.toBe(lower); // proves it was normalized, not passed through
  });

  test("rejects a bad `from`, a negative `nonce`, and a half-specified `fees`", () => {
    expect(z.safeParse(prepareTransactionParams, { from: "0xnope", calldata }).success).toBe(false);
    expect(z.safeParse(prepareTransactionParams, { from: FROM, calldata, nonce: -1 }).success).toBe(
      false,
    );
    // Both EIP-1559 legs must be supplied together.
    expect(
      z.safeParse(prepareTransactionParams, {
        from: FROM,
        calldata,
        fees: { maxFeePerGas: 2n } as unknown as {
          maxFeePerGas: bigint;
          maxPriorityFeePerGas: bigint;
        },
      }).success,
    ).toBe(false);
  });

  test("rejects a non-bigint fee leg (a JS caller could slip in a number)", () => {
    expect(
      z.safeParse(prepareTransactionParams, {
        from: FROM,
        calldata,
        fees: { maxFeePerGas: 500, maxPriorityFeePerGas: 1n } as unknown as {
          maxFeePerGas: bigint;
          maxPriorityFeePerGas: bigint;
        },
      }).success,
    ).toBe(false);
  });

  test("rejects a malformed calldata envelope", () => {
    const unsignedTx = "0xdeadbeef" as Hex;
    expect(
      z.safeParse(prepareTransactionParams, { from: FROM, calldata: unsignedTx }).success,
    ).toBe(false);
  });
});
