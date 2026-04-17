import { useQuery } from "@tanstack/react-query";
import { waitFor } from "@testing-library/react";
import { hashFn, zamaQueryKeys } from "@zama-fhe/sdk/query";
import type { Address } from "@zama-fhe/sdk";
import { describe, expect, test } from "../../test-fixtures";

import { useIsAllowed } from "../use-is-allowed";

vi.mock(import("@tanstack/react-query"), async () => {
  const actual =
    await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query"); // oxlint-disable-line typescript-eslint/consistent-type-imports
  return { ...actual, useQuery: vi.fn(() => ({ data: true })) };
});

const CONTRACT_A = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address;
// Matches the USER constant in sdk/src/test-fixtures.ts used by createMockSigner
const USER_ADDRESS = "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B" as Address;

describe("useIsAllowed", () => {
  test("passes the shared queryKeyHashFn and scopes by signer address", async ({
    renderWithProviders,
  }) => {
    vi.mocked(useQuery).mockReturnValue({ data: true } as never);

    renderWithProviders(() => useIsAllowed({ contractAddresses: [CONTRACT_A] }));

    // After ZamaProvider resolves signer.getAddress() the hook re-renders with the
    // signer address in the query key.
    await waitFor(() => {
      expect(vi.mocked(useQuery)).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKeyHashFn: hashFn,
          queryKey: zamaQueryKeys.isAllowed.scope(USER_ADDRESS, [CONTRACT_A]),
        }),
      );
    });
  });
});
