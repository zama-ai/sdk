import { describe, expect, test, vi } from "../../test-fixtures";
import { waitFor } from "@testing-library/react";
import { ERC7984_WRAPPER_INTERFACE_ID } from "@zama-fhe/sdk";
import { useTotalSupply } from "../use-total-supply";
import { TOKEN } from "../../__tests__/mutation-test-helpers";

describe("useTotalSupply", () => {
  test("default", async ({ renderWithProviders, signer }) => {
    vi.mocked(signer.readContract).mockImplementation(async (config) => {
      if (config.functionName === "supportsInterface") {
        return config.args[0] === ERC7984_WRAPPER_INTERFACE_ID;
      }
      return 42000n;
    });

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
