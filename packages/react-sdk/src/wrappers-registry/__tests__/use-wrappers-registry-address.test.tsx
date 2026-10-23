import { describe, expect, test, vi } from "../../test-fixtures";
import { act, waitFor } from "@testing-library/react";
import { DefaultRegistryAddresses } from "@zama-fhe/sdk";
import { useWrappersRegistryAddress } from "../use-wrappers-registry-address";

// The fixture chain (31337) has no registry; mainnet (1) has a default one.
const MAINNET_REGISTRY = DefaultRegistryAddresses[1];

describe("useWrappersRegistryAddress", () => {
  test("follows the wallet's chain, without asking the provider", async ({
    renderWithProviders,
    signer,
    provider,
  }) => {
    const { result } = renderWithProviders(() => useWrappersRegistryAddress());
    expect(result.current).toBeUndefined();

    // The wallet switches to mainnet: the store snapshot changes and subscribers are told.
    const account = signer.walletAccount.getSnapshot();
    const next = { ...account!, chainId: 1 };
    vi.mocked(signer.walletAccount.getSnapshot).mockReturnValue(next);
    act(() => {
      for (const [listener] of vi.mocked(signer.walletAccount.subscribe).mock.calls) {
        listener({ previous: account, next });
      }
    });

    await waitFor(() => expect(result.current).toBe(MAINNET_REGISTRY));
    expect(provider.getChainId).not.toHaveBeenCalled();
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
