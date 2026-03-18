import { act, waitFor } from "@testing-library/react";
import { describe, expect, test } from "../../test-fixtures";
import { TOKEN, USER, expectDefaultMutationState } from "../../__tests__/mutation-test-helpers";
import { useEncrypt } from "../use-encrypt";

describe("useEncrypt", () => {
  test("default", ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() => useEncrypt());
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;

    expectDefaultMutationState(state);
  });

  test("behavior: encrypts on mutate", async ({ renderWithProviders, relayer }) => {
    const { result } = renderWithProviders(() => useEncrypt());

    await act(async () => {
      result.current.mutate({
        values: [{ value: 1000n, type: "euint64" }],
        contractAddress: TOKEN,
        userAddress: USER,
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(relayer.encrypt).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual({
      handles: [new Uint8Array([1, 2, 3])],
      inputProof: new Uint8Array([4, 5, 6]),
    });
  });
});
