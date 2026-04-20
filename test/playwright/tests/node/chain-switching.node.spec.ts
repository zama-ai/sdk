/**
 * Scenario: A RelayerNode initializes with its chain config and resolves
 * the correct ACL address. Chain switching across multiple RelayerNode
 * instances is handled by CompositeRelayer (unit-tested separately).
 */
import { nodeTest as test, expect } from "../../fixtures/node-test";

test("RelayerNode resolves correct ACL address from chain config", async ({
  relayer,
  contracts,
}) => {
  expect(await relayer.getAclAddress()).toBe(contracts.acl);
});

test("RelayerNode generates a valid keypair", async ({ relayer }) => {
  const kp = await relayer.generateKeypair();
  expect(kp.publicKey).toMatch(/^0x[0-9a-fA-F]+$/);
});
