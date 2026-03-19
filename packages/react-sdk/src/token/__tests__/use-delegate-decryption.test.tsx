import { act, waitFor } from "@testing-library/react";
import type { Address } from "@zama-fhe/sdk";
import { describe, expect, test, vi } from "../../test-fixtures";
import { useDelegateDecryption } from "../use-delegate-decryption";
import {
  TOKEN,
  RECIPIENT,
  expectDefaultMutationState,
} from "../../__tests__/mutation-test-helpers";

const ACL = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address;

describe("useDelegateDecryption", () => {
  test("default", ({ renderWithProviders }) => {
    const { result } = renderWithProviders(
      () => useDelegateDecryption({ tokenAddress: TOKEN }),
      {},
    );
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;

    expectDefaultMutationState(state);
  });

  test("behavior: calls delegateDecryption with delegate", async ({
    renderWithProviders,
    signer,
  }) => {
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");

    const { result } = renderWithProviders(
      () => useDelegateDecryption({ tokenAddress: TOKEN }),
      {},
    );

    act(() => {
      result.current.mutate({ delegateAddress: RECIPIENT });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(signer.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: ACL,
        functionName: "delegateForUserDecryption",
      }),
    );
  });

  test("behavior: passes expiration options", async ({ renderWithProviders, signer }) => {
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");

    const { result } = renderWithProviders(
      () => useDelegateDecryption({ tokenAddress: TOKEN }),
      {},
    );

    const expirationDate = new Date("2030-01-01T00:00:00Z");
    act(() => {
      result.current.mutate({ delegateAddress: RECIPIENT, expirationDate });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(signer.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        args: [RECIPIENT, TOKEN, BigInt(Math.floor(expirationDate.getTime() / 1000))],
      }),
    );
  });

  test("behavior: forwards onSuccess callback", async ({ renderWithProviders, signer }) => {
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");

    const onSuccess = vi.fn();

    const { result } = renderWithProviders(() =>
      useDelegateDecryption({ tokenAddress: TOKEN }, { onSuccess }),
    );

    act(() => {
      result.current.mutate({ delegateAddress: RECIPIENT });
    });

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledOnce();
    });
  });

  test("behavior: onSuccess fires before cache invalidation", async ({
    renderWithProviders,
    signer,
  }) => {
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");

    const order: string[] = [];
    const onSuccess = vi.fn(() => order.push("onSuccess"));

    const { result, queryClient } = renderWithProviders(() =>
      useDelegateDecryption({ tokenAddress: TOKEN }, { onSuccess }),
    );

    const originalInvalidateQueries = queryClient.invalidateQueries.bind(queryClient);
    vi.spyOn(queryClient, "invalidateQueries").mockImplementation((...args) => {
      order.push("invalidateQueries");
      return originalInvalidateQueries(...args);
    });

    act(() => {
      result.current.mutate({ delegateAddress: RECIPIENT });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(order).toEqual(["onSuccess", "invalidateQueries"]);
  });
});
