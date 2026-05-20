import { act } from "@testing-library/react";
import type { Address, TransactionPrepareRequest, TransactionResult } from "@zama-fhe/sdk";
import { describe, expect, test, vi } from "../../test-fixtures";
import { useSignAndBroadcast } from "../use-sign-and-broadcast";
import { useZamaSDK } from "../../provider";

const TOKEN = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as Address;
const USER = "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B" as Address;
const RECIPIENT = "0x8b8b8b8b8B8B8b8B8B8b8b8b8b8B8B8B8B8b8B8b" as Address;

const TX_RESULT: TransactionResult = {
  txHash: "0xtx",
  receipt: { logs: [] },
} as unknown as TransactionResult;

describe("useSignAndBroadcast", () => {
  test("default", ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() => useSignAndBroadcast());
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;

    expect(state).toEqualDefaultMutationState();
  });

  test("routes a TransactionPrepareRequest through sdk.offlineSigning.signAndBroadcast", async ({
    renderWithProviders,
  }) => {
    const { result } = renderWithProviders(() => {
      const sdk = useZamaSDK();
      const mutation = useSignAndBroadcast();
      return { sdk, mutation };
    });

    const spy = vi
      .spyOn(result.current.sdk.offlineSigning, "signAndBroadcast")
      .mockResolvedValue(TX_RESULT);

    const request: TransactionPrepareRequest = {
      kind: "ConfidentialTransfer",
      from: USER,
      token: TOKEN,
      to: RECIPIENT,
      amount: 1000n,
    };

    let value: unknown;
    await act(async () => {
      value = await result.current.mutation.mutateAsync({ request });
    });

    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0]![0]).toEqual(request);
    expect(value).toBe(TX_RESULT);
  });

  test("forwards onError from the configured options", async ({ renderWithProviders }) => {
    const onError = vi.fn();
    const { result } = renderWithProviders(() => {
      const sdk = useZamaSDK();
      const mutation = useSignAndBroadcast({ onError });
      return { sdk, mutation };
    });

    const boom = new Error("boom");
    vi.spyOn(result.current.sdk.offlineSigning, "signAndBroadcast").mockRejectedValue(boom);

    const request: TransactionPrepareRequest = {
      kind: "ConfidentialTransfer",
      from: USER,
      token: TOKEN,
      to: RECIPIENT,
      amount: 1n,
    };

    await act(async () => {
      await expect(result.current.mutation.mutateAsync({ request })).rejects.toBe(boom);
    });

    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0]![0]).toBe(boom);
  });
});
