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
    signer,
  }) => {
    const contracts = Array.from(
      { length: 11 },
      (_, i) => `0x${(i + 1).toString(16).padStart(40, "0")}` as const,
    );
    const { result } = renderWithProviders(() => useBatchPreparePermits());
    const signerAddress = signer!.walletAccount.getSnapshot()!.address;

    const prepared = await act(() =>
      result.current.mutateAsync({ signer: signerAddress, contracts }),
    );

    expect(signer!.signTypedData).not.toHaveBeenCalled();
    const chunks = prepared.map((p) => p.eip712.message.contractAddresses as string[]);
    expect(chunks.map((c) => c.length)).toEqual([10, 1]);
  });
});
