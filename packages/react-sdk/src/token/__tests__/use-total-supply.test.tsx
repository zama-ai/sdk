import { waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "../../test-fixtures";
import { useTotalSupply } from "../use-total-supply";

describe("useTotalSupply", () => {
  test("reads inferredTotalSupply from the wrapper", async ({
    renderWithProviders,
    provider,
    tokenAddress,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValue(42000n);

    const { result } = renderWithProviders(() => useTotalSupply(tokenAddress));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const { data, dataUpdatedAt } = result.current;
    expect(data).toBe(42000n);
    expect(dataUpdatedAt).toEqual(expect.any(Number));
    expect(provider.readContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "inferredTotalSupply", address: tokenAddress }),
    );
  });
});
