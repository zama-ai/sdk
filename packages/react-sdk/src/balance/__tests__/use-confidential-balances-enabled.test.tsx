import { renderHook } from "@testing-library/react";
import type { Address } from "@zama-fhe/sdk";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useQuery } from "../../utils/query";
import { useConfidentialBalances } from "../use-confidential-balances";

const TOKEN = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as Address;
const TOKEN_B = "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B" as Address;
const OWNER = "0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C" as Address;

vi.mock("../../utils/query", async () => {
  const actual = await vi.importActual("../../utils/query");
  return { ...actual, useQuery: vi.fn() };
});

const mockSdk = {
  signer: { getAddress: vi.fn().mockResolvedValue(OWNER) },
  provider: { readContract: vi.fn() },
  createReadonlyToken: vi.fn((address: Address) => ({ address })),
};

vi.mock("../../provider", () => ({
  useZamaSDK: vi.fn(() => mockSdk),
}));

vi.mock("@zama-fhe/sdk/query", () => ({
  confidentialBalancesQueryOptions: vi.fn(() => ({
    queryKey: ["balances"],
    queryFn: vi.fn(),
    enabled: true,
  })),
  hashFn: vi.fn(),
}));

describe("useConfidentialBalances enabled propagation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useQuery).mockReturnValue({
      data: new Map<Address, bigint>(),
      fetchStatus: "idle",
    } as ReturnType<typeof useQuery>);
  });

  test("disables balance query when user passes enabled=false", () => {
    renderHook(() =>
      useConfidentialBalances(
        { tokenAddresses: [TOKEN, TOKEN_B], account: OWNER },
        { enabled: false },
      ),
    );

    const balanceQueryOptions = vi.mocked(useQuery).mock.calls[0]?.[0] as
      | { enabled?: boolean }
      | undefined;

    expect(balanceQueryOptions).toBeDefined();
    expect(balanceQueryOptions?.enabled).toBe(false);
  });

  test("disables balance query for other falsy enabled values", () => {
    renderHook(() =>
      useConfidentialBalances(
        { tokenAddresses: [TOKEN, TOKEN_B], account: OWNER },
        { enabled: 0 as unknown as boolean },
      ),
    );

    const balanceQueryOptions = vi.mocked(useQuery).mock.calls[0]?.[0] as
      | { enabled?: boolean }
      | undefined;

    expect(balanceQueryOptions?.enabled).toBeFalsy();
  });
});
