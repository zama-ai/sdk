import { RelayerNode } from "@zama-fhe/sdk/node";
import type { Address, Hex } from "viem";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SepoliaConfig } from "../relayer-utils";
import { MemoryStorage } from "../../storage/memory-storage";

const CONTRACT_ADDRESS = SepoliaConfig.aclContractAddress as Address;
const USER_ADDRESS = "0x0000000000000000000000000000000000000001" as Address;

describe("RelayerNode integration — Sepolia", () => {
  let relayer: RelayerNode;

  beforeAll(() => {
    relayer = new RelayerNode({
      getChainId: async () => SepoliaConfig.chainId,
      transports: {
        [SepoliaConfig.chainId]: SepoliaConfig,
      },
      poolSize: 1,
      fheArtifactStorage: new MemoryStorage(),
    });
  });

  afterAll(() => {
    relayer.terminate();
  });

  // ── Artifact fetching ───────────────────────────────────────

  it("fetches the public key", async () => {
    const pk = await relayer.getPublicKey();

    expect(pk).not.toBeNull();
    expect(pk!.publicKeyId).toBeTypeOf("string");
    expect(pk!.publicKeyId.length).toBeGreaterThan(0);
    expect(pk!.publicKey).toBeInstanceOf(Uint8Array);
    expect(pk!.publicKey.length).toBeGreaterThan(0);
  }, 120_000);

  it("fetches public params", async () => {
    const pp = await relayer.getPublicParams(2048);

    expect(pp).not.toBeNull();
    expect(pp!.publicParamsId).toBeTypeOf("string");
    expect(pp!.publicParams).toBeInstanceOf(Uint8Array);
    expect(pp!.publicParams.length).toBeGreaterThan(0);
  }, 120_000);

  it("returns the extra data", async () => {
    const extraData = await relayer.getExtraData();

    expect(extraData).toBeTypeOf("string");
    expect(extraData).toMatch(/^0x/);
  }, 120_000);

  it("returns the ACL address matching SepoliaConfig", async () => {
    const acl = await relayer.getAclAddress();

    expect(acl).toBe(SepoliaConfig.aclContractAddress);
  });

  it("caches public key on second call (no extra network fetch)", async () => {
    const start = performance.now();
    const pk = await relayer.getPublicKey();
    const elapsed = performance.now() - start;

    expect(pk).not.toBeNull();
    expect(elapsed).toBeLessThan(1_000);
  }, 10_000);

  // ── Keypair & EIP-712 ──────────────────────────────────────

  let keypair: { publicKey: Hex; privateKey: Hex };

  it("generates a keypair", async () => {
    keypair = await relayer.generateKeypair();

    expect(keypair.publicKey).toBeTypeOf("string");
    expect(keypair.publicKey).toMatch(/^0x/);
    expect(keypair.publicKey.length).toBeGreaterThan(4);
    expect(keypair.privateKey).toBeTypeOf("string");
    expect(keypair.privateKey).toMatch(/^0x/);
    expect(keypair.privateKey.length).toBeGreaterThan(4);
  }, 120_000);

  it("creates EIP-712 typed data for user decrypt", async () => {
    const now = Math.floor(Date.now() / 1000);
    const eip712 = await relayer.createEIP712(keypair.publicKey, [CONTRACT_ADDRESS], now, 7);

    expect(eip712).toBeDefined();
    expect(eip712.domain).toBeDefined();
    expect(eip712.domain.name).toBeTypeOf("string");
    expect(eip712.types).toBeDefined();
    expect(eip712.message).toBeDefined();
  }, 120_000);

  it("creates EIP-712 typed data for delegated user decrypt", async () => {
    const now = Math.floor(Date.now() / 1000);
    const delegatorAddress = "0x0000000000000000000000000000000000000002" as Address;
    const eip712 = await relayer.createDelegatedUserDecryptEIP712(
      keypair.publicKey,
      [CONTRACT_ADDRESS],
      delegatorAddress,
      now,
      7,
    );

    expect(eip712).toBeDefined();
    expect(eip712.domain).toBeDefined();
    expect(eip712.domain.name).toBeTypeOf("string");
    expect(eip712.types).toBeDefined();
    expect(eip712.message).toBeDefined();
  }, 120_000);

  // ── Encryption ─────────────────────────────────────────────

  it("encrypts a single euint64 value", async () => {
    const result = await relayer.encrypt({
      values: [{ value: 42n, type: "euint64" }],
      contractAddress: CONTRACT_ADDRESS,
      userAddress: USER_ADDRESS,
    });

    expect(result.handles).toBeDefined();
    expect(result.handles.length).toBe(1);
    expect(result.inputProof).toBeDefined();
  }, 120_000);

  it("encrypts multiple values of different types", async () => {
    const result = await relayer.encrypt({
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
    const result = await relayer.encrypt({
      values: [{ value: USER_ADDRESS, type: "eaddress" }],
      contractAddress: CONTRACT_ADDRESS,
      userAddress: USER_ADDRESS,
    });

    expect(result.handles.length).toBe(1);
    expect(result.inputProof).toBeDefined();
  }, 120_000);

  it("encrypts euint128 and euint256 values", async () => {
    const result = await relayer.encrypt({
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
});
