import { act } from "@testing-library/react";
import type { Address, PreparedFor, TransactionResult } from "@zama-fhe/sdk";
import { describe, expect, test, vi } from "../../test-fixtures";
import { useBroadcast } from "../use-broadcast";
import { useZamaSDK } from "../../provider";

const TOKEN = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as Address;
const USER = "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B" as Address;
const RECIPIENT = "0x8b8b8b8b8B8B8b8B8B8b8b8b8b8B8B8B8B8b8B8b" as Address;

const PREPARED: PreparedFor<"ConfidentialTransfer"> = {
  kind: "ConfidentialTransfer",
  request: { kind: "ConfidentialTransfer", from: USER, token: TOKEN, to: RECIPIENT, amount: 1n },
  unsignedTx: "0xabcd",
  from: USER,
  to: TOKEN,
  chainId: 31337,
};

const TX_RESULT = { txHash: "0xtx", receipt: { logs: [] } } as unknown as TransactionResult;

describe("useBroadcast", () => {
  test("default", ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() => useBroadcast());
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;
    expect(state).toEqualDefaultMutationState();
  });

  test("delegates to sdk.offlineSigning.broadcast and returns the receipt", async ({
    renderWithProviders,
  }) => {
    const { result } = renderWithProviders(() => {
      const sdk = useZamaSDK();
      const mutation = useBroadcast();
      return { sdk, mutation };
    });

    const spy = vi
      .spyOn(result.current.sdk.offlineSigning, "broadcast")
      .mockResolvedValue(TX_RESULT);

    let value: unknown;
    await act(async () => {
      value = await result.current.mutation.mutateAsync({
        preparedTx: PREPARED,
        signedTx: "0xsigned",
      });
    });

    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0]![0]).toBe(PREPARED);
    expect(spy.mock.calls[0]![1]).toBe("0xsigned");
    expect(value).toBe(TX_RESULT);
  });
});
