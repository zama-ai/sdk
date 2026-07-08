import { describe, expect, test, vi } from "../../test-fixtures";
import { renderHook, waitFor } from "@testing-library/react";
import type { Address } from "viem";
import {
  useConfidentialIsOperator,
  useConfidentialIsOperatorSuspense,
} from "../use-confidential-is-operator";
const HOLDER = "0x4D4d4D4d4d4D4D4d4D4D4D4d4d4d4d4D4D4d4d4D" as Address;

describe("useConfidentialIsOperator", () => {
  test("behavior: disabled when tokenAddress is undefined", ({
    renderWithProviders,
    spenderAddress,
  }) => {
    const { result } = renderWithProviders(() =>
      useConfidentialIsOperator({ address: undefined, spender: spenderAddress, holder: HOLDER }),
    );

    expect(result.current.isPending).toBe(true);
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.data).toBeUndefined();
  });

  test("behavior: disabled when spender is undefined", ({ renderWithProviders, tokenAddress }) => {
    const { result } = renderWithProviders(() =>
      useConfidentialIsOperator({ address: tokenAddress, spender: undefined, holder: HOLDER }),
    );

    expect(result.current.isPending).toBe(true);
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.data).toBeUndefined();
  });

  test("behavior: disabled when holder is undefined (signer-less mount)", ({
    renderWithProviders,
    provider,
    spenderAddress,
    tokenAddress,
  }) => {
    const { result } = renderWithProviders(() =>
      useConfidentialIsOperator({
        address: tokenAddress,
        spender: spenderAddress,
        holder: undefined,
      }),
    );

    expect(result.current.isPending).toBe(true);
    expect(result.current.fetchStatus).toBe("idle");
    expect(provider.readContract).not.toHaveBeenCalled();
  });

  test("behavior: spender undefined -> defined", async ({
    createWrapper,
    signer,
    provider,
    spenderAddress,
    tokenAddress,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValue(true);

    const ctx = createWrapper({ signer });
    const { result, rerender } = renderHook(
      ({ spender }) =>
        useConfidentialIsOperator({ address: tokenAddress, spender, holder: HOLDER }),
      { wrapper: ctx.Wrapper, initialProps: { spender: undefined as Address | undefined } },
    );

    expect(result.current.isPending).toBe(true);
    expect(result.current.fetchStatus).toBe("idle");

    rerender({ spender: spenderAddress });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(true);
  });

  test("behavior: tokenAddress undefined -> defined", async ({
    createWrapper,
    signer,
    provider,
    spenderAddress,
    tokenAddress,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValue(true);

    const ctx = createWrapper({ signer });
    const { result, rerender } = renderHook(
      ({ address }) =>
        useConfidentialIsOperator({
          address: address as Address,
          spender: spenderAddress,
          holder: HOLDER,
        }),
      { wrapper: ctx.Wrapper, initialProps: { address: undefined as Address | undefined } },
    );

    expect(result.current.isPending).toBe(true);
    expect(result.current.fetchStatus).toBe("idle");

    rerender({ address: tokenAddress });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(true);
  });

  test("behavior: disabled when user passes enabled=false", ({
    renderWithProviders,
    provider,
    spenderAddress,
    tokenAddress,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValue(true);

    const { result } = renderWithProviders(() =>
      useConfidentialIsOperator(
        { address: tokenAddress, spender: spenderAddress, holder: HOLDER },
        { enabled: false },
      ),
    );

    expect(result.current.isPending).toBe(true);
    expect(result.current.fetchStatus).toBe("idle");
  });

  test("default", async ({ renderWithProviders, provider, spenderAddress, tokenAddress }) => {
    vi.mocked(provider.readContract).mockResolvedValue(true);

    const { result } = renderWithProviders(() =>
      useConfidentialIsOperator({ address: tokenAddress, spender: spenderAddress, holder: HOLDER }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const { data, dataUpdatedAt } = result.current;
    expect(data).toBe(true);
    expect(dataUpdatedAt).toEqual(expect.any(Number));
    expect(provider.readContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "isOperator", address: tokenAddress }),
    );
  });

  test("uses caller-supplied holder verbatim — never resolves signer address", async ({
    renderWithProviders,
    signer,
    provider,
    spenderAddress,
    tokenAddress,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValue(true);
    vi.mocked(signer.requireWalletAccount).mockClear();

    const { result } = renderWithProviders(() =>
      useConfidentialIsOperator({ address: tokenAddress, spender: spenderAddress, holder: HOLDER }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(provider.readContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "isOperator", args: [HOLDER, spenderAddress] }),
    );
    expect(signer.requireWalletAccount).not.toHaveBeenCalled();
  });
});

describe("useConfidentialIsOperatorSuspense", () => {
  test("uses the caller-supplied holder address", async ({
    renderWithProviders,
    provider,
    spenderAddress,
    tokenAddress,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValue(true);

    const { result } = renderWithProviders(() =>
      useConfidentialIsOperatorSuspense({
        address: tokenAddress,
        spender: spenderAddress,
        holder: HOLDER,
      }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(provider.readContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "isOperator", args: [HOLDER, spenderAddress] }),
    );
  });

  test("queries the caller-supplied holder verbatim, independent of the connected signer", async ({
    renderWithProviders,
    provider,
    spenderAddress,
    tokenAddress,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValue(true);

    const OTHER = "0x9C9c9c9c9c9c9C9c9c9C9C9c9c9C9c9c9c9c9C9c" as Address;
    const { result } = renderWithProviders(() =>
      useConfidentialIsOperatorSuspense({
        address: tokenAddress,
        spender: spenderAddress,
        holder: OTHER,
      }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(true);
    expect(provider.readContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "isOperator", args: [OTHER, spenderAddress] }),
    );
  });
});
