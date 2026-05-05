/**
 * Scenario: Token.supportsTransferAndCall() detects ERC-1363 support on-chain
 * using ERC-165 supportsInterface. Verifies detection works correctly against
 * both ERC-1363 tokens (TestERC1363) and standard ERC-20s (TestERC20).
 *
 * These tests validate the SDK's on-chain detection path end-to-end against
 * real contracts on Anvil — the unit tests cover routing logic with mocks.
 */
import { Token } from "@zama-fhe/sdk";
import { expect, nodeTest as test } from "../../fixtures/node-test";

test("detects ERC-1363 support on a token that implements it", async ({ sdk, contracts }) => {
  const token = sdk.createToken(contracts.cERC1363);
  const supported = await token.supportsTransferAndCall();
  expect(supported).toBe(true);
});

test("detects lack of ERC-1363 support on a standard ERC-20", async ({ sdk, contracts }) => {
  const token = sdk.createToken(contracts.cUSDT);
  const supported = await token.supportsTransferAndCall();
  expect(supported).toBe(false);
});

test("caches detection result across multiple calls", async ({ sdk, contracts }) => {
  const token = sdk.createToken(contracts.cERC1363);

  const first = await token.supportsTransferAndCall();
  const second = await token.supportsTransferAndCall();

  expect(first).toBe(true);
  expect(second).toBe(true);
  // Both should return the same cached result
  expect(first).toBe(second);
});

test("detection works on a token where underlying has no ERC-165 (ACL address)", async ({
  sdk,
  contracts,
}) => {
  // ACL is not an ERC-20 at all — supportsInterface should revert/return false gracefully
  const token = new Token(sdk, contracts.acl);
  const supported = await token.supportsTransferAndCall();
  expect(supported).toBe(false);
});
