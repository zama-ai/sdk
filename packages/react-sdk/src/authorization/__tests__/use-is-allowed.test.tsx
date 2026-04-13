import { useQuery } from "@tanstack/react-query";
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

describe("useIsAllowed", () => {
  test("passes the shared queryKeyHashFn", ({ renderWithProviders }) => {
    vi.mocked(useQuery)
      .mockReturnValueOnce({ data: "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" } as never)
      .mockReturnValueOnce({ data: true } as never);

    renderWithProviders(() => useIsAllowed({ contractAddresses: [CONTRACT_A] }));

    expect(vi.mocked(useQuery)).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ queryKeyHashFn: hashFn }),
    );
    expect(vi.mocked(useQuery)).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        queryKeyHashFn: hashFn,
        queryKey: zamaQueryKeys.isAllowed.scope("0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a", [
          CONTRACT_A,
        ]),
      }),
    );
  });
});
