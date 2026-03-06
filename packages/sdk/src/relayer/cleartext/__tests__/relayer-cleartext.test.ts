import { describe, expect, it } from "vitest";
import { RelayerCleartext } from "../relayer-cleartext";
import type { CleartextInstanceConfig } from "../types";
import { GATEWAY_CHAIN_ID, VERIFYING_CONTRACTS } from "../constants";
import { TEST_FHEVM_ADDRESSES } from "./fixtures";

const baseCleartextConfig: CleartextInstanceConfig = {
  network: "http://127.0.0.1:8545",
  chainId: 31_337,
  gatewayChainId: GATEWAY_CHAIN_ID,
  aclContractAddress: TEST_FHEVM_ADDRESSES.acl,
  kmsContractAddress: TEST_FHEVM_ADDRESSES.kmsVerifier,
  inputVerifierContractAddress: TEST_FHEVM_ADDRESSES.inputVerifier,
  verifyingContractAddressDecryption: VERIFYING_CONTRACTS.decryption,
  verifyingContractAddressInputVerification: VERIFYING_CONTRACTS.inputVerification,
  cleartextExecutorAddress: TEST_FHEVM_ADDRESSES.executor,
};

describe("RelayerCleartext", () => {
  it("constructs with single-transport config", () => {
    const relayer = new RelayerCleartext(baseCleartextConfig);
    expect(relayer).toBeDefined();
    relayer.terminate();
  });

  it("constructs with multi-transport config", () => {
    const relayer = new RelayerCleartext({
      transports: { [31_337]: baseCleartextConfig },
      getChainId: async () => 31_337,
    });
    expect(relayer).toBeDefined();
    relayer.terminate();
  });

  it("delegates generateKeypair to underlying instance", async () => {
    const relayer = new RelayerCleartext(baseCleartextConfig);
    const keypair = await relayer.generateKeypair();
    expect(keypair.publicKey).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(keypair.privateKey).toMatch(/^0x[0-9a-fA-F]{64}$/);
    relayer.terminate();
  });

  it("terminate and auto-restart on next operation", async () => {
    const relayer = new RelayerCleartext(baseCleartextConfig);

    // First use initializes
    const kp1 = await relayer.generateKeypair();
    expect(kp1.publicKey).toBeTruthy();

    // Terminate
    relayer.terminate();

    // Auto-restarts on next call
    const kp2 = await relayer.generateKeypair();
    expect(kp2.publicKey).toBeTruthy();

    relayer.terminate();
  });

  it("rejects mainnet chain ID", async () => {
    const relayer = new RelayerCleartext({ ...baseCleartextConfig, chainId: 1 });
    await expect(relayer.generateKeypair()).rejects.toThrow(/not allowed on chain 1/);
  });

  it("rejects sepolia chain ID", async () => {
    const relayer = new RelayerCleartext({ ...baseCleartextConfig, chainId: 11155111 });
    await expect(relayer.generateKeypair()).rejects.toThrow(/not allowed on chain 11155111/);
  });

  it("multi-transport throws when chain ID has no config", async () => {
    const relayer = new RelayerCleartext({
      transports: { [31_337]: baseCleartextConfig },
      getChainId: async () => 99999,
    });
    await expect(relayer.generateKeypair()).rejects.toThrow(/No cleartext config for chainId/);
    relayer.terminate();
  });

  it("multi-transport switches chain", async () => {
    let chainId = 31_337;
    const relayer = new RelayerCleartext({
      transports: {
        [31_337]: baseCleartextConfig,
        [31_338]: { ...baseCleartextConfig, chainId: 31_338 },
      },
      getChainId: async () => chainId,
    });

    // First chain
    const kp1 = await relayer.generateKeypair();
    expect(kp1.publicKey).toBeTruthy();

    // Switch chain
    chainId = 31_338;
    const kp2 = await relayer.generateKeypair();
    expect(kp2.publicKey).toBeTruthy();

    relayer.terminate();
  });

  it("getPublicKey returns null", async () => {
    const relayer = new RelayerCleartext(baseCleartextConfig);
    await expect(relayer.getPublicKey()).resolves.toBeNull();
    relayer.terminate();
  });

  it("getPublicParams returns null", async () => {
    const relayer = new RelayerCleartext(baseCleartextConfig);
    await expect(relayer.getPublicParams(2048)).resolves.toBeNull();
    relayer.terminate();
  });
});
