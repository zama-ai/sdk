import { describe, expect, test, vi } from "vitest";
import { createMockSigner } from "./test-helpers";
import { wrapperDiscoveryQueryOptions } from "../wrapper-discovery";

describe("wrapperDiscoveryQueryOptions", () => {
  test("returns null when wrapper does not exist", async () => {
    const signer = createMockSigner();
    vi.mocked(signer.readContract).mockResolvedValueOnce(false);

    const options = wrapperDiscoveryQueryOptions(
      signer,
      "0x1111111111111111111111111111111111111111",
      {
        coordinatorAddress: "0x3333333333333333333333333333333333333333",
      },
    );

    const wrapper = await options.queryFn({ queryKey: options.queryKey });
    expect(wrapper).toBeNull();
  });

  test("reads wrapper when it exists", async () => {
    const signer = createMockSigner();
    vi.mocked(signer.readContract)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce("0x4444444444444444444444444444444444444444");

    const options = wrapperDiscoveryQueryOptions(
      signer,
      "0x1111111111111111111111111111111111111111",
      {
        coordinatorAddress: "0x3333333333333333333333333333333333333333",
      },
    );

    const wrapper = await options.queryFn({ queryKey: options.queryKey });
    expect(wrapper).toBe("0x4444444444444444444444444444444444444444");
  });
});
