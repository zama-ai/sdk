import { act } from "@testing-library/react";
import type {
  CredentialPermitRequest,
  TransactionPrepareRequest,
  TransactionResult,
} from "@zama-fhe/sdk";
import { describe, expect, test, vi } from "../../test-fixtures";
import {
  RECIPIENT,
  TOKEN,
  USER,
  expectDefaultMutationState,
} from "../../__tests__/mutation-test-helpers";
import { useExecute } from "../use-execute";
import { useZamaSDK } from "../../provider";

const TX_RESULT: TransactionResult = {
  txHash: "0xtx",
  receipt: { logs: [] },
} as unknown as TransactionResult;

const PERMIT_RESULT = {
  contracts: [TOKEN],
  durationDays: 30,
  startTimestamp: 1700000000,
} as const;

describe("useExecute", () => {
  test("default", ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() => useExecute());
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;

    expectDefaultMutationState(state);
  });

  test("routes a TransactionPrepareRequest through sdk.execute", async ({
    renderWithProviders,
  }) => {
    const { result } = renderWithProviders(() => {
      const sdk = useZamaSDK();
      const mutation = useExecute();
      return { sdk, mutation };
    });

    const spy = vi.spyOn(result.current.sdk, "execute").mockResolvedValue(TX_RESULT);

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

  test("routes a CredentialPermitRequest through sdk.execute", async ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() => {
      const sdk = useZamaSDK();
      const mutation = useExecute();
      return { sdk, mutation };
    });

    const spy = vi
      .spyOn(result.current.sdk, "execute")
      // CredentialPermitResult subset suffices for the runtime path.
      .mockResolvedValue(PERMIT_RESULT as unknown as TransactionResult);

    const request: CredentialPermitRequest = {
      kind: "CredentialPermit",
      from: USER,
      contracts: [TOKEN],
    };

    let value: unknown;
    await act(async () => {
      value = await result.current.mutation.mutateAsync({ request });
    });

    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0]![0]).toEqual(request);
    expect(value).toBe(PERMIT_RESULT);
  });

  test("forwards onError from the configured options", async ({ renderWithProviders }) => {
    const onError = vi.fn();
    const { result } = renderWithProviders(() => {
      const sdk = useZamaSDK();
      const mutation = useExecute({ onError });
      return { sdk, mutation };
    });

    const boom = new Error("boom");
    vi.spyOn(result.current.sdk, "execute").mockRejectedValue(boom);

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
