import { act } from "@testing-library/react";
import type { PreparedFor } from "@zama-fhe/sdk";
import { describe, expect, test, vi } from "../../test-fixtures";
import {
  RECIPIENT,
  TOKEN,
  USER,
  expectDefaultMutationState,
} from "../../__tests__/mutation-test-helpers";
import { useRefreshPrepared } from "../use-refresh-prepared";
import { useZamaSDK } from "../../provider";

const STALE: PreparedFor<"ConfidentialTransfer"> = {
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

const FRESH: PreparedFor<"ConfidentialTransfer"> = {
  ...STALE,
  unsignedTx: "0xfresh",
};

describe("useRefreshPrepared", () => {
  test("default", ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() => useRefreshPrepared());
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;
    expectDefaultMutationState(state);
  });

  test("delegates to sdk.offline.refreshPrepared and returns the fresh prepared", async ({
    renderWithProviders,
  }) => {
    const { result } = renderWithProviders(() => {
      const sdk = useZamaSDK();
      const mutation = useRefreshPrepared();
      return { sdk, mutation };
    });

    const spy = vi.spyOn(result.current.sdk.offline, "refreshPrepared").mockResolvedValue(FRESH);

    let value: unknown;
    await act(async () => {
      value = await result.current.mutation.mutateAsync({ prepared: STALE });
    });

    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0]![0]).toBe(STALE);
    expect(value).toBe(FRESH);
  });
});
