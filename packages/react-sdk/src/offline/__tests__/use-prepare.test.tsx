import { act } from "@testing-library/react";
import type { Address, PreparedFor, TransactionPrepareRequest } from "@zama-fhe/sdk";
import { describe, expect, test, vi } from "../../test-fixtures";
import { usePrepare } from "../use-prepare";
import { useZamaSDK } from "../../provider";

const TOKEN = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as Address;
const USER = "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B" as Address;
const RECIPIENT = "0x8b8b8b8b8B8B8b8B8B8b8b8b8b8B8B8B8B8b8B8b" as Address;

const PREPARED: PreparedFor<"ConfidentialTransfer"> = {
  kind: "ConfidentialTransfer",
  request: {
    kind: "ConfidentialTransfer",
    from: USER,
    token: TOKEN,
    to: RECIPIENT,
    amount: 1000n,
  },
  unsignedTx: "0xabcd",
  from: USER,
  to: TOKEN,
  chainId: 31337,
};

describe("usePrepare", () => {
  test("default", ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() => usePrepare());
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;
    expect(state).toEqualDefaultMutationState();
  });

  test("delegates to sdk.offline.prepare with the request and options", async ({
    renderWithProviders,
  }) => {
    const { result } = renderWithProviders(() => {
      const sdk = useZamaSDK();
      const mutation = usePrepare();
      return { sdk, mutation };
    });

    const spy = vi
      .spyOn(result.current.sdk.offline, "prepare")
      .mockResolvedValue(PREPARED as never);

    const request: TransactionPrepareRequest = {
      kind: "ConfidentialTransfer",
      from: USER,
      token: TOKEN,
      to: RECIPIENT,
      amount: 1000n,
    };

    let value: unknown;
    await act(async () => {
      value = await result.current.mutation.mutateAsync({
        request,
        options: { nonce: 7 },
      });
    });

    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0]![0]).toEqual(request);
    expect(spy.mock.calls[0]![1]).toEqual({ nonce: 7 });
    expect(value).toBe(PREPARED);
  });
});
