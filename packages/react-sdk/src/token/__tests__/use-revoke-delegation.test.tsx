import { act, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "../../test-fixtures";
import { useRevokeDelegation } from "../use-revoke-delegation";
import {
  TOKEN,
  RECIPIENT,
  expectDefaultMutationState,
} from "../../__tests__/mutation-test-helpers";

describe("useRevokeDelegation", () => {
  test("default", ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() => useRevokeDelegation({ tokenAddress: TOKEN }), {});
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;

    expectDefaultMutationState(state);
  });

  test("behavior: calls revokeDelegation with delegate", async ({
    renderWithProviders,
    signer,
  }) => {
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");

    const { result } = renderWithProviders(() => useRevokeDelegation({ tokenAddress: TOKEN }), {});

    act(() => {
      result.current.mutate({ delegateAddress: RECIPIENT });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(signer.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "revokeDelegationForUserDecryption",
      }),
    );
  });

  test("behavior: forwards onSuccess callback", async ({ renderWithProviders, signer }) => {
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");

    const onSuccess = vi.fn();

    const { result } = renderWithProviders(() =>
      useRevokeDelegation({ tokenAddress: TOKEN }, { onSuccess }),
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
      useRevokeDelegation({ tokenAddress: TOKEN }, { onSuccess }),
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
