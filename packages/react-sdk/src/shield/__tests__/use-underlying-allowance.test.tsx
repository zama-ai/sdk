import { describe, expect, test, vi } from "../../test-fixtures";
import { waitFor } from "@testing-library/react";
import type { Address } from "@zama-fhe/sdk";
import {
  useUnderlyingAllowance,
  useUnderlyingAllowanceSuspense,
} from "../use-underlying-allowance";
describe("useUnderlyingAllowance", () => {
  test("default", async ({
    renderWithProviders,
    provider,
    userAddress,
    wrapperAddress,
    underlyingAddress,
  }) => {
    vi.mocked(provider.readContract)
      .mockResolvedValueOnce(underlyingAddress)
      .mockResolvedValueOnce(1000n);

    const { result } = renderWithProviders(() =>
      useUnderlyingAllowance({ address: wrapperAddress, owner: userAddress }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const { data, dataUpdatedAt } = result.current;
    expect(data).toBe(1000n);
    expect(dataUpdatedAt).toEqual(expect.any(Number));
    expect(provider.readContract).toHaveBeenLastCalledWith(
      expect.objectContaining({
        functionName: "allowance",
        address: underlyingAddress,
      }),
    );
  });

  test("behavior: queries allowance for the caller-supplied owner, not the connected signer", async ({
    renderWithProviders,
    provider,
    wrapperAddress,
    underlyingAddress,
  }) => {
    vi.mocked(provider.readContract)
      .mockResolvedValueOnce(underlyingAddress)
      .mockResolvedValueOnce(2000n);

    const OTHER = "0x9C9c9c9c9c9c9C9c9c9C9C9c9c9C9c9c9c9c9C9c" as Address;
    const { result } = renderWithProviders(() =>
      useUnderlyingAllowance({ address: wrapperAddress, owner: OTHER }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(2000n);
    expect(provider.readContract).toHaveBeenLastCalledWith(
      expect.objectContaining({
        functionName: "allowance",
        args: [OTHER, wrapperAddress],
      }),
    );
  });

  test("behavior: disabled when user passes enabled=false", ({
    renderWithProviders,
    provider,
    userAddress,
    wrapperAddress,
    underlyingAddress,
  }) => {
    vi.mocked(provider.readContract)
      .mockResolvedValueOnce(underlyingAddress)
      .mockResolvedValueOnce(1000n);

    const { result } = renderWithProviders(() =>
      useUnderlyingAllowance({ address: wrapperAddress, owner: userAddress }, { enabled: false }),
    );

    expect(result.current.isPending).toBe(true);
    expect(result.current.fetchStatus).toBe("idle");
  });

  test("behavior: disabled when owner is undefined (signer-less mount)", ({
    renderWithProviders,
    provider,
    wrapperAddress,
  }) => {
    const { result } = renderWithProviders(() =>
      useUnderlyingAllowance({ address: wrapperAddress, owner: undefined }),
    );

    expect(result.current.isPending).toBe(true);
    expect(result.current.fetchStatus).toBe("idle");
    expect(provider.readContract).not.toHaveBeenCalled();
  });
});

describe("useUnderlyingAllowanceSuspense", () => {
  test("reads allowance for the caller-supplied owner", async ({
    renderWithProviders,
    provider,
    wrapperAddress,
    underlyingAddress,
  }) => {
    vi.mocked(provider.readContract)
      .mockResolvedValueOnce(underlyingAddress)
      .mockResolvedValueOnce(500n);

    const OTHER = "0x9C9c9c9c9c9c9C9c9c9C9C9c9c9C9c9c9c9c9C9c" as Address;
    const { result } = renderWithProviders(() =>
      useUnderlyingAllowanceSuspense({ address: wrapperAddress, owner: OTHER }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(500n);
    expect(provider.readContract).toHaveBeenLastCalledWith(
      expect.objectContaining({
        functionName: "allowance",
        args: [OTHER, wrapperAddress],
      }),
    );
  });
});
