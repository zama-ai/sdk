import { describe, expect, test, vi } from "../../test-fixtures";
import { waitFor } from "@testing-library/react";
import { useIsConfidential, useIsWrapper } from "../use-is-confidential";
import { TOKEN } from "../../__tests__/mutation-test-helpers";

describe("useIsConfidential", () => {
  test("default", async ({ renderWithProviders, signer, provider }) => {
    vi.mocked(provider.readContract).mockResolvedValue(true);

    const { result } = renderWithProviders(() => useIsConfidential(TOKEN));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const { data, dataUpdatedAt } = result.current;
    expect(data).toBe(true);
    expect(dataUpdatedAt).toEqual(expect.any(Number));
    expect(provider.readContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "supportsInterface", address: TOKEN }),
    );
  });
});

describe("useIsWrapper", () => {
  test("default", async ({ renderWithProviders, signer, provider }) => {
    vi.mocked(provider.readContract).mockResolvedValue(false);

    const { result } = renderWithProviders(() => useIsWrapper(TOKEN));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const { data, dataUpdatedAt } = result.current;
    expect(data).toBe(false);
    expect(dataUpdatedAt).toEqual(expect.any(Number));
    expect(provider.readContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "supportsInterface", address: TOKEN }),
    );
  });
});
