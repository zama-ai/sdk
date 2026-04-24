import { describe, expect, test, vi } from "../../test-fixtures";
import { waitFor } from "@testing-library/react";
import type { Address } from "@zama-fhe/sdk";
import {
  useUnderlyingAllowance,
  useUnderlyingAllowanceSuspense,
} from "../use-underlying-allowance";
import { TOKEN, WRAPPER, USER } from "../../__tests__/mutation-test-helpers";

describe("useUnderlyingAllowance", () => {
  const UNDERLYING = "0x5e5E5e5e5E5e5E5E5e5E5E5e5e5E5E5E5e5E5E5e";

  test("default", async ({ renderWithProviders, provider }) => {
    vi.mocked(provider.readContract).mockResolvedValueOnce(UNDERLYING).mockResolvedValueOnce(1000n);

    const { result } = renderWithProviders(() =>
      useUnderlyingAllowance({ tokenAddress: TOKEN, wrapperAddress: WRAPPER, owner: USER }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const { data, dataUpdatedAt } = result.current;
    expect(data).toBe(1000n);
    expect(dataUpdatedAt).toEqual(expect.any(Number));
    expect(provider.readContract).toHaveBeenLastCalledWith(
      expect.objectContaining({ functionName: "allowance", address: UNDERLYING }),
    );
  });

  test("behavior: queries allowance for the caller-supplied owner, not the connected signer", async ({
    renderWithProviders,
    provider,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValueOnce(UNDERLYING).mockResolvedValueOnce(2000n);

    const OTHER = "0x9C9c9c9c9c9c9C9c9c9C9C9c9c9C9c9c9c9c9C9c" as Address;
    const { result } = renderWithProviders(() =>
      useUnderlyingAllowance({ tokenAddress: TOKEN, wrapperAddress: WRAPPER, owner: OTHER }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(2000n);
    expect(provider.readContract).toHaveBeenLastCalledWith(
      expect.objectContaining({ functionName: "allowance", args: [OTHER, WRAPPER] }),
    );
  });

  test("behavior: disabled when user passes enabled=false", ({ renderWithProviders, provider }) => {
    vi.mocked(provider.readContract).mockResolvedValueOnce(UNDERLYING).mockResolvedValueOnce(1000n);

    const { result } = renderWithProviders(() =>
      useUnderlyingAllowance(
        { tokenAddress: TOKEN, wrapperAddress: WRAPPER, owner: USER },
        { enabled: false },
      ),
    );

    expect(result.current.isPending).toBe(true);
    expect(result.current.fetchStatus).toBe("idle");
  });

  test("behavior: disabled when owner is undefined (signer-less mount)", ({
    renderWithProviders,
    provider,
  }) => {
    const { result } = renderWithProviders(() =>
      useUnderlyingAllowance({ tokenAddress: TOKEN, wrapperAddress: WRAPPER, owner: undefined }),
    );

    expect(result.current.isPending).toBe(true);
    expect(result.current.fetchStatus).toBe("idle");
    expect(provider.readContract).not.toHaveBeenCalled();
  });
});

describe("useUnderlyingAllowanceSuspense", () => {
  const UNDERLYING = "0x5e5E5e5e5E5e5E5E5e5E5E5e5e5E5E5E5e5E5E5e";

  test("reads allowance for the caller-supplied owner", async ({
    renderWithProviders,
    provider,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValueOnce(UNDERLYING).mockResolvedValueOnce(500n);

    const OTHER = "0x9C9c9c9c9c9c9C9c9c9C9C9c9c9C9c9c9c9c9C9c" as Address;
    const { result } = renderWithProviders(() =>
      useUnderlyingAllowanceSuspense({
        tokenAddress: TOKEN,
        wrapperAddress: WRAPPER,
        owner: OTHER,
      }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(500n);
    expect(provider.readContract).toHaveBeenLastCalledWith(
      expect.objectContaining({ functionName: "allowance", args: [OTHER, WRAPPER] }),
    );
  });
});
