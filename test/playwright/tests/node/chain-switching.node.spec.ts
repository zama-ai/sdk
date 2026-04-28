/**
 * Scenario: A RelayerNode initializes with its chain config and resolves
 * the correct ACL address. Chain switching across multiple RelayerNode
 * instances is handled by CompositeRelayer (unit-tested separately).
 */
import { nodeTest as test, expect } from "../../fixtures/node-test";

test("RelayerNode resolves correct ACL address from chain config", async ({ sdk, contracts }) => {
  expect(await sdk.relayer.getAclAddress()).toBe(contracts.acl);
});

test("RelayerNode generates a valid keypair", async ({ sdk }) => {
  const kp = await sdk.relayer.generateKeypair();
  expect(kp.publicKey).toMatch(/^0x[0-9a-fA-F]+$/);
});
