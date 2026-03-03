import { describe, it, expect } from "vitest";
import { createCleartextEncryptedInput } from "../cleartext-input";

const ACL = "0x50157CFfD6bBFA2DECe204a89ec419c23ef5755D";
const CONTRACT = "0xe3a9105a3a932253A70F126eb1E3b589C643dD24";
const USER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const CHAIN_ID = 31337;

describe("createCleartextEncryptedInput", () => {
  it("accumulates values and produces handles + inputProof", async () => {
    const input = createCleartextEncryptedInput({
      aclContractAddress: ACL,
      chainId: CHAIN_ID,
      contractAddress: CONTRACT,
      userAddress: USER,
    });
    input.add8(42).add16(1000);
    const result = await input.encrypt();

    expect(result.handles).toHaveLength(2);
    expect(result.handles[0]).toBeInstanceOf(Uint8Array);
    expect(result.handles[0]!.length).toBe(32);
    expect(result.inputProof).toBeInstanceOf(Uint8Array);
    expect(result.inputProof.length).toBeGreaterThan(0);
  });

  it("is deterministic", async () => {
    const make = () => {
      const input = createCleartextEncryptedInput({
        aclContractAddress: ACL,
        chainId: CHAIN_ID,
        contractAddress: CONTRACT,
        userAddress: USER,
      });
      input.add8(42).add16(1000);
      return input.encrypt();
    };
    const r1 = await make();
    const r2 = await make();
    expect(r1.handles[0]).toEqual(r2.handles[0]);
    expect(r1.handles[1]).toEqual(r2.handles[1]);
  });

  it("throws on empty encrypt", async () => {
    const input = createCleartextEncryptedInput({
      aclContractAddress: ACL,
      chainId: CHAIN_ID,
      contractAddress: CONTRACT,
      userAddress: USER,
    });
    await expect(input.encrypt()).rejects.toThrow("at least one value");
  });

  it("enforces 2048-bit limit", () => {
    const input = createCleartextEncryptedInput({
      aclContractAddress: ACL,
      chainId: CHAIN_ID,
      contractAddress: CONTRACT,
      userAddress: USER,
    });
    for (let i = 0; i < 8; i++) input.add256(BigInt(i));
    expect(() => input.add256(9n)).toThrow("2048 bits");
  });

  it("throws on null/undefined value for addBool", () => {
    const input = createCleartextEncryptedInput({
      aclContractAddress: ACL,
      chainId: CHAIN_ID,
      contractAddress: CONTRACT,
      userAddress: USER,
    });
    expect(() => input.addBool(null as never)).toThrow("Missing value");
  });

  it("throws on null/undefined value for add8", () => {
    const input = createCleartextEncryptedInput({
      aclContractAddress: ACL,
      chainId: CHAIN_ID,
      contractAddress: CONTRACT,
      userAddress: USER,
    });
    expect(() => input.add8(null as never)).toThrow("Missing value");
  });

  it("validates value bounds", () => {
    const input = createCleartextEncryptedInput({
      aclContractAddress: ACL,
      chainId: CHAIN_ID,
      contractAddress: CONTRACT,
      userAddress: USER,
    });
    expect(() => input.add8(256)).toThrow("exceeds the limit");
    expect(() => input.addBool(2)).toThrow("must be 0 or 1");
  });

  it("rejects negative values", () => {
    const input = createCleartextEncryptedInput({
      aclContractAddress: ACL,
      chainId: CHAIN_ID,
      contractAddress: CONTRACT,
      userAddress: USER,
    });
    expect(() => input.add8(-1)).toThrow("non-negative");
    expect(() => input.add64(-1n)).toThrow("non-negative");
    expect(() => input.add256(-1n)).toThrow("non-negative");
  });

  it("getBits returns accumulated types", () => {
    const input = createCleartextEncryptedInput({
      aclContractAddress: ACL,
      chainId: CHAIN_ID,
      contractAddress: CONTRACT,
      userAddress: USER,
    });
    input.addBool(true).add8(42).add64(123n);
    expect(input.getBits()).toEqual([2, 8, 64]);
  });

  it("addAddress accepts checksummed addresses", async () => {
    const input = createCleartextEncryptedInput({
      aclContractAddress: ACL,
      chainId: CHAIN_ID,
      contractAddress: CONTRACT,
      userAddress: USER,
    });
    input.addAddress("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
    const result = await input.encrypt();
    expect(result.handles).toHaveLength(1);
    expect(result.handles[0]!.length).toBe(32);
    expect(input.getBits()).toEqual([160]);
  });

  it("addAddress rejects invalid addresses", () => {
    const input = createCleartextEncryptedInput({
      aclContractAddress: ACL,
      chainId: CHAIN_ID,
      contractAddress: CONTRACT,
      userAddress: USER,
    });
    expect(() => input.addAddress("0xinvalid")).toThrow();
  });

  it("add128 stores 128-bit values", async () => {
    const input = createCleartextEncryptedInput({
      aclContractAddress: ACL,
      chainId: CHAIN_ID,
      contractAddress: CONTRACT,
      userAddress: USER,
    });
    input.add128(BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF"));
    const result = await input.encrypt();
    expect(result.handles).toHaveLength(1);
    expect(input.getBits()).toEqual([128]);
  });

  it("enforces 256 variable limit", () => {
    const input = createCleartextEncryptedInput({
      aclContractAddress: ACL,
      chainId: CHAIN_ID,
      contractAddress: CONTRACT,
      userAddress: USER,
    });
    for (let i = 0; i < 256; i++) input.addBool(0);
    expect(() => input.addBool(0)).toThrow("256 variables");
  });

  it("supports method chaining", () => {
    const input = createCleartextEncryptedInput({
      aclContractAddress: ACL,
      chainId: CHAIN_ID,
      contractAddress: CONTRACT,
      userAddress: USER,
    });
    const result = input.addBool(false).add8(255).add16(65535).add32(100000);
    expect(result).toBe(input);
  });
});
