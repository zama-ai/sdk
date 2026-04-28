import { createConfig, node, sepolia, ZamaSDK } from "@zama-fhe/sdk/node";
import type { Address, Hex } from "viem";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const config = sepolia;
const CONTRACT_ADDRESS = config.aclContractAddress as Address;
const USER_ADDRESS = "0x0000000000000000000000000000000000000001" as Address;
const DELEGATOR_ADDRESS =
  "0x0000000000000000000000000000000000000002" as Address;

describe(`RelayerNode integration`, () => {
  let sdk: ZamaSDK;

  const zamaConfig = createConfig({
    chains: [sepolia],
    signer: {
      getChainId: vi.fn().mockResolvedValue(sepolia.id),
      getAddress: vi.fn().mockResolvedValue(USER_ADDRESS),
      signTypedData: vi.fn(),
      writeContract: vi.fn(),
    },
    provider: {
      getChainId: vi.fn().mockResolvedValue(sepolia.id),
      readContract: vi.fn(),
      waitForTransactionReceipt: vi.fn(),
      getBlockTimestamp: vi.fn(),
    },
    relayers: { [sepolia.id]: node({ poolSize: 1 }) },
  });

  beforeAll(() => {
    sdk = new ZamaSDK(zamaConfig);
  });

  afterAll(() => {
    sdk.terminate();
  });

  // ── Artifact fetching ───────────────────────────────────────

  it("fetches the public key", async () => {
    const pk = await sdk.relayer.getPublicKey();

    expect(pk).not.toBeNull();
    expect(pk!.publicKeyId).toBeTypeOf("string");
    expect(pk!.publicKeyId.length).toBeGreaterThan(0);
    expect(pk!.publicKey).toBeInstanceOf(Uint8Array);
    expect(pk!.publicKey.length).toBeGreaterThan(0);
  }, 120_000);

  it("fetches public params", async () => {
    const pp = await sdk.relayer.getPublicParams(2048);

    expect(pp).not.toBeNull();
    expect(pp!.publicParamsId).toBeTypeOf("string");
    expect(pp!.publicParams).toBeInstanceOf(Uint8Array);
    expect(pp!.publicParams.length).toBeGreaterThan(0);
  }, 120_000);

  it("returns the extra data", async () => {
    const extraData = await sdk.relayer.getExtraData();

    expect(extraData).toBeTypeOf("string");
    expect(extraData).toMatch(/^0x/);
  }, 120_000);

  it("returns the ACL address matching config", async () => {
    const acl = await sdk.relayer.getAclAddress();

    expect(acl).toBe(config.aclContractAddress);
  });

  it("caches public key on second call (no extra network fetch)", async () => {
    const start = performance.now();
    const pk = await sdk.relayer.getPublicKey();
    const elapsed = performance.now() - start;

    expect(pk).not.toBeNull();
    expect(elapsed).toBeLessThan(1_000);
  }, 10_000);

  // ── Keypair generation ─────────────────────────────────────

  let keypair: { publicKey: Hex; privateKey: Hex };

  it("generates a keypair", async () => {
    keypair = await sdk.relayer.generateKeypair();

    expect(keypair.publicKey).toBeTypeOf("string");
    expect(keypair.publicKey).toMatch(/^0x/);
    expect(keypair.publicKey.length).toBeGreaterThan(4);
    expect(keypair.privateKey).toBeTypeOf("string");
    expect(keypair.privateKey).toMatch(/^0x/);
    expect(keypair.privateKey.length).toBeGreaterThan(4);
  }, 120_000);

  it("creates EIP-712 typed data for user decrypt", async () => {
    const now = Math.floor(Date.now() / 1000);
    const eip712 = await sdk.relayer.createEIP712(
      keypair.publicKey,
      [CONTRACT_ADDRESS],
      now,
      7,
    );

    expect(eip712).toBeDefined();
    expect(eip712.domain).toBeDefined();
    expect(eip712.domain.name).toBeTypeOf("string");
    expect(eip712.types).toBeDefined();
    expect(eip712.message).toBeDefined();
  }, 120_000);

  it("EIP-712 message includes extraData", async () => {
    const now = Math.floor(Date.now() / 1000);
    const eip712 = await sdk.relayer.createEIP712(
      keypair.publicKey,
      [CONTRACT_ADDRESS],
      now,
      7,
    );

    // extraData must be threaded through the EIP-712 message (SDK-119 requirement)
    expect(eip712.message).toHaveProperty("extraData");
    expect(eip712.message.extraData).match(/^0x/);
  }, 120_000);

  it("EIP-712 message contains correct contract addresses and timestamps", async () => {
    const now = Math.floor(Date.now() / 1000);
    const eip712 = await sdk.relayer.createEIP712(
      keypair.publicKey,
      [CONTRACT_ADDRESS],
      now,
      7,
    );

    const msg = eip712.message as Record<string, unknown>;
    expect(msg).toHaveProperty("contractAddresses");
    const addrs = msg.contractAddresses as string[];
    expect(addrs).toContain(CONTRACT_ADDRESS);
    expect(msg).toHaveProperty("startTimestamp");
    expect(msg).toHaveProperty("durationDays");
  }, 120_000);

  it("EIP-712 supports multiple contract addresses", async () => {
    const secondContract =
      "0x0000000000000000000000000000000000000099" as Address;
    const now = Math.floor(Date.now() / 1000);
    const eip712 = await sdk.relayer.createEIP712(
      keypair.publicKey,
      [CONTRACT_ADDRESS, secondContract],
      now,
      7,
    );

    const addrs = (eip712.message as Record<string, unknown>)
      .contractAddresses as string[];
    expect(addrs).toHaveLength(2);
    expect(addrs).toContain(CONTRACT_ADDRESS);
    expect(addrs).toContain(secondContract);
  }, 120_000);

  it("creates EIP-712 typed data for delegated user decrypt", async () => {
    const now = Math.floor(Date.now() / 1000);
    const eip712 = await sdk.relayer.createDelegatedUserDecryptEIP712(
      keypair.publicKey,
      [CONTRACT_ADDRESS],
      DELEGATOR_ADDRESS,
      now,
      7,
    );

    expect(eip712).toBeDefined();
    expect(eip712.domain).toBeDefined();
    expect(eip712.domain.name).toBeTypeOf("string");
    expect(eip712.types).toBeDefined();
    expect(eip712.message).toBeDefined();
  }, 120_000);

  it("delegated EIP-712 message includes extraData", async () => {
    const now = Math.floor(Date.now() / 1000);
    const eip712 = await sdk.relayer.createDelegatedUserDecryptEIP712(
      keypair.publicKey,
      [CONTRACT_ADDRESS],
      DELEGATOR_ADDRESS,
      now,
      7,
    );

    // extraData must be threaded through the delegated EIP-712 (SDK-119 requirement)
    expect(eip712.message).toHaveProperty("extraData");
    expect(eip712.message.extraData).match(/^0x/);
  }, 120_000);

  it("delegated EIP-712 message includes delegator address", async () => {
    const now = Math.floor(Date.now() / 1000);
    const eip712 = await sdk.relayer.createDelegatedUserDecryptEIP712(
      keypair.publicKey,
      [CONTRACT_ADDRESS],
      DELEGATOR_ADDRESS,
      now,
      7,
    );

    const msg = eip712.message as Record<string, unknown>;
    expect(msg).toHaveProperty("delegatorAddress");
    expect(msg.delegatorAddress).toBe(DELEGATOR_ADDRESS);
  }, 120_000);

  it("encrypts a single euint64 value", async () => {
    const result = await sdk.relayer.encrypt({
      values: [{ value: 42n, type: "euint64" }],
      contractAddress: CONTRACT_ADDRESS,
      userAddress: USER_ADDRESS,
    });

    expect(result.handles).toBeDefined();
    expect(result.handles.length).toBe(1);
    expect(result.inputProof).toBeDefined();
  }, 120_000);

  it("encrypts multiple values of different types", async () => {
    const result = await sdk.relayer.encrypt({
      values: [
        { value: true, type: "ebool" },
        { value: 255n, type: "euint8" },
        { value: 1000n, type: "euint64" },
      ],
      contractAddress: CONTRACT_ADDRESS,
      userAddress: USER_ADDRESS,
    });

    expect(result.handles.length).toBe(3);
    expect(result.inputProof).toBeDefined();
  }, 120_000);

  it("encrypts an eaddress value", async () => {
    const result = await sdk.relayer.encrypt({
      values: [{ value: USER_ADDRESS, type: "eaddress" }],
      contractAddress: CONTRACT_ADDRESS,
      userAddress: USER_ADDRESS,
    });

    expect(result.handles.length).toBe(1);
    expect(result.inputProof).toBeDefined();
  }, 120_000);

  it("encrypts euint128 and euint256 values", async () => {
    const result = await sdk.relayer.encrypt({
      values: [
        { value: 2n ** 100n, type: "euint128" },
        { value: 2n ** 200n, type: "euint256" },
      ],
      contractAddress: CONTRACT_ADDRESS,
      userAddress: USER_ADDRESS,
    });

    expect(result.handles.length).toBe(2);
    expect(result.inputProof).toBeDefined();
  }, 120_000);

  it("produces unique handles per encryption call", async () => {
    const result1 = await sdk.relayer.encrypt({
      values: [{ value: 100n, type: "euint64" }],
      contractAddress: CONTRACT_ADDRESS,
      userAddress: USER_ADDRESS,
    });

    const result2 = await sdk.relayer.encrypt({
      values: [{ value: 100n, type: "euint64" }],
      contractAddress: CONTRACT_ADDRESS,
      userAddress: USER_ADDRESS,
    });

    // Same plaintext must produce different handles (randomized encryption)
    expect(result1.handles[0]).not.toBe(result2.handles[0]);
  }, 120_000);

  it("each handle is exactly 32 bytes", async () => {
    const result = await sdk.relayer.encrypt({
      values: [{ value: 500n, type: "euint64" }],
      contractAddress: CONTRACT_ADDRESS,
      userAddress: USER_ADDRESS,
    });

    for (const handle of result.handles) {
      // Handles are Bytes32 — 32 bytes regardless of encoding
      expect(handle).toHaveLength(32);
    }
  }, 120_000);

  it("end-to-end: generate keypair → create EIP-712 → verify structure", async () => {
    const kp = await sdk.relayer.generateKeypair();
    expect(kp.publicKey).toMatch(/^0x/);

    const now = Math.floor(Date.now() / 1000);
    const eip712 = await sdk.relayer.createEIP712(
      kp.publicKey,
      [CONTRACT_ADDRESS],
      now,
      7,
    );

    expect(eip712.domain).toBeDefined();
    expect(eip712.types).toBeDefined();
    expect(eip712.types).toHaveProperty("EIP712Domain");
    expect(eip712.message).toBeDefined();

    const msg = eip712.message as Record<string, unknown>;
    expect(msg.publicKey).toBe(kp.publicKey);
    expect(msg.contractAddresses).toEqual([CONTRACT_ADDRESS]);
    expect(msg.extraData).toMatch(/^0x/);
  }, 120_000);

  it("end-to-end: generate keypair → create delegated EIP-712 → verify structure", async () => {
    const kp = await sdk.relayer.generateKeypair();

    const now = Math.floor(Date.now() / 1000);
    const eip712 = await sdk.relayer.createDelegatedUserDecryptEIP712(
      kp.publicKey,
      [CONTRACT_ADDRESS],
      DELEGATOR_ADDRESS,
      now,
      7,
    );

    expect(eip712.domain).toBeDefined();
    expect(eip712.types).toBeDefined();
    expect(eip712.types).toHaveProperty("EIP712Domain");
    expect(eip712.message).toBeDefined();

    const msg = eip712.message as Record<string, unknown>;
    expect(msg.publicKey).toBe(kp.publicKey);
    expect(msg.contractAddresses).toEqual([CONTRACT_ADDRESS]);
    expect(msg.delegatorAddress).toBe(DELEGATOR_ADDRESS);
    expect(msg.extraData).toMatch(/^0x/);
  }, 120_000);

  it("encrypt produces a valid inputProof for on-chain verification", async () => {
    const result = await sdk.relayer.encrypt({
      values: [{ value: 500n, type: "euint64" }],
      contractAddress: CONTRACT_ADDRESS,
      userAddress: USER_ADDRESS,
    });

    expect(result.inputProof).toBeDefined();
    expect(result.inputProof.length).toBeGreaterThan(2);
  }, 120_000);

  it("encrypt with euint16 and euint32 for full type coverage", async () => {
    const result = await sdk.relayer.encrypt({
      values: [
        { value: 1000n, type: "euint16" },
        { value: 100_000n, type: "euint32" },
      ],
      contractAddress: CONTRACT_ADDRESS,
      userAddress: USER_ADDRESS,
    });

    expect(result.handles.length).toBe(2);
    expect(result.inputProof).toBeDefined();
  }, 120_000);

  it("extraData is consistent across calls", async () => {
    const extraData1 = await sdk.relayer.getExtraData();
    const extraData2 = await sdk.relayer.getExtraData();

    expect(extraData1).toBe(extraData2);
  }, 120_000);

  it("extraData in EIP-712 matches getExtraData()", async () => {
    const extraData = await sdk.relayer.getExtraData();
    const now = Math.floor(Date.now() / 1000);
    const eip712 = await sdk.relayer.createEIP712(
      keypair.publicKey,
      [CONTRACT_ADDRESS],
      now,
      7,
    );

    expect(eip712.message.extraData).toBe(extraData);
  }, 120_000);

  it("extraData in delegated EIP-712 matches getExtraData()", async () => {
    const extraData = await sdk.relayer.getExtraData();
    const now = Math.floor(Date.now() / 1000);
    const eip712 = await sdk.relayer.createDelegatedUserDecryptEIP712(
      keypair.publicKey,
      [CONTRACT_ADDRESS],
      DELEGATOR_ADDRESS,
      now,
      7,
    );

    expect(eip712.message.extraData).toBe(extraData);
  }, 120_000);
});
