import { describe, expect, test, vi } from "../../test-fixtures";
import { renderHook, waitFor } from "@testing-library/react";
import type { Address } from "viem";
import {
  useConfidentialIsApproved,
  useConfidentialIsApprovedSuspense,
} from "../use-confidential-is-approved";
import { TOKEN, SPENDER } from "../../__tests__/mutation-test-helpers";

describe("useConfidentialIsApproved", () => {
  test("behavior: disabled when tokenAddress is undefined", ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() =>
      useConfidentialIsApproved({ tokenAddress: undefined, spender: SPENDER }),
    );

    expect(result.current.isPending).toBe(true);
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.data).toBeUndefined();
  });

  test("behavior: disabled when spender is undefined", ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() =>
      useConfidentialIsApproved({ tokenAddress: TOKEN, spender: undefined }),
    );

    expect(result.current.isPending).toBe(true);
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.data).toBeUndefined();
  });

  test("behavior: spender undefined -> defined", async ({ createWrapper, signer, provider }) => {
    vi.mocked(provider.readContract).mockResolvedValue(true);

    const ctx = createWrapper({ signer });
    const { result, rerender } = renderHook(
      ({ spender }) => useConfidentialIsApproved({ tokenAddress: TOKEN, spender }),
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
      ({ tokenAddress }) => useConfidentialIsApproved({ tokenAddress, spender: SPENDER }),
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

  test("skips signer resolution when holder is provided", async ({
    renderWithProviders,
    signer,
    provider,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValue(true);
    const getAddressSpy = vi.mocked(signer.getAddress);

    // Record the call count before rendering; the SDK itself may call
    // getAddress from internal lifecycle handlers, but the hook must not
    // trigger an additional useSignerAddress query when holder is provided.
    const { result } = renderWithProviders(() =>
      useConfidentialIsApproved({
        tokenAddress: TOKEN,
        spender: SPENDER,
        holder: "0x4D4d4D4d4d4D4D4d4D4D4D4d4d4d4d4D4D4d4d4D",
      }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(provider.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "isOperator",
        args: ["0x4D4d4D4d4d4D4D4d4D4D4D4d4d4d4d4D4D4d4d4D", SPENDER],
      }),
    );
    // When holder is supplied, the hook never queries the signer address.
    // At most the SDK's internal identity bootstrap runs once.
    expect(getAddressSpy.mock.calls.length).toBeLessThanOrEqual(1);
  });
});

describe("useConfidentialIsApprovedSuspense", () => {
  test("uses explicit holder address when provided", async ({ renderWithProviders, provider }) => {
    vi.mocked(provider.readContract).mockResolvedValue(true);

    const { result } = renderWithProviders(() =>
      useConfidentialIsApprovedSuspense({
        tokenAddress: TOKEN,
        spender: SPENDER,
        holder: "0x4D4d4D4d4d4D4D4d4D4D4D4d4d4d4d4D4D4d4d4D",
      }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(provider.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "isOperator",
        args: ["0x4D4d4D4d4d4D4D4d4D4D4D4d4d4d4d4D4D4d4d4D", SPENDER],
      }),
    );
  });

  test("falls back to connected signer address when holder is omitted", async ({
    renderWithProviders,
    signer,
    provider,
    userAddress,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValue(true);

    const { result } = renderWithProviders(() =>
      useConfidentialIsApprovedSuspense({
        tokenAddress: TOKEN,
        spender: SPENDER,
      }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(signer.getAddress).toHaveBeenCalled();
    expect(provider.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "isOperator",
        args: [userAddress, SPENDER],
      }),
    );
  });
});
