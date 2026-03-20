import { nodeTest as test, expect } from "../../fixtures/node-test";
import type { Address } from "viem";

test.describe("ReadonlyToken.discoverWrapper — on-chain wrapper discovery", () => {
  test("discovers wrapper via coordinator", async ({ sdk, contracts, viemClient }) => {
    const coordAbi = [
      {
        type: "function" as const,
        name: "deploymentCoordinator" as const,
        inputs: [],
        outputs: [{ type: "address" }],
        stateMutability: "view" as const,
      },
    ] as const;
    const underlyingAbi = [
      {
        type: "function" as const,
        name: "underlying" as const,
        inputs: [],
        outputs: [{ type: "address" }],
        stateMutability: "view" as const,
      },
    ] as const;

    // Read the coordinator address from the cUSDT wrapper contract
    const coordinatorAddress = await viemClient.readContract({
      address: contracts.cUSDT as Address,
      abi: coordAbi,
      functionName: "deploymentCoordinator",
    });

    // Read the actual underlying ERC-20 address
    const underlyingAddress = await viemClient.readContract({
      address: contracts.cUSDT as Address,
      abi: underlyingAbi,
      functionName: "underlying",
    });

    // Discover wrapper via the SDK
    const token = sdk.createReadonlyToken(underlyingAddress as Address);
    const wrapper = await token.discoverWrapper(coordinatorAddress as Address);

    expect(wrapper).not.toBeNull();
    expect(wrapper!.toLowerCase()).toBe((contracts.cUSDT as string).toLowerCase());
  });
});
