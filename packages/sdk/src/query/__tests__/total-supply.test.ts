import { describe, expect, test, vi, mockQueryContext } from "../../test-fixtures";
import { ERC7984_WRAPPER_INTERFACE_ID, ERC7984_WRAPPER_INTERFACE_ID_LEGACY } from "../../contracts";
import { ConfigurationError } from "../../errors";
import { totalSupplyQueryOptions } from "../total-supply";
import type { Address } from "viem";

const WRAPPER = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as Address;

type ReadContractConfig = {
  functionName: string;
  args?: readonly unknown[];
};

function mockReadContract({
  supportsUpgraded,
  supportsLegacy,
  supply,
}: {
  supportsUpgraded: boolean;
  supportsLegacy: boolean;
  supply: bigint;
}) {
  return vi.fn(async (config: ReadContractConfig) => {
    if (config.functionName === "supportsInterface") {
      if (config.args?.[0] === ERC7984_WRAPPER_INTERFACE_ID) {
        return supportsUpgraded;
      }
      if (config.args?.[0] === ERC7984_WRAPPER_INTERFACE_ID_LEGACY) {
        return supportsLegacy;
      }
      return false;
    }
    return supply;
  });
}

describe("totalSupplyQueryOptions", () => {
  test("uses inferredTotalSupply for upgraded wrappers", async ({ signer }) => {
    vi.mocked(signer.readContract).mockImplementation(
      mockReadContract({ supportsUpgraded: true, supportsLegacy: false, supply: 42n }),
    );

    const options = totalSupplyQueryOptions(signer, WRAPPER);
    const value = await options.queryFn(mockQueryContext(options.queryKey));

    expect(value).toBe(42n);
    expect(options.staleTime).toBe(30_000);
    expect(signer.readContract).toHaveBeenLastCalledWith(
      expect.objectContaining({ functionName: "inferredTotalSupply", address: WRAPPER }),
    );
  });

  test("uses legacy totalSupply for legacy wrappers", async ({ signer }) => {
    vi.mocked(signer.readContract).mockImplementation(
      mockReadContract({ supportsUpgraded: false, supportsLegacy: true, supply: 24n }),
    );

    const options = totalSupplyQueryOptions(signer, WRAPPER);
    const value = await options.queryFn(mockQueryContext(options.queryKey));

    expect(value).toBe(24n);
    expect(signer.readContract).toHaveBeenLastCalledWith(
      expect.objectContaining({ functionName: "totalSupply", address: WRAPPER }),
    );
  });

  test("prefers upgraded interface when both interface IDs match", async ({ signer }) => {
    vi.mocked(signer.readContract).mockImplementation(
      mockReadContract({ supportsUpgraded: true, supportsLegacy: true, supply: 99n }),
    );

    const options = totalSupplyQueryOptions(signer, WRAPPER);
    await options.queryFn(mockQueryContext(options.queryKey));

    expect(signer.readContract).toHaveBeenLastCalledWith(
      expect.objectContaining({ functionName: "inferredTotalSupply", address: WRAPPER }),
    );
  });

  test("throws ConfigurationError for unsupported wrappers", async ({ signer }) => {
    vi.mocked(signer.readContract).mockImplementation(
      mockReadContract({ supportsUpgraded: false, supportsLegacy: false, supply: 0n }),
    );

    const options = totalSupplyQueryOptions(signer, WRAPPER);

    await expect(options.queryFn(mockQueryContext(options.queryKey))).rejects.toThrow(
      ConfigurationError,
    );
  });

  test("treats ERC-165 contract call reverts as unsupported interface IDs", async ({ signer }) => {
    const revert = Object.assign(new Error("execution reverted"), {
      name: "ContractFunctionExecutionError",
    });
    vi.mocked(signer.readContract).mockImplementation(async (config: ReadContractConfig) => {
      if (config.functionName === "supportsInterface") {
        throw revert;
      }
      return 0n;
    });

    const options = totalSupplyQueryOptions(signer, WRAPPER);

    await expect(options.queryFn(mockQueryContext(options.queryKey))).rejects.toThrow(
      ConfigurationError,
    );
  });

  test("propagates network errors from ERC-165 checks", async ({ signer }) => {
    vi.mocked(signer.readContract).mockImplementation(async (config: ReadContractConfig) => {
      if (config.functionName === "supportsInterface") {
        throw new Error("network error");
      }
      return 0n;
    });

    const options = totalSupplyQueryOptions(signer, WRAPPER);

    await expect(options.queryFn(mockQueryContext(options.queryKey))).rejects.toThrow(
      "network error",
    );
  });
});
