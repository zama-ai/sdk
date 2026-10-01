import { act } from "@testing-library/react";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../../provider";
import { describe, expect, test, vi } from "../../test-fixtures";
import { useBatchPreparePermits } from "../use-batch-prepare-permits";
import { useBatchRegisterPermits } from "../use-batch-register-permits";

describe("useBatchRegisterPermits", () => {
  test("default", ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() => useBatchRegisterPermits());
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;

    expect(state).toEqualDefaultMutationState();
  });

  test("registers every signed permit, then removes the hasPermit cache", async ({
    renderWithProviders,
    signer,
  }) => {
    const contracts = Array.from(
      { length: 11 },
      (_, i) => `0x${(i + 1).toString(16).padStart(40, "0")}` as const,
    );
    const onSuccess = vi.fn();
    const { result, queryClient } = renderWithProviders(() => ({
      sdk: useZamaSDK(),
      prepare: useBatchPreparePermits(),
      register: useBatchRegisterPermits({ onSuccess }),
    }));
    queryClient.setQueryData(zamaQueryKeys.hasPermit.all, true);

    const signerAddress = signer!.walletAccount.getSnapshot()!.address;
    const prepared = await act(() =>
      result.current.prepare.mutateAsync({ signer: signerAddress, contracts }),
    );
    const signed = await Promise.all(
      prepared.map(async (p) => ({
        prepared: p,
        signature: await signer!.signTypedData(p.eip712),
      })),
    );
    expect(signed).toHaveLength(2);

    await act(() => result.current.register.mutateAsync(signed));

    expect(onSuccess).toHaveBeenCalledOnce();
    expect(queryClient).toHaveCacheRemoved(zamaQueryKeys.hasPermit.all);
    await expect(result.current.sdk.permits.hasPermit(contracts)).resolves.toBe(true);
  });

  test("keeps the hasPermit cache when a later permit fails to register", async ({
    renderWithProviders,
    tokenAddress,
    signer,
  }) => {
    const onSuccess = vi.fn();
    const { result, queryClient } = renderWithProviders(() => ({
      prepare: useBatchPreparePermits(),
      register: useBatchRegisterPermits({ onSuccess }),
    }));
    queryClient.setQueryData(zamaQueryKeys.hasPermit.all, true);

    const signerAddress = signer!.walletAccount.getSnapshot()!.address;
    const [prepared] = await act(() =>
      result.current.prepare.mutateAsync({ signer: signerAddress, contracts: [tokenAddress] }),
    );
    const signature = await signer!.signTypedData(prepared!.eip712);
    const wrongChain = {
      ...prepared!,
      eip712: { ...prepared!.eip712, domain: { ...prepared!.eip712.domain, chainId: "999999" } },
    };

    await expect(
      act(() =>
        result.current.register.mutateAsync([
          { prepared: prepared!, signature },
          { prepared: wrongChain, signature },
        ]),
      ),
    ).rejects.toThrow();

    expect(onSuccess).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(zamaQueryKeys.hasPermit.all)).toBe(true);
  });
});
