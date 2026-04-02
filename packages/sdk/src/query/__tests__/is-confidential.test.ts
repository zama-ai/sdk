import { describe, expect, test, vi, mockQueryContext } from "../../test-fixtures";
import { isConfidentialQueryOptions, isWrapperQueryOptions } from "../is-confidential";

describe("isConfidentialQueryOptions", () => {
  test("queries confidential interface check", async ({ signer }) => {
    vi.mocked(signer.readContract).mockResolvedValue(true);
    const options = isConfidentialQueryOptions(
      signer,
      "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a",
    );

    const value = await options.queryFn(mockQueryContext(options.queryKey));
    expect(value).toBe(true);
    expect(options.staleTime).toBe(Infinity);
  });

  test("returns false when contract reverts (no ERC-165 support)", async ({ signer }) => {
    vi.mocked(signer.readContract).mockRejectedValue(new Error("execution reverted"));
    const options = isConfidentialQueryOptions(
      signer,
      "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a",
    );

    const value = await options.queryFn(mockQueryContext(options.queryKey));
    expect(value).toBe(false);
  });

  test("re-throws network errors instead of returning false", async ({ signer }) => {
    vi.mocked(signer.readContract).mockRejectedValue(new Error("fetch failed"));
    const options = isConfidentialQueryOptions(
      signer,
      "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a",
    );

    await expect(options.queryFn(mockQueryContext(options.queryKey))).rejects.toThrow(
      "fetch failed",
    );
  });

  test("queries wrapper interface check", async ({ signer }) => {
    vi.mocked(signer.readContract).mockResolvedValue(false);
    const options = isWrapperQueryOptions(signer, "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a");

    const value = await options.queryFn(mockQueryContext(options.queryKey));
    expect(value).toBe(false);
    expect(options.staleTime).toBe(Infinity);
  });

  test("wrapper query re-throws network errors", async ({ signer }) => {
    vi.mocked(signer.readContract).mockRejectedValue(new Error("connection refused"));
    const options = isWrapperQueryOptions(signer, "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a");

    await expect(options.queryFn(mockQueryContext(options.queryKey))).rejects.toThrow(
      "connection refused",
    );
  });
});
