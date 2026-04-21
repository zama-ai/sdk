/**
 * Scenario: A multi-chain backend switches between chains and the SDK
 * re-initializes the worker pool and resolves the correct config.
 */
import { nodeTest as test, expect } from "../../fixtures/node-test";
import { RelayerNode } from "@zama-fhe/sdk/node";
import { HardhatConfig } from "@zama-fhe/sdk";
import type { Address } from "@zama-fhe/sdk";

test("pool re-initializes when chain ID changes", async ({ transport, contracts }) => {
  let chainId: number = HardhatConfig.chainId;
  const altAcl = "0x1234567890abcdef1234567890abcdef12345678" as Address;

  using relayer = new RelayerNode({
    getChainId: async () => chainId,
    transports: {
      [HardhatConfig.chainId]: transport,
      [99999]: {
        ...transport,
        aclContractAddress: altAcl,
      },
    },
    poolSize: 1,
  });

  // Verify pool initialized with chain 31337 config
  const kp1 = await relayer.generateKeypair();
  expect(kp1.publicKey).toMatch(/^0x[0-9a-fA-F]+$/);
  expect(await relayer.getAclAddress()).toBe(contracts.acl);

  // Switch chain → pool tears down and re-inits with new config
  chainId = 99999;
  const kp2 = await relayer.generateKeypair();
  expect(kp2.publicKey).toMatch(/^0x[0-9a-fA-F]+$/);
  expect(await relayer.getAclAddress()).toBe(altAcl);
});

test("getAclAddress reflects current chain config after switch", async ({
  transport,
  contracts,
}) => {
  let chainId: number = HardhatConfig.chainId;
  const altAcl = "0x1234567890abcdef1234567890abcdef12345678" as Address;

  using relayer = new RelayerNode({
    getChainId: async () => chainId,
    transports: {
      [HardhatConfig.chainId]: transport,
      [99999]: {
        ...transport,
        aclContractAddress: altAcl,
      },
    },
    poolSize: 1,
  });

  expect(await relayer.getAclAddress()).toBe(contracts.acl);

  chainId = 99999;
  expect(await relayer.getAclAddress()).toBe(altAcl);
});
