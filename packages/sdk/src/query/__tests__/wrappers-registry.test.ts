import { describe, expect, test, vi, mockQueryContext } from "../../test-fixtures";
import { getAddress, zeroAddress } from "viem";
import type { Address } from "viem";

import type { WrappersRegistry } from "../../token/wrappers-registry";
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
  test("includes registry address in query key", ({ signer }) => {
    const options = tokenPairsQueryOptions(signer, {
      wrappersRegistryAddress: REGISTRY,
    });
    expect(options.queryKey).toEqual([
      "zama.wrappersRegistry",
      { type: "tokenPairs", wrappersRegistryAddress: getAddress(REGISTRY) },
    ]);
    expect(options.enabled).toBe(true);
  });

  test("disabled when wrappersRegistryAddress is undefined", ({ signer }) => {
    const options = tokenPairsQueryOptions(signer, {
      wrappersRegistryAddress: undefined,
    });
    expect(options.enabled).toBe(false);
  });

  test("queryFn calls readContract", async ({ signer }) => {
    vi.mocked(signer.readContract).mockResolvedValue([]);
    const options = tokenPairsQueryOptions(signer, {
      wrappersRegistryAddress: REGISTRY,
    });
    const result = await options.queryFn(mockQueryContext(options.queryKey));
    expect(result).toEqual([]);
    expect(signer.readContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "getTokenConfidentialTokenPairs" }),
    );
  });
});

describe("tokenPairsLengthQueryOptions", () => {
  test("includes registry address in query key", ({ signer }) => {
    const options = tokenPairsLengthQueryOptions(signer, {
      wrappersRegistryAddress: REGISTRY,
    });
    expect(options.queryKey).toEqual([
      "zama.wrappersRegistry",
      { type: "tokenPairsLength", wrappersRegistryAddress: getAddress(REGISTRY) },
    ]);
  });

  test("queryFn returns bigint", async ({ signer }) => {
    vi.mocked(signer.readContract).mockResolvedValue(5n);
    const options = tokenPairsLengthQueryOptions(signer, {
      wrappersRegistryAddress: REGISTRY,
    });
    const result = await options.queryFn(mockQueryContext(options.queryKey));
    expect(result).toBe(5n);
  });
});

describe("tokenPairsSliceQueryOptions", () => {
  test("disabled when fromIndex or toIndex is undefined", ({ signer }) => {
    expect(
      tokenPairsSliceQueryOptions(signer, {
        wrappersRegistryAddress: REGISTRY,
        fromIndex: undefined,
        toIndex: 10n,
      }).enabled,
    ).toBe(false);

    expect(
      tokenPairsSliceQueryOptions(signer, {
        wrappersRegistryAddress: REGISTRY,
        fromIndex: 0n,
        toIndex: undefined,
      }).enabled,
    ).toBe(false);
  });

  test("enabled when all params provided", ({ signer }) => {
    const options = tokenPairsSliceQueryOptions(signer, {
      wrappersRegistryAddress: REGISTRY,
      fromIndex: 0n,
      toIndex: 10n,
    });
    expect(options.enabled).toBe(true);
  });

  test("queryFn passes bigint indices", async ({ signer }) => {
    vi.mocked(signer.readContract).mockResolvedValue([]);
    const options = tokenPairsSliceQueryOptions(signer, {
      wrappersRegistryAddress: REGISTRY,
      fromIndex: 5n,
      toIndex: 15n,
    });
    await options.queryFn(mockQueryContext(options.queryKey));
    expect(signer.readContract).toHaveBeenCalledWith(expect.objectContaining({ args: [5n, 15n] }));
  });
});

describe("tokenPairQueryOptions", () => {
  test("disabled when index is undefined", ({ signer }) => {
    expect(
      tokenPairQueryOptions(signer, {
        wrappersRegistryAddress: REGISTRY,
        index: undefined,
      }).enabled,
    ).toBe(false);
  });

  test("queryFn passes bigint index", async ({ signer }) => {
    const pair = { tokenAddress: TOKEN, confidentialTokenAddress: C_TOKEN, isValid: true };
    vi.mocked(signer.readContract).mockResolvedValue(pair);
    const options = tokenPairQueryOptions(signer, {
      wrappersRegistryAddress: REGISTRY,
      index: 3n,
    });
    const result = await options.queryFn(mockQueryContext(options.queryKey));
    expect(result).toEqual(pair);
  });
});

describe("confidentialTokenAddressQueryOptions", () => {
  test("disabled when tokenAddress is undefined", ({ signer }) => {
    expect(
      confidentialTokenAddressQueryOptions(signer, {
        wrappersRegistryAddress: REGISTRY,
        tokenAddress: undefined,
      }).enabled,
    ).toBe(false);
  });

  test("queryFn returns [found, address] tuple", async ({ signer }) => {
    vi.mocked(signer.readContract).mockResolvedValue([true, C_TOKEN]);
    const options = confidentialTokenAddressQueryOptions(signer, {
      wrappersRegistryAddress: REGISTRY,
      tokenAddress: TOKEN,
    });
    const result = await options.queryFn(mockQueryContext(options.queryKey));
    expect(result).toEqual([true, C_TOKEN]);
  });
});

describe("tokenAddressQueryOptions", () => {
  test("disabled when confidentialTokenAddress is undefined", ({ signer }) => {
    expect(
      tokenAddressQueryOptions(signer, {
        wrappersRegistryAddress: REGISTRY,
        confidentialTokenAddress: undefined,
      }).enabled,
    ).toBe(false);
  });

  test("queryFn returns [found, address] tuple", async ({ signer }) => {
    vi.mocked(signer.readContract).mockResolvedValue([true, TOKEN]);
    const options = tokenAddressQueryOptions(signer, {
      wrappersRegistryAddress: REGISTRY,
      confidentialTokenAddress: C_TOKEN,
    });
    const result = await options.queryFn(mockQueryContext(options.queryKey));
    expect(result).toEqual([true, TOKEN]);
  });
});

describe("isConfidentialTokenValidQueryOptions", () => {
  test("disabled when confidentialTokenAddress is undefined", ({ signer }) => {
    expect(
      isConfidentialTokenValidQueryOptions(signer, {
        wrappersRegistryAddress: REGISTRY,
        confidentialTokenAddress: undefined,
      }).enabled,
    ).toBe(false);
  });

  test("queryFn returns boolean", async ({ signer }) => {
    vi.mocked(signer.readContract).mockResolvedValue(true);
    const options = isConfidentialTokenValidQueryOptions(signer, {
      wrappersRegistryAddress: REGISTRY,
      confidentialTokenAddress: C_TOKEN,
    });
    const result = await options.queryFn(mockQueryContext(options.queryKey));
    expect(result).toBe(true);
  });

  test("query key includes both addresses", ({ signer }) => {
    const options = isConfidentialTokenValidQueryOptions(signer, {
      wrappersRegistryAddress: REGISTRY,
      confidentialTokenAddress: C_TOKEN,
    });
    expect(options.queryKey).toEqual([
      "zama.wrappersRegistry",
      {
        type: "isConfidentialTokenValid",
        wrappersRegistryAddress: getAddress(REGISTRY),
        confidentialTokenAddress: getAddress(C_TOKEN),
      },
    ]);
  });
});

describe("listPairsQueryOptions", () => {
  function makeRegistry(ttlMs = 86400_000): WrappersRegistry {
    return {
      listPairs: vi.fn(),
      ttlMs,
    } as unknown as WrappersRegistry;
  }

  test("includes registry address, page, pageSize, metadata in query key", () => {
    const registry = makeRegistry();
    const options = listPairsQueryOptions(registry, {
      wrappersRegistryAddress: REGISTRY,
      page: 2,
      pageSize: 50,
      metadata: true,
    });
    expect(options.queryKey).toEqual([
      "zama.wrappersRegistry",
      {
        type: "listPairs",
        wrappersRegistryAddress: getAddress(REGISTRY),
        page: 2,
        pageSize: 50,
        metadata: true,
      },
    ]);
  });

  test("staleTime equals registry.ttlMs", () => {
    const registry = makeRegistry(3_600_000);
    const options = listPairsQueryOptions(registry, {
      wrappersRegistryAddress: REGISTRY,
    });
    expect(options.staleTime).toBe(3_600_000);
  });

  test("disabled when wrappersRegistryAddress is undefined", () => {
    const registry = makeRegistry();
    const options = listPairsQueryOptions(registry, {
      wrappersRegistryAddress: undefined,
    });
    expect(options.enabled).toBe(false);
  });

  test("queryFn delegates to registry.listPairs with correct pagination args", async () => {
    const registry = makeRegistry();
    const page = { total: 1, page: 1, pageSize: 10, data: [] };
    vi.mocked(registry.listPairs as ReturnType<typeof vi.fn>).mockResolvedValue(page);
    const options = listPairsQueryOptions(registry, {
      wrappersRegistryAddress: REGISTRY,
      page: 3,
      pageSize: 20,
      metadata: true,
    });
    const result = await options.queryFn(mockQueryContext(options.queryKey));
    expect(result).toEqual(page);
    expect(registry.listPairs).toHaveBeenCalledWith({ page: 3, pageSize: 20, metadata: true });
  });

  test("uses zeroAddress in query key when wrappersRegistryAddress is undefined", () => {
    const registry = makeRegistry();
    const options = listPairsQueryOptions(registry, {
      wrappersRegistryAddress: undefined,
    });
    expect(options.queryKey[1]).toMatchObject({ wrappersRegistryAddress: zeroAddress });
  });
});
