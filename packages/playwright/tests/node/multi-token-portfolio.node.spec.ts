/**
 * Scenario: A DeFi dashboard manages a portfolio of confidential tokens —
 * shield multiple tokens, query metadata, discover wrappers, approve, and
 * verify on-chain state.
 */
import { nodeTest as test, expect } from "../../fixtures/node-test";
import type { Address } from "viem";

test("shield both tokens → query metadata → discover wrappers → check handles", async ({
  sdk,
  contracts,
  viemClient,
  readErc20Balance,
}) => {
  // Shield both tokens
  const tokenUSDT = sdk.createToken(contracts.USDT, contracts.cUSDT as Address);
  const tokenUSDC = sdk.createToken(contracts.USDC, contracts.cUSDC as Address);
  const usdtBefore = await readErc20Balance(contracts.USDT);
  const usdcBefore = await readErc20Balance(contracts.USDC);

  await tokenUSDT.shield(100n * 10n ** 6n);
  await tokenUSDC.shield(200n * 10n ** 6n);

  expect(await readErc20Balance(contracts.USDT)).toBe(usdtBefore - 100n * 10n ** 6n);
  expect(await readErc20Balance(contracts.USDC)).toBe(usdcBefore - 200n * 10n ** 6n);

  // Query wrapper metadata
  const readUSDT = sdk.createReadonlyToken(contracts.cUSDT as Address);
  const readUSDC = sdk.createReadonlyToken(contracts.cUSDC as Address);
  expect(await readUSDT.isConfidential()).toBe(true);
  expect(await readUSDC.isConfidential()).toBe(true);
  expect(await readUSDT.isWrapper()).toBe(true);
  expect(await readUSDC.isWrapper()).toBe(true);
  expect(await readUSDT.decimals()).toBe(6);
  expect(await readUSDC.decimals()).toBe(6);
  expect(await readUSDT.name()).toBe("Confidential Tether USD");
  expect(await readUSDC.name()).toBe("Confidential ERC20 Token");
  expect(await readUSDT.symbol()).toBe("cUSDT");
  expect(await readUSDC.symbol()).toBe("cERC20");

  // Verify underlying tokens
  expect((await readUSDT.underlyingToken()).toLowerCase()).toBe(contracts.USDT.toLowerCase());
  expect((await readUSDC.underlyingToken()).toLowerCase()).toBe(contracts.USDC.toLowerCase());

  // Discover wrapper via coordinator
  const coordAbi = [
    {
      type: "function" as const,
      name: "deploymentCoordinator" as const,
      inputs: [],
      outputs: [{ type: "address" }],
      stateMutability: "view" as const,
    },
  ] as const;
  const coordinator = await viemClient.readContract({
    address: contracts.cUSDT as Address,
    abi: coordAbi,
    functionName: "deploymentCoordinator",
  });
  const underlyingAddr = await readUSDT.underlyingToken();
  const readUnderlying = sdk.createReadonlyToken(underlyingAddr as Address);
  const discoveredWrapper = await readUnderlying.discoverWrapper(coordinator as Address);
  expect(discoveredWrapper?.toLowerCase()).toBe((contracts.cUSDT as string).toLowerCase());

  // Both have non-zero confidential handles
  expect(await readUSDT.confidentialBalanceOf()).not.toBe("0x" + "0".repeat(64));
  expect(await readUSDC.confidentialBalanceOf()).not.toBe("0x" + "0".repeat(64));
});

test("approveUnderlying → verify allowance → shield within allowance", async ({
  sdk,
  contracts,
  readErc20Balance,
}) => {
  const tokenUSDT = sdk.createToken(contracts.USDT, contracts.cUSDT as Address);
  const tokenUSDC = sdk.createToken(contracts.USDC, contracts.cUSDC as Address);

  // Explicit approval
  await tokenUSDT.approveUnderlying(500n * 10n ** 6n);
  await tokenUSDC.approveUnderlying(500n * 10n ** 6n);

  // Verify allowance via ReadonlyToken
  const readUSDT = sdk.createReadonlyToken(contracts.USDT);
  const readUSDC = sdk.createReadonlyToken(contracts.USDC);
  expect(await readUSDT.allowance(contracts.cUSDT as Address)).toBe(500n * 10n ** 6n);
  expect(await readUSDC.allowance(contracts.cUSDC as Address)).toBe(500n * 10n ** 6n);

  // Shield within approved amount
  const before = await readErc20Balance(contracts.USDT);
  await tokenUSDT.shield(100n * 10n ** 6n);
  expect(await readErc20Balance(contracts.USDT)).toBe(before - 100n * 10n ** 6n);
});
