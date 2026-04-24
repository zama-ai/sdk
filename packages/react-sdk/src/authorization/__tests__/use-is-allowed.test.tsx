import { useQuery } from "@tanstack/react-query";
import { waitFor } from "@testing-library/react";
import { hashFn, zamaQueryKeys } from "@zama-fhe/sdk/query";
import type { Address, GenericSigner } from "@zama-fhe/sdk";
import { describe, expect, test } from "../../test-fixtures";

import { useIsAllowed } from "../use-is-allowed";

const CONTRACT_A = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address;
const SIGNER_ADDRESS = "0x1111111111111111111111111111111111111111" as Address;
const CHAIN_ID = 31337;

vi.mock(import("@tanstack/react-query"), async () => {
  const actual =
    await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query"); // oxlint-disable-line typescript-eslint/consistent-type-imports
  return { ...actual, useQuery: vi.fn() };
});

function makeSigner(): GenericSigner {
  return {
    getAddress: vi.fn().mockResolvedValue(SIGNER_ADDRESS),
    getChainId: vi.fn().mockResolvedValue(CHAIN_ID),
    signTypedData: vi.fn(),
    writeContract: vi.fn(),
  } as unknown as GenericSigner;
}

describe("useIsAllowed", () => {
  test("uses a minimal uncached query keyed by contract addresses", async ({
    renderWithProviders,
  }) => {
    vi.mocked(useQuery).mockReturnValue({ data: true } as never);
    const signer = makeSigner();

    renderWithProviders(() => useIsAllowed({ contractAddresses: [CONTRACT_A] }), { signer });

    await waitFor(() => {
      expect(vi.mocked(useQuery)).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKeyHashFn: hashFn,
          queryKey: zamaQueryKeys.isAllowed.scope([CONTRACT_A]),
          enabled: true,
          staleTime: 0,
          gcTime: 0,
        }),
      );
    });
  });

  test("is disabled when no signer is configured", async ({ renderWithProviders }) => {
    vi.mocked(useQuery).mockReturnValue({ data: undefined } as never);

    renderWithProviders(() => useIsAllowed({ contractAddresses: [CONTRACT_A] }), {
      signer: undefined,
    });

    await waitFor(() => {
      expect(vi.mocked(useQuery)).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: zamaQueryKeys.isAllowed.scope([CONTRACT_A]),
          enabled: false,
        }),
      );
    });
  });
});
