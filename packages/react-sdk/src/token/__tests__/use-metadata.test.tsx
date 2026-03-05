import { describe, expect, test, vi } from "../../test-fixtures";
import { waitFor } from "@testing-library/react";
import { useMetadata } from "../use-metadata";
import { TOKEN } from "../../__tests__/mutation-test-helpers";

describe("useMetadata", () => {
  test("returns name, symbol, decimals", async ({ renderWithProviders, signer }) => {
    vi.mocked(signer.readContract)
      .mockResolvedValueOnce("TestToken")
      .mockResolvedValueOnce("TT")
      .mockResolvedValueOnce(18);

    const { result } = renderWithProviders(() => useMetadata(TOKEN));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const { data, dataUpdatedAt } = result.current;
    expect(data).toEqual({ name: "TestToken", symbol: "TT", decimals: 18 });
    expect(dataUpdatedAt).toEqual(expect.any(Number));
    expect(signer.readContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "name", address: TOKEN }),
    );
    expect(signer.readContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "symbol", address: TOKEN }),
    );
    expect(signer.readContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "decimals", address: TOKEN }),
    );
  });
});
