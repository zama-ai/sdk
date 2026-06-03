import { describe, expect, test, vi } from "../../test-fixtures";
import { waitFor } from "@testing-library/react";
import { useMetadata } from "../use-metadata";

describe("useMetadata", () => {
  test("returns name, symbol, decimals", async ({
    renderWithProviders,
    provider,
    tokenAddress,
  }) => {
    vi.mocked(provider.readContract)
      .mockResolvedValueOnce("TestToken")
      .mockResolvedValueOnce("TT")
      .mockResolvedValueOnce(18);

    const { result } = renderWithProviders(() => useMetadata(tokenAddress));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const { data, dataUpdatedAt } = result.current;
    expect(data).toEqual({ name: "TestToken", symbol: "TT", decimals: 18 });
    expect(dataUpdatedAt).toEqual(expect.any(Number));
    expect(provider.readContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "name", address: tokenAddress }),
    );
    expect(provider.readContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "symbol", address: tokenAddress }),
    );
    expect(provider.readContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "decimals", address: tokenAddress }),
    );
  });
});
