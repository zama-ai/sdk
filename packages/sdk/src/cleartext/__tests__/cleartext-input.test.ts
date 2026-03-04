import { SigningKey } from "ethers";
import { describe, it, expect } from "vitest";
import { createCleartextEncryptedInput } from "../cleartext-input";

const ACL = "0x50157CFfD6bBFA2DECe204a89ec419c23ef5755D";
const CONTRACT = "0xe3a9105a3a932253A70F126eb1E3b589C643dD24";
const USER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const CHAIN_ID = 31337;

const MOCK_SIGNER_PK = "0x7ec8ada6642fc4ccfb7729bc29c17cf8d21b61abd5642d1db992c0b8672ab901";
const signingKey = new SigningKey(MOCK_SIGNER_PK);

function makeInput(overrides?: { contractAddress?: string; userAddress?: string }) {
  return createCleartextEncryptedInput({
    aclContractAddress: ACL,
    chainId: CHAIN_ID,
    contractAddress: overrides?.contractAddress ?? CONTRACT,
    userAddress: overrides?.userAddress ?? USER,
    signingContext: {
      signingKey,
      gatewayChainId: 10901,
      verifyingContract: "0x812b06e1CDCE800494b79fFE4f925A504a9A9810",
      contractAddress: overrides?.contractAddress ?? CONTRACT,
      userAddress: overrides?.userAddress ?? USER,
      contractChainId: CHAIN_ID,
    },
  });
}

describe("createCleartextEncryptedInput", () => {
  it("accumulates values and produces handles + inputProof", async () => {
    const input = makeInput();
    input.add8(42).add16(1000);
    const result = await input.encrypt();

    expect(result.handles).toHaveLength(2);
    expect(result.handles[0]).toBeInstanceOf(Uint8Array);
    expect(result.handles[0]!.length).toBe(32);
    expect(result.inputProof).toBeInstanceOf(Uint8Array);
    expect(result.inputProof.length).toBeGreaterThan(0);
  });

  it("produces unique handles for identical values (entropy injection)", async () => {
    const make = () => {
      const input = makeInput();
      input.add8(42).add16(1000);
      return input.encrypt();
    };
    const r1 = await make();
    const r2 = await make();
    // Same plaintext values must produce different handles (random nonce in ciphertext)
    expect(r1.handles[0]).not.toEqual(r2.handles[0]);
    expect(r1.handles[1]).not.toEqual(r2.handles[1]);
  });

  it("throws on empty encrypt", async () => {
    const input = makeInput();
    await expect(input.encrypt()).rejects.toThrow("at least one value");
  });

  it("enforces 2048-bit limit", () => {
    const input = makeInput();
    for (let i = 0; i < 8; i++) input.add256(BigInt(i));
    expect(() => input.add256(9n)).toThrow("2048 bits");
  });

  it("throws on null/undefined value for add8", () => {
    const input = makeInput();
    expect(() => input.add8(null as never)).toThrow("Missing value");
  });

  it("validates value bounds", () => {
    const input = makeInput();
    expect(() => input.add8(256)).toThrow("exceeds the limit");
    expect(() => input.addBool(2)).toThrow("must be 0 or 1");
  });

  it("rejects negative values", () => {
    const input = makeInput();
    expect(() => input.add8(-1)).toThrow("non-negative");
    expect(() => input.add64(-1n)).toThrow("non-negative");
    expect(() => input.add256(-1n)).toThrow("non-negative");
  });

  it("getBits returns accumulated types", () => {
    const input = makeInput();
    input.addBool(true).add8(42).add64(123n);
    expect(input.getBits()).toEqual([2, 8, 64]);
  });

  it("addAddress accepts checksummed addresses", async () => {
    const input = makeInput();
    input.addAddress("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
    const result = await input.encrypt();
    expect(result.handles).toHaveLength(1);
    expect(result.handles[0]!.length).toBe(32);
    expect(input.getBits()).toEqual([160]);
  });

  it("addAddress rejects invalid addresses", () => {
    const input = makeInput();
    expect(() => input.addAddress("0xinvalid")).toThrow();
  });

  it("add128 stores 128-bit values", async () => {
    const input = makeInput();
    input.add128(BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF"));
    const result = await input.encrypt();
    expect(result.handles).toHaveLength(1);
    expect(input.getBits()).toEqual([128]);
  });

  it("enforces 256 variable limit", () => {
    const input = makeInput();
    for (let i = 0; i < 256; i++) input.addBool(0);
    expect(() => input.addBool(0)).toThrow("256 variables");
  });

  it("supports method chaining", () => {
    const input = makeInput();
    const result = input.addBool(false).add8(255).add16(65535).add32(100000);
    expect(result).toBe(input);
  });

  it("inputProof includes signature (numSigners=1)", async () => {
    const input = makeInput();
    input.add64(42n);
    const result = await input.encrypt();
    // byte 0: numHandles=1, byte 1: numSigners=1
    expect(result.inputProof[0]).toBe(1);
    expect(result.inputProof[1]).toBe(1);
    // total = 2 (header) + 32 (handle) + 65 (signature) + 32 (extraData, no version prefix)
    expect(result.inputProof.length).toBe(2 + 32 + 65 + 32);
  });
});
