import { describe, expect, test, vi, mockQueryContext } from "../../test-fixtures";
import { isConfidentialQueryOptions, isWrapperQueryOptions } from "../is-confidential";

describe("isConfidentialQueryOptions", () => {
  test("queries confidential interface check", async ({ sdk, provider }) => {
    vi.mocked(provider.readContract).mockResolvedValue(true);
    const options = isConfidentialQueryOptions(sdk, "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a");

    const value = await options.queryFn(mockQueryContext(options.queryKey));
    expect(value).toBe(true);
    expect(options.staleTime).toBe(Infinity);
  });

  test("returns false when contract reverts (no ERC-165 support)", async ({ sdk, provider }) => {
    vi.mocked(provider.readContract).mockRejectedValue(new Error("execution reverted"));
    const options = isConfidentialQueryOptions(sdk, "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a");

    const value = await options.queryFn(mockQueryContext(options.queryKey));
    expect(value).toBe(false);
  });

  test("re-throws network errors instead of returning false", async ({ sdk, provider }) => {
    vi.mocked(provider.readContract).mockRejectedValue(new Error("fetch failed"));
    const options = isConfidentialQueryOptions(sdk, "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a");

    await expect(options.queryFn(mockQueryContext(options.queryKey))).rejects.toThrow(
      "fetch failed",
    );
  });
});

describe("isWrapperQueryOptions", () => {
  const TOKEN = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a";

  test("returns true when baseline interfaceId (0xd04584ba) matches", async ({ sdk, provider }) => {
    vi.mocked(provider.readContract)
      .mockResolvedValueOnce(true) // baseline ID
      .mockResolvedValueOnce(false); // upgraded ID
    const options = isWrapperQueryOptions(sdk, TOKEN);

    const value = await options.queryFn(mockQueryContext(options.queryKey));
    expect(value).toBe(true);
  });

  test("returns true when new interfaceId (0x1f1c62b2) matches", async ({ sdk, provider }) => {
    vi.mocked(provider.readContract)
      .mockResolvedValueOnce(false) // baseline ID
      .mockResolvedValueOnce(true); // upgraded ID
    const options = isWrapperQueryOptions(sdk, TOKEN);

    const value = await options.queryFn(mockQueryContext(options.queryKey));
    expect(value).toBe(true);
  });

  test("returns false when neither interfaceId matches", async ({ sdk, provider }) => {
    vi.mocked(provider.readContract).mockResolvedValue(false);
    const options = isWrapperQueryOptions(sdk, TOKEN);

    const value = await options.queryFn(mockQueryContext(options.queryKey));
    expect(value).toBe(false);
    expect(options.staleTime).toBe(Infinity);
  });

  test("returns false when contract reverts (no ERC-165 support)", async ({ sdk, provider }) => {
    vi.mocked(provider.readContract).mockRejectedValue(new Error("execution reverted"));
    const options = isWrapperQueryOptions(sdk, TOKEN);

    const value = await options.queryFn(mockQueryContext(options.queryKey));
    expect(value).toBe(false);
  });

  test("re-throws network errors instead of returning false", async ({ sdk, provider }) => {
    vi.mocked(provider.readContract).mockRejectedValue(new Error("connection refused"));
    const options = isWrapperQueryOptions(sdk, TOKEN);

    await expect(options.queryFn(mockQueryContext(options.queryKey))).rejects.toThrow(
      "connection refused",
    );
  });
});
