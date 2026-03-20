import { nodeTest as test, expect } from "../../fixtures/node-test";
import { RelayerNode } from "@zama-fhe/sdk/node";
import { HardhatConfig } from "@zama-fhe/sdk";
import type { Address } from "viem";

test.describe("RelayerNode — local operations", () => {
  test("returns ACL contract address", async ({ relayer, contracts }) => {
    const aclAddress = await relayer.getAclAddress();
    expect(aclAddress).toBe(contracts.acl);
  });

  test("throws after terminate", async ({ relayer }) => {
    relayer.terminate();
    await expect(relayer.generateKeypair()).rejects.toThrow("terminated");
  });
});

test.describe("RelayerNode — FHE operations (mock worker)", () => {
  test("generates a keypair", async ({ relayer }) => {
    const keypair = await relayer.generateKeypair();
    expect(keypair.publicKey).toMatch(/^0x[0-9a-fA-F]+$/);
    expect(keypair.privateKey).toMatch(/^0x[0-9a-fA-F]+$/);
    expect(keypair.publicKey).not.toBe(keypair.privateKey);
  });

  test("creates EIP-712 typed data for user decrypt", async ({ relayer, contracts }) => {
    const keypair = await relayer.generateKeypair();
    const eip712 = await relayer.createEIP712(
      keypair.publicKey,
      [contracts.cUSDT],
      Math.floor(Date.now() / 1000),
      7,
    );
    expect(eip712.domain).toBeDefined();
    expect(eip712.domain.chainId).toBe(31337);
    expect(eip712.types.UserDecryptRequestVerification).toBeDefined();
    expect(eip712.message.publicKey).toBe(keypair.publicKey);
    expect(eip712.message.contractAddresses).toContain(contracts.cUSDT);
  });

  test("creates delegated user decrypt EIP-712", async ({ relayer, contracts }) => {
    const keypair = await relayer.generateKeypair();
    const delegatorAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address;
    const eip712 = await relayer.createDelegatedUserDecryptEIP712(
      keypair.publicKey,
      [contracts.cUSDT],
      delegatorAddress,
      Math.floor(Date.now() / 1000),
      7,
    );
    expect(eip712.domain).toBeDefined();
    expect(eip712.types).toBeDefined();
    expect(eip712.primaryType).toBe("DelegatedUserDecryptRequestVerification");
    expect(eip712.message.delegatorAddress.toLowerCase()).toBe(delegatorAddress.toLowerCase());
  });

  test("gets public key", async ({ relayer }) => {
    const result = await relayer.getPublicKey();
    expect(result).not.toBeNull();
    expect(result!.publicKeyId).toBe("mock-public-key-id");
  });

  test("gets public params", async ({ relayer }) => {
    const result = await relayer.getPublicParams(2048);
    expect(result).not.toBeNull();
    expect(result!.publicParamsId).toBe("mock-public-params-id");
  });

  // NOTE: encrypt, userDecrypt, and publicDecrypt require the full MockCoprocessor
  // stack (fhevm_relayer_v1_input_proof RPC method, FhevmDB, coprocessor signers).
  // This is provided by the @fhevm/hardhat-plugin but not yet ported to anvil.
  // These operations are covered by the browser e2e tests.
});

test.describe("RelayerNode — chain switching", () => {
  test("re-initializes pool when chain ID changes", async ({ anvilPort }) => {
    let chainId: number = HardhatConfig.chainId;

    const relayer = new RelayerNode({
      getChainId: async () => chainId,
      transports: {
        [HardhatConfig.chainId]: {
          ...HardhatConfig,
          network: `http://127.0.0.1:${anvilPort}`,
        },
        // Second chain config pointing to the same anvil (just different chain ID key)
        [99999]: {
          ...HardhatConfig,
          network: `http://127.0.0.1:${anvilPort}`,
        },
      },
      poolSize: 1,
    });

    try {
      // Generate keypair on chain 31337
      const kp1 = await relayer.generateKeypair();
      expect(kp1.publicKey).toMatch(/^0x[0-9a-fA-F]+$/);

      // Switch chain — the pool should tear down and re-init
      chainId = 99999;

      // Generate keypair on "new chain" — triggers pool re-initialization
      const kp2 = await relayer.generateKeypair();
      expect(kp2.publicKey).toMatch(/^0x[0-9a-fA-F]+$/);

      // Both keypairs should work (pool re-inited successfully)
      expect(kp1.publicKey).not.toBe(kp2.publicKey);
    } finally {
      relayer.terminate();
    }
  });

  test("getAclAddress reflects current chain config", async ({ anvilPort, contracts }) => {
    let chainId: number = HardhatConfig.chainId;
    const altAcl = "0x1234567890abcdef1234567890abcdef12345678" as Address;

    const relayer = new RelayerNode({
      getChainId: async () => chainId,
      transports: {
        [HardhatConfig.chainId]: {
          ...HardhatConfig,
          network: `http://127.0.0.1:${anvilPort}`,
        },
        [99999]: {
          ...HardhatConfig,
          aclContractAddress: altAcl,
          network: `http://127.0.0.1:${anvilPort}`,
        },
      },
      poolSize: 1,
    });

    try {
      // Chain 31337 → hardhat ACL
      const acl1 = await relayer.getAclAddress();
      expect(acl1).toBe(contracts.acl);

      // Switch to chain 99999 → alt ACL
      chainId = 99999;
      const acl2 = await relayer.getAclAddress();
      expect(acl2).toBe(altAcl);
    } finally {
      relayer.terminate();
    }
  });
});
