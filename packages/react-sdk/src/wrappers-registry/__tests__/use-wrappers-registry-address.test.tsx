import { describe, expect, test, vi } from "../../test-fixtures";
import { act, waitFor } from "@testing-library/react";
import { mainnet, sepolia } from "@zama-fhe/sdk/chains";
import { useWrappersRegistryAddress } from "../use-wrappers-registry-address";

// The fixture chain (31337) has no registry; mainnet and Sepolia ship with a default one.

describe("useWrappersRegistryAddress", () => {
  test("re-resolves from the provider when the wallet switches chain", async ({
    renderWithProviders,
    signer,
    provider,
  }) => {
    const { result } = renderWithProviders(() => useWrappersRegistryAddress());
    await waitFor(() => expect(provider.getChainId).toHaveBeenCalledTimes(1));
    expect(result.current).toBeUndefined();

    // The store is a mock, so the switch is replayed to its subscribers by hand.
    vi.mocked(provider.getChainId).mockResolvedValue(mainnet.id);
    const account = signer.walletAccount.getSnapshot();
    const next = { ...account!, chainId: mainnet.id };
    vi.mocked(signer.walletAccount.getSnapshot).mockReturnValue(next);
    act(() => {
      for (const [listener] of vi.mocked(signer.walletAccount.subscribe).mock.calls) {
        listener({ previous: account, next });
      }
    });

    await waitFor(() => expect(result.current).toBe(mainnet.registryAddress));
  });

  test("resolves the provider's chain, the one registry reads use", async ({
    renderWithProviders,
    provider,
  }) => {
    // The fixture wallet sits on 31337; the provider answers for Sepolia.
    vi.mocked(provider.getChainId).mockResolvedValue(sepolia.id);

    const { result } = renderWithProviders(() => useWrappersRegistryAddress());

    await waitFor(() => expect(result.current).toBe(sepolia.registryAddress));
  });

  test("resolves without a wallet", async ({ renderWithProviders, provider }) => {
    vi.mocked(provider.getChainId).mockResolvedValue(mainnet.id);

    const { result } = renderWithProviders(() => useWrappersRegistryAddress(), {
      signer: undefined,
    });

    await waitFor(() => expect(result.current).toBe(mainnet.registryAddress));
  });
});
