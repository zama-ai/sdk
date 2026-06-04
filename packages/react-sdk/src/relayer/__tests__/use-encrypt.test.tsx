import { act, waitFor } from "@testing-library/react";
import { describe, expect, test } from "../../test-fixtures";
import { useEncrypt } from "../use-encrypt";

describe("useEncrypt", () => {
  test("default", ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() => useEncrypt());
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;

    expect(state).toEqualDefaultMutationState();
  });

  test("behavior: encrypts on mutate", async ({
    renderWithProviders,
    relayer,
    tokenAddress,
    userAddress,
    handle,
    inputProof,
  }) => {
    const { result } = renderWithProviders(() => useEncrypt());

    await act(async () => {
      result.current.mutate({
        values: [{ value: 1000n, type: "euint64" }],
        contractAddress: tokenAddress,
        userAddress: userAddress,
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(relayer.encrypt).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual({
      encryptedValues: [handle],
      inputProof,
    });
  });
});
