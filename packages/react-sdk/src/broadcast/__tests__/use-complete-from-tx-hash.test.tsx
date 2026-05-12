import { act } from "@testing-library/react";
import type { PreparedFor, TransactionResult } from "@zama-fhe/sdk";
import { describe, expect, test, vi } from "../../test-fixtures";
import {
  RECIPIENT,
  TOKEN,
  USER,
  expectDefaultMutationState,
} from "../../__tests__/mutation-test-helpers";
import { useCompleteFromTxHash } from "../use-complete-from-tx-hash";
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

const TX_RESULT = { txHash: "0xtx", receipt: { logs: [] } } as unknown as TransactionResult;

describe("useCompleteFromTxHash", () => {
  test("default", ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() => useCompleteFromTxHash());
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;
    expectDefaultMutationState(state);
  });

  test("delegates to sdk.completeFromTxHash", async ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() => {
      const sdk = useZamaSDK();
      const mutation = useCompleteFromTxHash();
      return { sdk, mutation };
    });

    const spy = vi.spyOn(result.current.sdk, "completeFromTxHash").mockResolvedValue(TX_RESULT);

    let value: unknown;
    await act(async () => {
      value = await result.current.mutation.mutateAsync({
        prepared: PREPARED,
        txHash: "0xtxhash",
      });
    });

    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0]![0]).toBe(PREPARED);
    expect(spy.mock.calls[0]![1]).toBe("0xtxhash");
    expect(value).toBe(TX_RESULT);
  });
});
