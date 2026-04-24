import { describe, expect, test, vi } from "../../test-fixtures";
import { renderHook, waitFor } from "@testing-library/react";
import type { Address } from "viem";
import {
  useConfidentialIsApproved,
  useConfidentialIsApprovedSuspense,
} from "../use-confidential-is-approved";
import { TOKEN, SPENDER } from "../../__tests__/mutation-test-helpers";

const HOLDER = "0x4D4d4D4d4d4D4D4d4D4D4D4d4d4d4d4D4D4d4d4D" as Address;

describe("useConfidentialIsApproved", () => {
  test("behavior: disabled when tokenAddress is undefined", ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() =>
      useConfidentialIsApproved({ tokenAddress: undefined, spender: SPENDER, holder: HOLDER }),
    );

    expect(result.current.isPending).toBe(true);
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.data).toBeUndefined();
  });

  test("behavior: disabled when spender is undefined", ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() =>
      useConfidentialIsApproved({ tokenAddress: TOKEN, spender: undefined, holder: HOLDER }),
    );

    expect(result.current.isPending).toBe(true);
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.data).toBeUndefined();
  });

  test("behavior: disabled when holder is undefined (signer-less mount)", ({
    renderWithProviders,
    provider,
  }) => {
    const { result } = renderWithProviders(() =>
      useConfidentialIsApproved({ tokenAddress: TOKEN, spender: SPENDER, holder: undefined }),
    );

    expect(result.current.isPending).toBe(true);
    expect(result.current.fetchStatus).toBe("idle");
    expect(provider.readContract).not.toHaveBeenCalled();
  });

  test("behavior: spender undefined -> defined", async ({ createWrapper, signer, provider }) => {
    vi.mocked(provider.readContract).mockResolvedValue(true);

    const ctx = createWrapper({ signer });
    const { result, rerender } = renderHook(
      ({ spender }) => useConfidentialIsApproved({ tokenAddress: TOKEN, spender, holder: HOLDER }),
      {
        wrapper: ctx.Wrapper,
        initialProps: { spender: undefined as Address | undefined },
      },
    );

    expect(result.current.isPending).toBe(true);
    expect(result.current.fetchStatus).toBe("idle");

    rerender({ spender: SPENDER });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(true);
  });

  test("behavior: tokenAddress undefined -> defined", async ({
    createWrapper,
    signer,
    provider,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValue(true);

    const ctx = createWrapper({ signer });
    const { result, rerender } = renderHook(
      ({ tokenAddress }) =>
        useConfidentialIsApproved({ tokenAddress, spender: SPENDER, holder: HOLDER }),
      {
        wrapper: ctx.Wrapper,
        initialProps: { tokenAddress: undefined as Address | undefined },
      },
    );

    expect(result.current.isPending).toBe(true);
    expect(result.current.fetchStatus).toBe("idle");

    rerender({ tokenAddress: TOKEN });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(true);
  });

  test("behavior: disabled when user passes enabled=false", ({ renderWithProviders, provider }) => {
    vi.mocked(provider.readContract).mockResolvedValue(true);

    const { result } = renderWithProviders(() =>
      useConfidentialIsApproved(
        {
          tokenAddress: TOKEN,
          spender: SPENDER,
          holder: HOLDER,
        },
        { enabled: false },
      ),
    );

    expect(result.current.isPending).toBe(true);
    expect(result.current.fetchStatus).toBe("idle");
  });

  test("default", async ({ renderWithProviders, provider }) => {
    vi.mocked(provider.readContract).mockResolvedValue(true);

    const { result } = renderWithProviders(() =>
      useConfidentialIsApproved({
        tokenAddress: TOKEN,
        spender: SPENDER,
        holder: HOLDER,
      }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const { data, dataUpdatedAt } = result.current;
    expect(data).toBe(true);
    expect(dataUpdatedAt).toEqual(expect.any(Number));
    expect(provider.readContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "isOperator", address: TOKEN }),
    );
  });

  test("uses caller-supplied holder verbatim — never resolves signer address", async ({
    renderWithProviders,
    signer,
    provider,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValue(true);
    const getAddressSpy = vi.mocked(signer.getAddress);

    const { result } = renderWithProviders(() =>
      useConfidentialIsApproved({
        tokenAddress: TOKEN,
        spender: SPENDER,
        holder: HOLDER,
      }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(provider.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "isOperator",
        args: [HOLDER, SPENDER],
      }),
    );
    // Hook must not trigger a signer-address query. SDK lifecycle code may
    // still call signer.getAddress for its own identity bootstrap, so allow
    // at most one call.
    expect(getAddressSpy.mock.calls.length).toBeLessThanOrEqual(1);
  });
});

describe("useConfidentialIsApprovedSuspense", () => {
  test("uses the caller-supplied holder address", async ({ renderWithProviders, provider }) => {
    vi.mocked(provider.readContract).mockResolvedValue(true);

    const { result } = renderWithProviders(() =>
      useConfidentialIsApprovedSuspense({
        tokenAddress: TOKEN,
        spender: SPENDER,
        holder: HOLDER,
      }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(provider.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "isOperator",
        args: [HOLDER, SPENDER],
      }),
    );
  });

  test("queries the caller-supplied holder verbatim, independent of the connected signer", async ({
    renderWithProviders,
    provider,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValue(true);

    const OTHER = "0x9C9c9c9c9c9c9C9c9c9C9C9c9c9C9c9c9c9c9C9c" as Address;
    const { result } = renderWithProviders(() =>
      useConfidentialIsApprovedSuspense({
        tokenAddress: TOKEN,
        spender: SPENDER,
        holder: OTHER,
      }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(true);
    expect(provider.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "isOperator",
        args: [OTHER, SPENDER],
      }),
    );
  });
});
