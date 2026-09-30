import { act } from "@testing-library/react";
import { describe, expect, test } from "../../test-fixtures";
import { useBatchPreparePermits } from "../use-batch-prepare-permits";

describe("useBatchPreparePermits", () => {
  test("default", ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() => useBatchPreparePermits());
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;

    expect(state).toEqualDefaultMutationState();
  });

  test("returns one unsigned permit per chunk without prompting the connected signer", async ({
    renderWithProviders,
    tokenAddress,
    signer,
  }) => {
    const { result } = renderWithProviders(() => useBatchPreparePermits());
    const signerAddress = signer!.walletAccount.getSnapshot()!.address;

    const prepared = await act(() =>
      result.current.mutateAsync({ signer: signerAddress, contracts: [tokenAddress] }),
    );

    expect(signer!.signTypedData).not.toHaveBeenCalled();
    expect(prepared).toHaveLength(1);
    expect(prepared[0]!.eip712.message.contractAddresses).toEqual([tokenAddress]);
  });
});
