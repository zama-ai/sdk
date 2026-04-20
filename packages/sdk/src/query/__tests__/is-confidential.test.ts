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
});

describe("isWrapperQueryOptions", () => {
  const TOKEN = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a";

  test("returns true when legacy interfaceId (0xd04584ba) matches", async ({ signer }) => {
    vi.mocked(signer.readContract)
      .mockResolvedValueOnce(true) // legacy ID
      .mockResolvedValueOnce(false); // upgraded ID
    const options = isWrapperQueryOptions(signer, TOKEN);

    const value = await options.queryFn(mockQueryContext(options.queryKey));
    expect(value).toBe(true);
  });

  test("returns true when new interfaceId (0x1f1c62b2) matches", async ({ signer }) => {
    vi.mocked(signer.readContract)
      .mockResolvedValueOnce(false) // legacy ID
      .mockResolvedValueOnce(true); // upgraded ID
    const options = isWrapperQueryOptions(signer, TOKEN);

    const value = await options.queryFn(mockQueryContext(options.queryKey));
    expect(value).toBe(true);
  });

  test("returns false when neither interfaceId matches", async ({ signer }) => {
    vi.mocked(signer.readContract)
      .mockResolvedValueOnce(false) // legacy ID
      .mockResolvedValueOnce(false); // upgraded ID
    const options = isWrapperQueryOptions(signer, TOKEN);

    const value = await options.queryFn(mockQueryContext(options.queryKey));
    expect(value).toBe(false);
    expect(options.staleTime).toBe(Infinity);
  });

  test("returns false when contract reverts (no ERC-165 support)", async ({ signer }) => {
    vi.mocked(signer.readContract).mockRejectedValue(new Error("execution reverted"));
    const options = isWrapperQueryOptions(signer, TOKEN);

    const value = await options.queryFn(mockQueryContext(options.queryKey));
    expect(value).toBe(false);
  });

  test("re-throws network errors instead of returning false", async ({ signer }) => {
    vi.mocked(signer.readContract).mockRejectedValue(new Error("connection refused"));
    const options = isWrapperQueryOptions(signer, TOKEN);

    await expect(options.queryFn(mockQueryContext(options.queryKey))).rejects.toThrow(
      "connection refused",
    );
  });
});
