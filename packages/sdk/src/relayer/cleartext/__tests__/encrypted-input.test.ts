import { ethers } from "ethers";
import { describe, expect, it } from "vitest";
import { FheType } from "../constants";
import { CleartextEncryptedInput } from "../encrypted-input";
import { CLEAR_TEXT_MOCK_CONFIG, CONTRACT_ADDRESS, USER_ADDRESS } from "./fixtures";

describe("CleartextEncryptedInput", () => {
  it("encrypt produces proof bytes with expected layout", async () => {
    const input = new CleartextEncryptedInput(
      CONTRACT_ADDRESS,
      USER_ADDRESS,
      CLEAR_TEXT_MOCK_CONFIG,
    )
      .add8(42n)
      .add8(99n);

    const { handles, inputProof } = await input.encrypt();

    expect(inputProof[0]).toBe(2);
    expect(inputProof[1]).toBe(1);
    expect(inputProof.length).toBe(195);

    expect(ethers.hexlify(inputProof.slice(2, 34))).toBe(ethers.hexlify(handles[0]!));
    expect(ethers.hexlify(inputProof.slice(34, 66))).toBe(ethers.hexlify(handles[1]!));

    const signature = inputProof.slice(66, 131);
    expect(signature.length).toBe(65);

    const clear0 = ethers.toBigInt(ethers.hexlify(inputProof.slice(131, 163)));
    const clear1 = ethers.toBigInt(ethers.hexlify(inputProof.slice(163, 195)));
    expect(clear0).toBe(42n);
    expect(clear1).toBe(99n);
  });

  it("add methods map to expected FheType metadata", async () => {
    const input = new CleartextEncryptedInput(
      CONTRACT_ADDRESS,
      USER_ADDRESS,
      CLEAR_TEXT_MOCK_CONFIG,
    )
      .addBool(true)
      .add4(4n)
      .add8(8n)
      .add16(16n)
      .add32(32n)
      .add64(64n)
      .add128(128n)
      .addAddress("0x3000000000000000000000000000000000000003")
      .add256(256n);

    const { handles } = await input.encrypt();
    expect(handles.map((handle) => handle[30])).toEqual([
      FheType.Bool,
      FheType.Uint4,
      FheType.Uint8,
      FheType.Uint16,
      FheType.Uint32,
      FheType.Uint64,
      FheType.Uint128,
      FheType.Uint160,
      FheType.Uint256,
    ]);
  });

  it("returned handles match handles embedded in proof", async () => {
    const input = new CleartextEncryptedInput(
      CONTRACT_ADDRESS,
      USER_ADDRESS,
      CLEAR_TEXT_MOCK_CONFIG,
    )
      .add8(7n)
      .add16(11n)
      .add32(13n);

    const { handles, inputProof } = await input.encrypt();
    const numHandles = inputProof[0] ?? 0;
    const embedded: Uint8Array[] = Array.from({ length: numHandles }, (_, index) =>
      inputProof.slice(2 + index * 32, 2 + (index + 1) * 32),
    );

    expect(embedded.map((chunk) => ethers.hexlify(chunk))).toEqual(
      handles.map((handle) => ethers.hexlify(handle)),
    );
  });

  it("addBool rejects bigint values outside 0/1", () => {
    const invalidValues = [2n, 3n, -1n] as const;
    for (const value of invalidValues) {
      const input = new CleartextEncryptedInput(
        CONTRACT_ADDRESS,
        USER_ADDRESS,
        CLEAR_TEXT_MOCK_CONFIG,
      );

      expect(() => input.addBool(value)).toThrow(/must be 0, 1, true, or false/i);
    }
  });

  it("addBool accepts booleans and 0n/1n and encodes FheType.Bool handles", async () => {
    const validValues = [true, false, 0n, 1n] as const;
    const encodedTypes: number[] = [];

    for (const value of validValues) {
      const { handles } = await new CleartextEncryptedInput(
        CONTRACT_ADDRESS,
        USER_ADDRESS,
        CLEAR_TEXT_MOCK_CONFIG,
      )
        .addBool(value)
        .encrypt();

      expect(handles).toHaveLength(1);
      encodedTypes.push(handles[0]![30]!);
    }

    expect(encodedTypes).toEqual([
      FheType.Bool,
      FheType.Bool,
      FheType.Bool,
      FheType.Bool,
    ]);
  });

  it("addAddress rejects invalid address strings", () => {
    const invalidAddresses = ["0x00", "not-an-address", ""] as const;

    for (const value of invalidAddresses) {
      const input = new CleartextEncryptedInput(
        CONTRACT_ADDRESS,
        USER_ADDRESS,
        CLEAR_TEXT_MOCK_CONFIG,
      );

      expect(() => input.addAddress(value)).toThrow();
    }
  });

  it("throws when adding negative cleartext values", () => {
    const input = new CleartextEncryptedInput(
      CONTRACT_ADDRESS,
      USER_ADDRESS,
      CLEAR_TEXT_MOCK_CONFIG,
    );

    expect(() => input.add8(-1n)).toThrow(/non-negative/i);
  });

  it("throws when adding value above FheType max bit width", () => {
    const input = new CleartextEncryptedInput(
      CONTRACT_ADDRESS,
      USER_ADDRESS,
      CLEAR_TEXT_MOCK_CONFIG,
    );

    expect(() => input.add8(256n)).toThrow(/exceeds max/i);
  });

  it("enforces max value bounds for uint add methods", () => {
    const boundedAdders = [
      { bits: 4, add: (input: CleartextEncryptedInput, value: bigint) => input.add4(value) },
      { bits: 16, add: (input: CleartextEncryptedInput, value: bigint) => input.add16(value) },
      { bits: 32, add: (input: CleartextEncryptedInput, value: bigint) => input.add32(value) },
      { bits: 64, add: (input: CleartextEncryptedInput, value: bigint) => input.add64(value) },
      { bits: 128, add: (input: CleartextEncryptedInput, value: bigint) => input.add128(value) },
      { bits: 256, add: (input: CleartextEncryptedInput, value: bigint) => input.add256(value) },
    ] as const;

    for (const { bits, add } of boundedAdders) {
      const max = (1n << BigInt(bits)) - 1n;
      const overflow = max + 1n;

      const maxInput = new CleartextEncryptedInput(
        CONTRACT_ADDRESS,
        USER_ADDRESS,
        CLEAR_TEXT_MOCK_CONFIG,
      );
      expect(() => add(maxInput, max)).not.toThrow();

      const overflowInput = new CleartextEncryptedInput(
        CONTRACT_ADDRESS,
        USER_ADDRESS,
        CLEAR_TEXT_MOCK_CONFIG,
      );
      expect(() => add(overflowInput, overflow)).toThrow(/exceeds max/i);
    }
  });

  it("encrypt with no added values returns empty handles and a proof header", async () => {
    const input = new CleartextEncryptedInput(
      CONTRACT_ADDRESS,
      USER_ADDRESS,
      CLEAR_TEXT_MOCK_CONFIG,
    );

    const { handles, inputProof } = await input.encrypt();

    expect(handles).toEqual([]);
    expect(inputProof[0]).toBe(0);
    expect(inputProof[1]).toBe(1);
    expect(inputProof.length).toBe(67);
  });
});
