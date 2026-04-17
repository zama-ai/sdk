import { describe, expect, test, vi } from "../../test-fixtures";
import { waitFor } from "@testing-library/react";
import { useTotalSupply } from "../use-total-supply";
import { TOKEN } from "../../__tests__/mutation-test-helpers";

describe("useTotalSupply", () => {
  test("default", async ({ renderWithProviders, signer }) => {
    vi.mocked(signer.readContract).mockResolvedValue(42000n);

    const { result } = renderWithProviders(() => useTotalSupply(TOKEN));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const { data, dataUpdatedAt } = result.current;
    expect(data).toBe(42000n);
    expect(dataUpdatedAt).toEqual(expect.any(Number));
    expect(signer.readContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "inferredTotalSupply", address: TOKEN }),
    );
  });
});
