/**
 * Scenarios:
 *
 *  1. `WrappedToken.isPayable()` detects ERC-1363 support on-chain via ERC-165
 *     `supportsInterface`. Verified against an ERC-1363 token (TestERC1363),
 *     a standard ERC-20 (TestERC20), and a non-ERC-20 contract (ACL).
 *
 *  2. `WrappedToken.shield()` routes correctly based on detection: the wrapper
 *     whose underlying implements ERC-1363 completes shielding in a single
 *     `transferAndCall` transaction, while a plain ERC-20 wrapper still
 *     uses `approve` + `wrap` (two transactions).
 *
 * The detection tests validate the SDK's on-chain detection path against
 * real contracts on Anvil; the routing tests verify the user-visible
 * promise of SDK-145 — single-tx shield for 1363 tokens — end-to-end.
 * The unit tests cover detection and routing logic with mocks.
 */
import { WrappedToken } from "@zama-fhe/sdk";
import { expect, nodeTest as test } from "../../fixtures/node-test";

const SHIELD_AMOUNT = 100n * 1_000_000n; // 100 tokens at 6 decimals

const erc20BalanceOfAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

test("detects ERC-1363 support on a token that implements it", async ({ sdk, contracts }) => {
  const token = sdk.createWrappedToken(contracts.cERC1363);
  const supported = await token.isPayable();
  expect(supported).toBe(true);
});

test("detects lack of ERC-1363 support on a standard ERC-20", async ({ sdk, contracts }) => {
  const token = sdk.createWrappedToken(contracts.cUSDT);
  const supported = await token.isPayable();
  expect(supported).toBe(false);
});

test("detection works on a token where underlying has no ERC-165 (ACL address)", async ({
  sdk,
  contracts,
}) => {
  // ACL is not an ERC-20 at all — supportsInterface should revert/return false gracefully
  const token = new WrappedToken(sdk, contracts.acl);
  const supported = await token.isPayable();
  expect(supported).toBe(false);
});

test("shield routes via transferAndCall on a 1363 token (single transaction)", async ({
  sdk,
  contracts,
  account,
  viemClient,
}) => {
  const token = sdk.createWrappedToken(contracts.cERC1363);

  const erc20Before = await viemClient.readContract({
    address: contracts.ERC1363,
    abi: erc20BalanceOfAbi,
    functionName: "balanceOf",
    args: [account.address],
  });
  const nonceBefore = await viemClient.getTransactionCount({ address: account.address });

  // shield() throws on revert, so reaching this line means the tx mined.
  await token.shield(SHIELD_AMOUNT);

  const nonceAfter = await viemClient.getTransactionCount({ address: account.address });
  // transferAndCall path: a single signed transaction — no separate approve.
  expect(nonceAfter - nonceBefore).toBe(1);

  const erc20After = await viemClient.readContract({
    address: contracts.ERC1363,
    abi: erc20BalanceOfAbi,
    functionName: "balanceOf",
    args: [account.address],
  });
  expect(erc20Before - erc20After).toBe(SHIELD_AMOUNT);
});

test("shield-to-other via transferAndCall encodes recipient and succeeds", async ({
  sdk,
  contracts,
  account,
  viemClient,
}) => {
  const token = sdk.createWrappedToken(contracts.cERC1363);
  // Anvil default account #1 — distinct from the sender (account #0).
  const recipient = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

  const erc20Before = await viemClient.readContract({
    address: contracts.ERC1363,
    abi: erc20BalanceOfAbi,
    functionName: "balanceOf",
    args: [account.address],
  });
  const nonceBefore = await viemClient.getTransactionCount({ address: account.address });

  // The wrapper decodes the recipient via `address(bytes20(data))` — this
  // exercises that the SDK's raw 20-byte encoding is accepted on-chain.
  await token.shield(SHIELD_AMOUNT, { to: recipient });

  const nonceAfter = await viemClient.getTransactionCount({ address: account.address });
  expect(nonceAfter - nonceBefore).toBe(1);

  const erc20After = await viemClient.readContract({
    address: contracts.ERC1363,
    abi: erc20BalanceOfAbi,
    functionName: "balanceOf",
    args: [account.address],
  });
  expect(erc20Before - erc20After).toBe(SHIELD_AMOUNT);
});

test("shield routes via approve + wrap on a non-1363 token (two transactions)", async ({
  sdk,
  contracts,
  account,
  viemClient,
}) => {
  const token = sdk.createWrappedToken(contracts.cUSDT);

  const nonceBefore = await viemClient.getTransactionCount({ address: account.address });

  await token.shield(SHIELD_AMOUNT);

  const nonceAfter = await viemClient.getTransactionCount({ address: account.address });
  // Default `approvalStrategy: "exact"` on a non-1363 token: approve + wrap.
  expect(nonceAfter - nonceBefore).toBe(2);
});
