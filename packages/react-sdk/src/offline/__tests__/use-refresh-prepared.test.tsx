import { act } from "@testing-library/react";
import type { Address, PreparedFor } from "@zama-fhe/sdk";
import { describe, expect, test, vi } from "../../test-fixtures";
import { useRefreshPrepared } from "../use-refresh-prepared";
import { useZamaSDK } from "../../provider";

const TOKEN = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as Address;
const USER = "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B" as Address;
const RECIPIENT = "0x8b8b8b8b8B8B8b8B8B8b8b8b8b8B8B8B8B8b8B8b" as Address;

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
    expect(state).toEqualDefaultMutationState();
  });

  test("delegates to sdk.offlineSigning.refresh and returns the fresh prepared", async ({
    renderWithProviders,
  }) => {
    const { result } = renderWithProviders(() => {
      const sdk = useZamaSDK();
      const mutation = useRefreshPrepared();
      return { sdk, mutation };
    });

    const spy = vi.spyOn(result.current.sdk.offlineSigning, "refresh").mockResolvedValue(FRESH);

    let value: unknown;
    await act(async () => {
      value = await result.current.mutation.mutateAsync({ preparedTx: STALE });
    });

    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0]![0]).toBe(STALE);
    expect(value).toBe(FRESH);
  });
});
