import { act } from "@testing-library/react";
import { describe, expect, test } from "../../test-fixtures";
import { usePreparePermit } from "../use-prepare-permit";

describe("usePreparePermit", () => {
  test("default", ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() => usePreparePermit());
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;

    expect(state).toEqualDefaultMutationState();
  });

  test("builds unsigned typed data without prompting the connected signer", async ({
    renderWithProviders,
    tokenAddress,
    signer,
  }) => {
    const { result } = renderWithProviders(() => usePreparePermit());
    const signerAddress = signer!.walletAccount.getSnapshot()!.address;

    const prepared = await act(() =>
      result.current.mutateAsync({ signer: signerAddress, contracts: [tokenAddress] }),
    );

    expect(signer!.signTypedData).not.toHaveBeenCalled();
    expect(prepared.version).toBe(1);
    expect(prepared.eip712.message.contractAddresses).toEqual([tokenAddress]);
    expect(prepared.eip712).toBeDefined();
  });
});
