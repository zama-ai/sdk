import { describe, expect, test, vi } from "../../test-fixtures";
import { act, waitFor } from "@testing-library/react";
import { mainnet, sepolia } from "@zama-fhe/sdk/chains";
import { useWrappersRegistryAddress } from "../use-wrappers-registry-address";

// The fixture chain (31337) has no registry; mainnet and Sepolia ship with a default one.

describe("useWrappersRegistryAddress", () => {
  test("re-resolves when a wallet connects on another chain", async ({
    renderWithProviders,
    signer,
    provider,
  }) => {
    const account = signer.walletAccount.getSnapshot()!;
    // No wallet yet; the provider answers for Sepolia.
    vi.mocked(signer.walletAccount.getSnapshot).mockReturnValue(undefined);
    vi.mocked(provider.getChainId).mockResolvedValue(sepolia.id);

    const { result } = renderWithProviders(() => useWrappersRegistryAddress());
    await waitFor(() => expect(result.current).toBe(sepolia.registryAddress));

    // The wallet connects on mainnet and the provider follows it. The store is a mock,
    // so the change is replayed to its subscribers by hand.
    vi.mocked(provider.getChainId).mockResolvedValue(mainnet.id);
    const next = { ...account, chainId: mainnet.id };
    vi.mocked(signer.walletAccount.getSnapshot).mockReturnValue(next);
    act(() => {
      for (const [listener] of vi.mocked(signer.walletAccount.subscribe).mock.calls) {
        listener({ previous: undefined, next });
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
