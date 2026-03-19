import { act, waitFor } from "@testing-library/react";
import type { Address } from "@zama-fhe/sdk";
import { describe, expect, test, vi } from "../../test-fixtures";
import { useDecryptBalanceAs } from "../use-decrypt-balance-as";
import {
  TOKEN,
  RECIPIENT,
  expectDefaultMutationState,
} from "../../__tests__/mutation-test-helpers";

const ZERO_HANDLE = "0x0000000000000000000000000000000000000000000000000000000000000000" as Address;
const MAX_UINT64 = 2n ** 64n - 1n;

describe("useDecryptBalanceAs", () => {
  test("default", ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() => useDecryptBalanceAs(TOKEN));
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;

    expectDefaultMutationState(state);
  });

  test("behavior: calls decryptBalanceAs and returns balance", async ({
    renderWithProviders,
    signer,
  }) => {
    // First readContract call is getDelegationExpiry (via assertDelegationActive),
    // second is readConfidentialBalanceOf — return zero handle so decryptBalanceAs short-circuits to 0n.
    vi.mocked(signer.readContract)
      .mockResolvedValueOnce(MAX_UINT64)
      .mockResolvedValueOnce(ZERO_HANDLE);

    const { result } = renderWithProviders(() => useDecryptBalanceAs(TOKEN));

    act(() => {
      result.current.mutate({ delegatorAddress: RECIPIENT });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toBe(0n);
  });

  test("behavior: forwards onSuccess callback", async ({ renderWithProviders, signer }) => {
    vi.mocked(signer.readContract)
      .mockResolvedValueOnce(MAX_UINT64)
      .mockResolvedValueOnce(ZERO_HANDLE);

    const onSuccess = vi.fn();

    const { result } = renderWithProviders(() => useDecryptBalanceAs(TOKEN, { onSuccess }));

    act(() => {
      result.current.mutate({ delegatorAddress: RECIPIENT });
    });

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledOnce();
    });

    expect(onSuccess.mock.calls[0]?.[0]).toBe(0n);
  });
});
