import { test, expect } from "../fixtures";

test("should discover wrapper via registry", async ({ page, contracts, viemClient }) => {
  const underlyingAbi = [
    {
      type: "function",
      name: "underlying",
      inputs: [],
      outputs: [{ type: "address" }],
      stateMutability: "view",
    },
  ] as const;

  // Read the actual underlying ERC20 address from the confidential wrapper contract
  const underlyingAddress = await viemClient.readContract({
    address: contracts.cUSDT,
    abi: underlyingAbi,
    functionName: "underlying",
  });

  // tokenAddress = the confidential wrapper (provides the signer context)
  // erc20Address = the underlying ERC-20 to look up in the registry
  // wrappersRegistryAddress = local test registry (chain 31337 has no default)
  await page.goto(
    `/wrapper-discovery?tokenAddress=${contracts.cUSDT}&erc20Address=${underlyingAddress}&wrappersRegistryAddress=${contracts.wrappersRegistry}`,
  );

  await expect(page.getByTestId("wrapper-discovery-result")).toContainText(contracts.cUSDT, {
    ignoreCase: true,
  });
});
