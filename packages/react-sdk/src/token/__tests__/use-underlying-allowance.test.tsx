import { describe, expect, test, vi } from "../../test-fixtures";
import { waitFor } from "@testing-library/react";
import type { Address } from "@zama-fhe/sdk";
import { useUnderlyingAllowance } from "../use-underlying-allowance";
import { TOKEN, WRAPPER, USER } from "../../__tests__/mutation-test-helpers";

describe("useUnderlyingAllowance", () => {
  const UNDERLYING = "0x5555555555555555555555555555555555555555";

  test("default", async ({ renderWithProviders, signer }) => {
    vi.mocked(signer.readContract).mockResolvedValueOnce(UNDERLYING).mockResolvedValueOnce(1000n);

    const { result } = renderWithProviders(() =>
      useUnderlyingAllowance({ tokenAddress: TOKEN, wrapperAddress: WRAPPER }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const { data, dataUpdatedAt } = result.current;
    expect(data).toBe(1000n);
    expect(dataUpdatedAt).toEqual(expect.any(Number));
    expect(signer.readContract).toHaveBeenLastCalledWith(
      expect.objectContaining({ functionName: "allowance", address: UNDERLYING }),
    );
  });

  test("behavior: signer undefined -> defined", async ({ renderWithProviders, signer }) => {
    let resolveAddress: (value: Address) => void;
    const addressPromise = new Promise<Address>((resolve) => {
      resolveAddress = resolve;
    });
    vi.mocked(signer.getAddress).mockReturnValue(addressPromise);
    vi.mocked(signer.readContract).mockResolvedValueOnce(UNDERLYING).mockResolvedValueOnce(1000n);

    const { result, rerender } = renderWithProviders(() =>
      useUnderlyingAllowance({ tokenAddress: TOKEN, wrapperAddress: WRAPPER }),
    );

    expect(result.current.isPending).toBe(true);
    expect(result.current.fetchStatus).toBe("idle");

    resolveAddress!(USER);
    rerender();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(1000n);
  });

  test("behavior: disabled when user passes enabled=false", ({ renderWithProviders, signer }) => {
    vi.mocked(signer.readContract).mockResolvedValueOnce(UNDERLYING).mockResolvedValueOnce(1000n);

    const { result } = renderWithProviders(() =>
      useUnderlyingAllowance({ tokenAddress: TOKEN, wrapperAddress: WRAPPER }, { enabled: false }),
    );

    expect(result.current.isPending).toBe(true);
    expect(result.current.fetchStatus).toBe("idle");
  });
});
