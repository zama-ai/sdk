import { describe, expect, test, vi } from "../../test-fixtures";
import { renderHook, waitFor } from "@testing-library/react";
import type { Address } from "@zama-fhe/sdk";
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

  test("behavior: spender undefined -> defined", async ({ createWrapper, signer }) => {
    vi.mocked(signer.readContract).mockResolvedValue(true);

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

  test("behavior: tokenAddress undefined -> defined", async ({ createWrapper, signer }) => {
    vi.mocked(signer.readContract).mockResolvedValue(true);

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

  test("behavior: disabled when user passes enabled=false", ({ renderWithProviders, signer }) => {
    vi.mocked(signer.readContract).mockResolvedValue(true);

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

  test("default", async ({ renderWithProviders, signer }) => {
    vi.mocked(signer.readContract).mockResolvedValue(true);

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
    expect(signer.readContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "isOperator", address: TOKEN }),
    );
  });

  test("skips signer resolution when holder is provided", async ({
    renderWithProviders,
    signer,
  }) => {
    vi.mocked(signer.readContract).mockResolvedValue(true);

    const { result } = renderWithProviders(() =>
      useConfidentialIsApproved({
        tokenAddress: TOKEN,
        spender: SPENDER,
        holder: "0x4D4d4D4d4d4D4D4d4D4D4D4d4d4d4d4D4D4d4d4D",
      }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(signer.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "isOperator",
        args: ["0x4D4d4D4d4d4D4D4d4D4D4D4d4d4d4d4D4D4d4d4D", SPENDER],
      }),
    );
  });
});

describe("useConfidentialIsApprovedSuspense", () => {
  test("skips signer resolution when holder is provided", async ({
    renderWithProviders,
    signer,
  }) => {
    vi.mocked(signer.readContract).mockResolvedValue(true);

    const { result } = renderWithProviders(() =>
      useConfidentialIsApprovedSuspense({
        tokenAddress: TOKEN,
        spender: SPENDER,
        holder: "0x4D4d4D4d4d4D4D4d4D4D4D4d4d4d4d4D4D4d4d4D",
      }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(signer.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "isOperator",
        args: ["0x4D4d4D4d4d4D4D4d4D4D4D4d4d4d4d4D4D4d4d4D", SPENDER],
      }),
    );
  });
});
