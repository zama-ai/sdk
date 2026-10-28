import { describe, expect, test, vi } from "../../test-fixtures";
import { act, waitFor } from "@testing-library/react";
import { DefaultRegistryAddresses } from "@zama-fhe/sdk";
import { useWrappersRegistryAddress } from "../use-wrappers-registry-address";

// The fixture chain (31337) has no registry; mainnet (1) has a default one.
const MAINNET_REGISTRY = DefaultRegistryAddresses[1];

describe("useWrappersRegistryAddress", () => {
  test("refetches the provider's chain when the wallet switches", async ({
    renderWithProviders,
    signer,
    provider,
  }) => {
    const { result } = renderWithProviders(() => useWrappersRegistryAddress());
    await waitFor(() => expect(provider.getChainId).toHaveBeenCalled());
    expect(result.current).toBeUndefined();
    const callsBeforeSwitch = vi.mocked(provider.getChainId).mock.calls.length;

    // The wallet switches to mainnet and the provider follows: the snapshot changes and
    // subscribers are told.
    vi.mocked(provider.getChainId).mockResolvedValue(1);
    const account = signer.walletAccount.getSnapshot();
    const next = { ...account!, chainId: 1 };
    vi.mocked(signer.walletAccount.getSnapshot).mockReturnValue(next);
    act(() => {
      for (const [listener] of vi.mocked(signer.walletAccount.subscribe).mock.calls) {
        listener({ previous: account, next });
      }
    });

    await waitFor(() => expect(result.current).toBe(MAINNET_REGISTRY));
    expect(vi.mocked(provider.getChainId).mock.calls.length).toBeGreaterThan(callsBeforeSwitch);
  });

  test("resolves from the provider's chain when it differs from the wallet's", async ({
    renderWithProviders,
    provider,
  }) => {
    // The wallet sits on the fixture chain while the provider is pinned to mainnet.
    vi.mocked(provider.getChainId).mockResolvedValue(1);

    const { result } = renderWithProviders(() => useWrappersRegistryAddress());

    await waitFor(() => expect(result.current).toBe(MAINNET_REGISTRY));
  });

  test("falls back to the provider's chain without a wallet", async ({
    renderWithProviders,
    provider,
  }) => {
    vi.mocked(provider.getChainId).mockResolvedValue(1);

    const { result } = renderWithProviders(() => useWrappersRegistryAddress(), {
      signer: undefined,
    });

    await waitFor(() => expect(result.current).toBe(MAINNET_REGISTRY));
  });
});
