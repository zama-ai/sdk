import { act } from "@testing-library/react";
import type { PreparedFor } from "@zama-fhe/sdk";
import { describe, expect, test, vi } from "../../test-fixtures";
import {
  RECIPIENT,
  TOKEN,
  USER,
  expectDefaultMutationState,
} from "../../__tests__/mutation-test-helpers";
import { useSign } from "../use-sign";
import { useZamaSDK } from "../../provider";

const PREPARED: PreparedFor<"ConfidentialTransfer"> = {
  kind: "ConfidentialTransfer",
  request: {
    kind: "ConfidentialTransfer",
    from: USER,
    token: TOKEN,
    to: RECIPIENT,
    amount: 1n,
  },
  unsignedTx: "0xabcd",
  from: USER,
  to: TOKEN,
  chainId: 31337,
};

describe("useSign", () => {
  test("default", ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() => useSign());
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;
    expectDefaultMutationState(state);
  });

  test("delegates to sdk.sign and returns signed bytes", async ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() => {
      const sdk = useZamaSDK();
      const mutation = useSign();
      return { sdk, mutation };
    });

    const spy = vi.spyOn(result.current.sdk, "sign").mockResolvedValue("0xsigned");

    let value: unknown;
    await act(async () => {
      value = await result.current.mutation.mutateAsync({ prepared: PREPARED });
    });

    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0]![0]).toBe(PREPARED);
    expect(value).toBe("0xsigned");
  });
});
