import { describe, expect, test, vi, mockQueryContext } from "../../test-fixtures";
import { WrappersRegistry } from "../../wrappers-registry";
import { wrapperDiscoveryQueryOptions } from "../wrapper-discovery";

describe("wrapperDiscoveryQueryOptions", () => {
  test("is disabled when tokenAddress or erc20Address is missing", ({ provider }) => {
    const registry = new WrappersRegistry({ provider });
    const missingToken = wrapperDiscoveryQueryOptions(registry, {
      erc20Address: "0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C",
    });
    const missingErc20 = wrapperDiscoveryQueryOptions(registry, {
      tokenAddress: "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a",
    });

    expect(missingToken.enabled).toBe(false);
    expect(missingErc20.enabled).toBe(false);
  });

  test("staleTime is Infinity — wrapper mappings are immutable", ({ provider }) => {
    const registry = new WrappersRegistry({ provider });
    const options = wrapperDiscoveryQueryOptions(registry, {
      tokenAddress: "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a",
      erc20Address: "0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C",
    });
    expect(options.staleTime).toBe(Infinity);
  });

  test("includes erc20Address in query key", ({ provider }) => {
    const registry = new WrappersRegistry({ provider });
    const options = wrapperDiscoveryQueryOptions(registry, {
      tokenAddress: "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a",
      erc20Address: "0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C",
    });

    expect(options.queryKey).toEqual([
      "zama.wrapperDiscovery",
      {
        tokenAddress: "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a",
        erc20Address: "0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C",
      },
    ]);
  });

  test("returns null when no wrapper exists", async ({ provider, signer }) => {
    // Mock chainId to Mainnet (has default registry)
    vi.mocked(signer.getChainId).mockResolvedValue(1);
    vi.mocked(signer.readContract).mockResolvedValueOnce([
      false,
      "0x0000000000000000000000000000000000000000",
    ]);

    const registry = new WrappersRegistry({ provider });
    const options = wrapperDiscoveryQueryOptions(registry, {
      tokenAddress: "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a",
      erc20Address: "0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C",
    });

    const wrapper = await options.queryFn(mockQueryContext(options.queryKey));
    expect(wrapper).toBeNull();
  });

  test("returns wrapper address when it exists", async ({ provider, signer }) => {
    vi.mocked(signer.getChainId).mockResolvedValue(1);
    vi.mocked(signer.readContract)
      .mockResolvedValueOnce([true, "0x4D4d4D4d4d4D4D4d4D4D4D4d4d4d4d4D4D4d4d4D"]) // getConfidentialTokenAddress
      .mockResolvedValueOnce(true); // isConfidentialTokenValid

    const registry = new WrappersRegistry({ provider });
    const options = wrapperDiscoveryQueryOptions(registry, {
      tokenAddress: "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a",
      erc20Address: "0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C",
    });

    const wrapper = await options.queryFn(mockQueryContext(options.queryKey));
    expect(wrapper).toBe("0x4D4d4D4d4d4D4D4d4D4D4D4d4d4d4d4D4D4d4d4D");
  });
});
