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
  await page.goto(
    `/wrapper-discovery?tokenAddress=${contracts.cUSDT}&erc20Address=${underlyingAddress}`,
  );

  await expect(page.getByTestId("wrapper-discovery-result")).toContainText(contracts.cUSDT, {
    ignoreCase: true,
  });
});
