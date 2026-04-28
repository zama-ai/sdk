import { node, sepolia } from "@zama-fhe/sdk/node";
import type { Address } from "viem";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createConfig } from "../../config/create";
import { ZamaSDK } from "../../zama-sdk";

const config = sepolia;
const CONTRACT_ADDRESS = config.aclContractAddress as Address;
const SECOND_CONTRACT = "0x0000000000000000000000000000000000000099" as Address;
const USER_ADDRESS = "0x0000000000000000000000000000000000000001" as Address;
const DELEGATOR_ADDRESS = "0x0000000000000000000000000000000000000002" as Address;

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

  // ── Artifacts ──────────────────────────────────────────────

  it("fetches and caches public key", async () => {
    const pk = await sdk.relayer.getPublicKey();
    expect(pk).not.toBeNull();
    expect(pk!.publicKeyId).toBeTypeOf("string");
    expect(pk!.publicKey).toBeInstanceOf(Uint8Array);
    expect(pk!.publicKey.length).toBeGreaterThan(0);

    // Second call should be cached
    const start = performance.now();
    const pk2 = await sdk.relayer.getPublicKey();
    expect(performance.now() - start).toBeLessThan(1_000);
    expect(pk2!.publicKeyId).toBe(pk!.publicKeyId);
  }, 120_000);

  it("fetches public params", async () => {
    const pp = await sdk.relayer.getPublicParams(2048);
    expect(pp).not.toBeNull();
    expect(pp!.publicParamsId).toBeTypeOf("string");
    expect(pp!.publicParams).toBeInstanceOf(Uint8Array);
    expect(pp!.publicParams.length).toBeGreaterThan(0);
  }, 120_000);

  it("returns the ACL address matching config", async () => {
    const acl = await sdk.relayer.getAclAddress();
    expect(acl).toBe(config.aclContractAddress);
  });

  // ── ExtraData ──────────────────────────────────────────────

  it("getExtraData is consistent and threaded into EIP-712", async () => {
    const extraData = await sdk.relayer.getExtraData();
    expect(extraData).toBeTypeOf("string");
    expect(extraData).toMatch(/^0x/);
    expect(await sdk.relayer.getExtraData()).toBe(extraData);

    // Verify extraData in user EIP-712
    const keypair = await sdk.relayer.generateKeypair();
    const now = Math.floor(Date.now() / 1000);
    const eip712 = await sdk.relayer.createEIP712(keypair.publicKey, [CONTRACT_ADDRESS], now, 7);
    expect(eip712.message.extraData).toBe(extraData);

    // Verify extraData in delegated EIP-712
    const delegated = await sdk.relayer.createDelegatedUserDecryptEIP712(
      keypair.publicKey,
      [CONTRACT_ADDRESS],
      DELEGATOR_ADDRESS,
      now,
      7,
    );
    expect(delegated.message.extraData).toBe(extraData);
  }, 120_000);

  // ── Keypair + EIP-712 ─────────────────────────────────────

  it("end-to-end: keypair → user EIP-712 with multiple contracts", async () => {
    const kp = await sdk.relayer.generateKeypair();
    expect(kp.publicKey).toMatch(/^0x/);
    expect(kp.publicKey.length).toBeGreaterThan(4);
    expect(kp.privateKey).toMatch(/^0x/);

    const now = Math.floor(Date.now() / 1000);
    const eip712 = await sdk.relayer.createEIP712(
      kp.publicKey,
      [CONTRACT_ADDRESS, SECOND_CONTRACT],
      now,
      7,
    );

    expect(eip712.domain.name).toBeTypeOf("string");
    expect(eip712.types).toHaveProperty("EIP712Domain");

    const msg = eip712.message as Record<string, unknown>;
    expect(msg.publicKey).toBe(kp.publicKey);
    const addrs = msg.contractAddresses as string[];
    expect(addrs).toHaveLength(2);
    expect(addrs).toContain(CONTRACT_ADDRESS);
    expect(addrs).toContain(SECOND_CONTRACT);
    expect(msg).toHaveProperty("startTimestamp");
    expect(msg).toHaveProperty("durationDays");
    expect(msg.extraData).toMatch(/^0x/);
  }, 120_000);

  it("end-to-end: keypair → delegated EIP-712", async () => {
    const kp = await sdk.relayer.generateKeypair();
    const now = Math.floor(Date.now() / 1000);
    const eip712 = await sdk.relayer.createDelegatedUserDecryptEIP712(
      kp.publicKey,
      [CONTRACT_ADDRESS],
      DELEGATOR_ADDRESS,
      now,
      7,
    );

    expect(eip712.domain.name).toBeTypeOf("string");
    expect(eip712.types).toHaveProperty("EIP712Domain");

    const msg = eip712.message as Record<string, unknown>;
    expect(msg.publicKey).toBe(kp.publicKey);
    expect(msg.contractAddresses).toEqual([CONTRACT_ADDRESS]);
    expect(msg.delegatorAddress).toBe(DELEGATOR_ADDRESS);
    expect(msg.extraData).toMatch(/^0x/);
  }, 120_000);

  // ── Encrypt ────────────────────────────────────────────────

  it("encrypts all FHE types with correct handle format", async () => {
    const result = await sdk.relayer.encrypt({
      values: [
        { value: true, type: "ebool" },
        { value: 255n, type: "euint8" },
        { value: 1000n, type: "euint16" },
        { value: 100_000n, type: "euint32" },
        { value: 42n, type: "euint64" },
        { value: 2n ** 100n, type: "euint128" },
        { value: 2n ** 200n, type: "euint256" },
        { value: USER_ADDRESS, type: "eaddress" },
      ],
      contractAddress: CONTRACT_ADDRESS,
      userAddress: USER_ADDRESS,
    });

    expect(result.handles).toHaveLength(8);
    expect(result.inputProof).toBeDefined();
    expect(result.inputProof.length).toBeGreaterThan(2);
    for (const handle of result.handles) {
      expect(handle).toHaveLength(32);
    }
  }, 120_000);

  it("produces unique handles for same plaintext (randomized encryption)", async () => {
    const params = {
      values: [{ value: 100n, type: "euint64" as const }],
      contractAddress: CONTRACT_ADDRESS,
      userAddress: USER_ADDRESS,
    };

    const result1 = await sdk.relayer.encrypt(params);
    const result2 = await sdk.relayer.encrypt(params);
    expect(result1.handles[0]).not.toBe(result2.handles[0]);
  }, 120_000);
});
