/**
 * Scenario: A FhevmRelayer initializes with its chain config and resolves the
 * correct ACL address. Chain switching across multiple relayers is handled by
 * the RelayerDispatcher (unit-tested separately).
 */
import { nodeTest as test, expect } from "../../fixtures/node-test";

test("FhevmRelayer resolves correct ACL address from chain config", async ({ sdk, contracts }) => {
  expect(await sdk.relayer.getAclAddress()).toBe(contracts.acl);
});

test("FhevmRelayer generates a valid keypair", async ({ sdk }) => {
  const kp = await sdk.relayer.generateTransportKeyPair();
  expect(kp.publicKey).toMatch(/^0x[0-9a-fA-F]+$/);
});
