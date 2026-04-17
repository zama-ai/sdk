import { describe, expect, test, vi, mockQueryContext } from "../../test-fixtures";
import { getAddress, zeroAddress } from "viem";
import type { Address } from "viem";

import type { WrappersRegistry } from "../../wrappers-registry";
import {
  tokenPairsQueryOptions,
  tokenPairsLengthQueryOptions,
  tokenPairsSliceQueryOptions,
  tokenPairQueryOptions,
  confidentialTokenAddressQueryOptions,
  tokenAddressQueryOptions,
  isConfidentialTokenValidQueryOptions,
  listPairsQueryOptions,
} from "../wrappers-registry";

const REGISTRY = "0x5e5E5e5e5E5e5E5E5e5E5E5e5e5E5E5E5e5E5E5e" as Address;
const TOKEN = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as Address;
const C_TOKEN = "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B" as Address;

describe("tokenPairsQueryOptions", () => {
  test("includes registry address in query key", ({ sdk }) => {
    const options = tokenPairsQueryOptions(sdk, {
      registryAddress: REGISTRY,
    });
    expect(options.queryKey).toEqual([
      "zama.wrappersRegistry",
      { type: "tokenPairs", registryAddress: getAddress(REGISTRY) },
    ]);
    expect(options.enabled).toBe(true);
  });

  test("disabled when registryAddress is undefined", ({ sdk }) => {
    const options = tokenPairsQueryOptions(sdk, {
      registryAddress: undefined,
    });
    expect(options.enabled).toBe(false);
  });

  test("queryFn calls readContract", async ({ sdk, provider }) => {
    vi.mocked(provider.readContract).mockResolvedValue([]);
    const options = tokenPairsQueryOptions(sdk, {
      registryAddress: REGISTRY,
    });
    const result = await options.queryFn(mockQueryContext(options.queryKey));
    expect(result).toEqual([]);
    expect(provider.readContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "getTokenConfidentialTokenPairs" }),
    );
  });
});

describe("tokenPairsLengthQueryOptions", () => {
  test("includes registry address in query key", ({ sdk }) => {
    const options = tokenPairsLengthQueryOptions(sdk, {
      registryAddress: REGISTRY,
    });
    expect(options.queryKey).toEqual([
      "zama.wrappersRegistry",
      { type: "tokenPairsLength", registryAddress: getAddress(REGISTRY) },
    ]);
  });

  test("queryFn returns bigint", async ({ sdk, provider }) => {
    vi.mocked(provider.readContract).mockResolvedValue(5n);
    const options = tokenPairsLengthQueryOptions(sdk, {
      registryAddress: REGISTRY,
    });
    const result = await options.queryFn(mockQueryContext(options.queryKey));
    expect(result).toBe(5n);
  });
});

describe("tokenPairsSliceQueryOptions", () => {
  test("disabled when fromIndex or toIndex is undefined", ({ sdk }) => {
    expect(
      tokenPairsSliceQueryOptions(sdk, {
        registryAddress: REGISTRY,
        fromIndex: undefined,
        toIndex: 10n,
      }).enabled,
    ).toBe(false);

    expect(
      tokenPairsSliceQueryOptions(sdk, {
        registryAddress: REGISTRY,
        fromIndex: 0n,
        toIndex: undefined,
      }).enabled,
    ).toBe(false);
  });

  test("enabled when all params provided", ({ sdk }) => {
    const options = tokenPairsSliceQueryOptions(sdk, {
      registryAddress: REGISTRY,
      fromIndex: 0n,
      toIndex: 10n,
    });
    expect(options.enabled).toBe(true);
  });

  test("queryFn passes bigint indices", async ({ sdk, provider }) => {
    vi.mocked(provider.readContract).mockResolvedValue([]);
    const options = tokenPairsSliceQueryOptions(sdk, {
      registryAddress: REGISTRY,
      fromIndex: 5n,
      toIndex: 15n,
    });
    await options.queryFn(mockQueryContext(options.queryKey));
    expect(provider.readContract).toHaveBeenCalledWith(
      expect.objectContaining({ args: [5n, 15n] }),
    );
  });
});

describe("tokenPairQueryOptions", () => {
  test("disabled when index is undefined", ({ sdk }) => {
    expect(
      tokenPairQueryOptions(sdk, {
        registryAddress: REGISTRY,
        index: undefined,
      }).enabled,
    ).toBe(false);
  });

  test("queryFn passes bigint index", async ({ sdk, provider }) => {
    const pair = { tokenAddress: TOKEN, confidentialTokenAddress: C_TOKEN, isValid: true };
    vi.mocked(provider.readContract).mockResolvedValue(pair);
    const options = tokenPairQueryOptions(sdk, {
      registryAddress: REGISTRY,
      index: 3n,
    });
    const result = await options.queryFn(mockQueryContext(options.queryKey));
    expect(result).toEqual(pair);
  });
});

describe("confidentialTokenAddressQueryOptions", () => {
  test("disabled when tokenAddress is undefined", ({ sdk }) => {
    expect(
      confidentialTokenAddressQueryOptions(sdk, {
        registryAddress: REGISTRY,
        tokenAddress: undefined,
      }).enabled,
    ).toBe(false);
  });

  test("queryFn returns [isValid, address] tuple", async ({ sdk, provider }) => {
    vi.mocked(provider.readContract).mockResolvedValue([true, C_TOKEN]);
    const options = confidentialTokenAddressQueryOptions(sdk, {
      registryAddress: REGISTRY,
      tokenAddress: TOKEN,
    });
    const result = await options.queryFn(mockQueryContext(options.queryKey));
    expect(result).toEqual([true, C_TOKEN]);
  });
});

describe("tokenAddressQueryOptions", () => {
  test("disabled when confidentialTokenAddress is undefined", ({ sdk }) => {
    expect(
      tokenAddressQueryOptions(sdk, {
        registryAddress: REGISTRY,
        confidentialTokenAddress: undefined,
      }).enabled,
    ).toBe(false);
  });

  test("queryFn returns [isValid, address] tuple", async ({ sdk, provider }) => {
    vi.mocked(provider.readContract).mockResolvedValue([true, TOKEN]);
    const options = tokenAddressQueryOptions(sdk, {
      registryAddress: REGISTRY,
      confidentialTokenAddress: C_TOKEN,
    });
    const result = await options.queryFn(mockQueryContext(options.queryKey));
    expect(result).toEqual([true, TOKEN]);
  });
});

describe("isConfidentialTokenValidQueryOptions", () => {
  test("disabled when confidentialTokenAddress is undefined", ({ sdk }) => {
    expect(
      isConfidentialTokenValidQueryOptions(sdk, {
        registryAddress: REGISTRY,
        confidentialTokenAddress: undefined,
      }).enabled,
    ).toBe(false);
  });

  test("queryFn returns boolean", async ({ sdk, provider }) => {
    vi.mocked(provider.readContract).mockResolvedValue(true);
    const options = isConfidentialTokenValidQueryOptions(sdk, {
      registryAddress: REGISTRY,
      confidentialTokenAddress: C_TOKEN,
    });
    const result = await options.queryFn(mockQueryContext(options.queryKey));
    expect(result).toBe(true);
  });

  test("query key includes both addresses", ({ sdk }) => {
    const options = isConfidentialTokenValidQueryOptions(sdk, {
      registryAddress: REGISTRY,
      confidentialTokenAddress: C_TOKEN,
    });
    expect(options.queryKey).toEqual([
      "zama.wrappersRegistry",
      {
        type: "isConfidentialTokenValid",
        registryAddress: getAddress(REGISTRY),
        confidentialTokenAddress: getAddress(C_TOKEN),
      },
    ]);
  });
});

describe("listPairsQueryOptions", () => {
  function makeRegistry(ttlMs = 86400_000) {
    const listPairs = vi.fn();
    return { registry: { listPairs, ttlMs } as unknown as WrappersRegistry, listPairs };
  }

  test("includes registry address, page, pageSize, metadata in query key", () => {
    const { registry } = makeRegistry();
    const options = listPairsQueryOptions(registry, {
      registryAddress: REGISTRY,
      page: 2,
      pageSize: 50,
      metadata: true,
    });
    expect(options.queryKey).toEqual([
      "zama.wrappersRegistry",
      {
        type: "listPairs",
        registryAddress: getAddress(REGISTRY),
        page: 2,
        pageSize: 50,
        metadata: true,
      },
    ]);
  });

  test("staleTime equals registry.ttlMs", () => {
    const { registry } = makeRegistry(3_600_000);
    const options = listPairsQueryOptions(registry, {
      registryAddress: REGISTRY,
    });
    expect(options.staleTime).toBe(3_600_000);
  });

  test("disabled when registryAddress is undefined", () => {
    const { registry } = makeRegistry();
    const options = listPairsQueryOptions(registry, {
      registryAddress: undefined,
    });
    expect(options.enabled).toBe(false);
  });

  test("queryFn delegates to registry.listPairs with correct pagination args", async () => {
    const { registry, listPairs } = makeRegistry();
    const mockResult = { total: 1, page: 3, pageSize: 20, items: [] };
    listPairs.mockResolvedValue(mockResult);
    const options = listPairsQueryOptions(registry, {
      registryAddress: REGISTRY,
      page: 3,
      pageSize: 20,
      metadata: true,
    });
    const result = await options.queryFn(mockQueryContext(options.queryKey));
    expect(result).toEqual(mockResult);
    expect(listPairs).toHaveBeenCalledWith({ page: 3, pageSize: 20, metadata: true });
  });

  test("uses zeroAddress in query key when registryAddress is undefined", () => {
    const { registry } = makeRegistry();
    const options = listPairsQueryOptions(registry, {
      registryAddress: undefined,
    });
    expect(options.queryKey[1]).toMatchObject({ registryAddress: zeroAddress });
  });
});
