import { describe, expect, test, vi } from "vitest";
import { createMockSigner } from "./test-helpers";
import { isConfidentialQueryOptions, isWrapperQueryOptions } from "../is-confidential";

describe("isConfidentialQueryOptions", () => {
  test("queries confidential interface check", async () => {
    const signer = createMockSigner();
    vi.mocked(signer.readContract).mockResolvedValue(true);
    const options = isConfidentialQueryOptions(
      signer,
      "0x1111111111111111111111111111111111111111",
    );

    const value = await options.queryFn({ queryKey: options.queryKey });
    expect(value).toBe(true);
    expect(options.staleTime).toBe(Infinity);
  });

  test("queries wrapper interface check", async () => {
    const signer = createMockSigner();
    vi.mocked(signer.readContract).mockResolvedValue(false);
    const options = isWrapperQueryOptions(signer, "0x1111111111111111111111111111111111111111");

    const value = await options.queryFn({ queryKey: options.queryKey });
    expect(value).toBe(false);
    expect(options.staleTime).toBe(Infinity);
  });
});
