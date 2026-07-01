import { useQuery } from "@tanstack/react-query";
import { waitFor } from "@testing-library/react";
import type { Address, GenericSigner } from "@zama-fhe/sdk";
import { hashFn, zamaQueryKeys } from "@zama-fhe/sdk/query";
import { vi } from "vitest";
import { describe, expect, test } from "../../test-fixtures";

import { useHasPermit } from "../use-has-permit";

const CONTRACT_A = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address;
const SIGNER_ADDRESS = "0x1111111111111111111111111111111111111111" as Address;
const CHAIN_ID = 31337;

vi.mock(import("@tanstack/react-query"), async () => {
  // oxlint-disable-next-line typescript/consistent-type-imports
  type ReactQuery = typeof import("@tanstack/react-query");
  const actual = await vi.importActual<ReactQuery>("@tanstack/react-query"); // oxlint-disable-line typescript-eslint/consistent-type-imports
  return { ...actual, useQuery: vi.fn() };
});

function makeSigner(): GenericSigner {
  const walletAccount = { address: SIGNER_ADDRESS, chainId: CHAIN_ID };
  return {
    walletAccount: {
      getSnapshot: vi.fn().mockReturnValue(walletAccount),
      subscribe: vi.fn((listener) => {
        listener({ previous: undefined, next: walletAccount });
        return () => {};
      }),
    },
    requireWalletAccount: vi.fn().mockReturnValue(walletAccount),
    signTypedData: vi.fn(),
    writeContract: vi.fn(),
  } as unknown as GenericSigner;
}

describe("useHasPermit", () => {
  test("uses a minimal uncached query keyed by contract addresses", async ({
    renderWithProviders,
  }) => {
    vi.mocked(useQuery).mockReturnValue({ data: true } as never);
    const signer = makeSigner();

    renderWithProviders(() => useHasPermit({ contractAddresses: [CONTRACT_A] }), { signer });

    await waitFor(() => {
      expect(vi.mocked(useQuery)).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKeyHashFn: hashFn,
          queryKey: zamaQueryKeys.hasPermit.scope([CONTRACT_A], signer.walletAccount.getSnapshot()),
          enabled: true,
          staleTime: 0,
          gcTime: 0,
        }),
      );
    });
  });

  test("is disabled when no signer is configured", async ({ renderWithProviders }) => {
    vi.mocked(useQuery).mockReturnValue({ data: undefined } as never);

    renderWithProviders(() => useHasPermit({ contractAddresses: [CONTRACT_A] }), {
      signer: undefined,
    });

    await waitFor(() => {
      expect(vi.mocked(useQuery)).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: zamaQueryKeys.hasPermit.scope([CONTRACT_A]),
          enabled: false,
        }),
      );
    });
  });

  test("is disabled when options.enabled is false, even with a signer", async ({
    renderWithProviders,
  }) => {
    vi.mocked(useQuery).mockReturnValue({ data: undefined } as never);
    const signer = makeSigner();

    renderWithProviders(
      () => useHasPermit({ contractAddresses: [CONTRACT_A] }, { enabled: false }),
      { signer },
    );

    await waitFor(() => {
      expect(vi.mocked(useQuery)).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: zamaQueryKeys.hasPermit.scope([CONTRACT_A], signer.walletAccount.getSnapshot()),
          enabled: false,
        }),
      );
    });
  });

  test("is disabled when the contract list is empty", async ({ renderWithProviders }) => {
    vi.mocked(useQuery).mockReturnValue({ data: undefined } as never);
    const signer = makeSigner();

    renderWithProviders(() => useHasPermit({ contractAddresses: [] }), { signer });

    await waitFor(() => {
      expect(vi.mocked(useQuery)).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
    });
  });
});
