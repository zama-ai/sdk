/**
 * Scenario: A multi-chain backend switches between chains and the SDK
 * re-initializes the worker pool and resolves the correct config.
 */
import { nodeTest as test, expect } from "../../fixtures/node-test";
import { RelayerNode } from "@zama-fhe/sdk/node";
import { HardhatConfig } from "@zama-fhe/sdk";
import type { Address } from "viem";

test("pool re-initializes when chain ID changes", async ({ anvilPort }) => {
  let chainId: number = HardhatConfig.chainId;

  using relayer = new RelayerNode({
    getChainId: async () => chainId,
    transports: {
      [HardhatConfig.chainId]: {
        ...HardhatConfig,
        network: `http://127.0.0.1:${anvilPort}`,
      },
      [99999]: {
        ...HardhatConfig,
        network: `http://127.0.0.1:${anvilPort}`,
      },
    },
    poolSize: 1,
  });

  // Generate on chain 31337
  const kp1 = await relayer.generateKeypair();
  expect(kp1.publicKey).toMatch(/^0x[0-9a-fA-F]+$/);

  // Switch chain → pool tears down and re-inits
  chainId = 99999;
  const kp2 = await relayer.generateKeypair();
  expect(kp2.publicKey).toMatch(/^0x[0-9a-fA-F]+$/);
  expect(kp1.publicKey).not.toBe(kp2.publicKey);
});

test("getAclAddress reflects current chain config after switch", async ({
  anvilPort,
  contracts,
}) => {
  let chainId: number = HardhatConfig.chainId;
  const altAcl = "0x1234567890abcdef1234567890abcdef12345678" as Address;

  using relayer = new RelayerNode({
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

  expect(await relayer.getAclAddress()).toBe(contracts.acl);

  chainId = 99999;
  expect(await relayer.getAclAddress()).toBe(altAcl);
});
