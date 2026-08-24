import { act } from "@testing-library/react";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import { describe, expect, test, vi } from "../../test-fixtures";
import { usePreparePermit } from "../use-prepare-permit";
import { useRegisterPermit } from "../use-register-permit";

describe("useRegisterPermit", () => {
  test("default", ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() => useRegisterPermit());
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;

    expect(state).toEqualDefaultMutationState();
  });

  test("verifies and persists a signed permit, then removes the hasPermit cache", async ({
    renderWithProviders,
    tokenAddress,
    signer,
  }) => {
    const { result, queryClient } = renderWithProviders(() => ({
      prepare: usePreparePermit(),
      register: useRegisterPermit(),
    }));
    queryClient.setQueryData(zamaQueryKeys.hasPermit.all, true);

    const signerAddress = signer!.walletAccount.getSnapshot()!.address;
    const prepared = await act(() =>
      result.current.prepare.mutateAsync({ signer: signerAddress, contracts: [tokenAddress] }),
    );
    const signature = await signer!.signTypedData(prepared.eip712);

    await act(() => result.current.register.mutateAsync({ prepared, signature }));

    expect(queryClient).toHaveCacheRemoved(zamaQueryKeys.hasPermit.all);
  });

  test("forwards onSuccess callback", async ({ renderWithProviders, tokenAddress, signer }) => {
    const onSuccess = vi.fn();
    const { result } = renderWithProviders(() => ({
      prepare: usePreparePermit(),
      register: useRegisterPermit({ onSuccess }),
    }));

    const signerAddress = signer!.walletAccount.getSnapshot()!.address;
    const prepared = await act(() =>
      result.current.prepare.mutateAsync({ signer: signerAddress, contracts: [tokenAddress] }),
    );
    const signature = await signer!.signTypedData(prepared.eip712);
    await act(() => result.current.register.mutateAsync({ prepared, signature }));

    expect(onSuccess).toHaveBeenCalledOnce();
  });
});
