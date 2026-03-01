import { test, expect } from "../fixtures/test";

test("should discover wrapper via coordinator", async ({ page, contracts, viemClient }) => {
  const coordAbi = [
    {
      type: "function",
      name: "deploymentCoordinator",
      inputs: [],
      outputs: [{ type: "address" }],
      stateMutability: "view",
    },
  ] as const;
  const underlyingAbi = [
    {
      type: "function",
      name: "underlying",
      inputs: [],
      outputs: [{ type: "address" }],
      stateMutability: "view",
    },
  ] as const;

  // Read the coordinator address from the cUSDT contract
  const coordinatorAddress = await viemClient.readContract({
    address: contracts.cUSDT as `0x${string}`,
    abi: coordAbi,
    functionName: "deploymentCoordinator",
  });

  // Read the actual underlying ERC20 address from the wrapper contract
  // (contracts.USDT from fixtures may differ from what the coordinator registered)
  const underlyingAddress = await viemClient.readContract({
    address: contracts.cUSDT as `0x${string}`,
    abi: underlyingAbi,
    functionName: "underlying",
  });

  await page.goto(
    `/wrapper-discovery?token=${underlyingAddress}&coordinator=${coordinatorAddress}`,
  );

  await expect(page.getByTestId("wrapper-discovery-result")).toContainText(contracts.cUSDT, {
    ignoreCase: true,
  });
});
