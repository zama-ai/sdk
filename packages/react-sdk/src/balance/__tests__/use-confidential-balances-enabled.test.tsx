import { renderHook } from "@testing-library/react";
import type { Address } from "@zama-fhe/sdk";
import { vi } from "vitest";
import { beforeEach, describe, expect, test } from "../../test-fixtures";
import { useQuery } from "../../utils/query";
import { useConfidentialBalances } from "../use-confidential-balances";

const OWNER = "0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C" as Address;

vi.mock("../../utils/query", async () => {
  const actual = await vi.importActual("../../utils/query");
  return { ...actual, useQuery: vi.fn() };
});

const mockSdk = {
  signer: {
    walletAccount: { getSnapshot: vi.fn().mockReturnValue({ address: OWNER, chainId: 31337 }) },
  },
  onWalletAccountChange: vi.fn().mockReturnValue(() => {}),
  provider: { readContract: vi.fn() },
  createToken: vi.fn((address: Address) => ({ address })),
};

vi.mock("../../provider", () => ({ useZamaSDK: vi.fn(() => mockSdk) }));

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

  test("disables balance query when user passes enabled=false", ({
    tokenAddress,
    otherTokenAddress,
  }) => {
    renderHook(() =>
      useConfidentialBalances(
        { addresses: [tokenAddress, otherTokenAddress], account: OWNER },
        { enabled: false },
      ),
    );

    const balanceQueryOptions = vi.mocked(useQuery).mock.calls[0]?.[0] as
      | { enabled?: boolean }
      | undefined;

    expect(balanceQueryOptions).toBeDefined();
    expect(balanceQueryOptions?.enabled).toBe(false);
  });

  test("disables balance query for other falsy enabled values", ({
    tokenAddress,
    otherTokenAddress,
  }) => {
    renderHook(() =>
      useConfidentialBalances(
        { addresses: [tokenAddress, otherTokenAddress], account: OWNER },
        { enabled: 0 as unknown as boolean },
      ),
    );

    const balanceQueryOptions = vi.mocked(useQuery).mock.calls[0]?.[0] as
      | { enabled?: boolean }
      | undefined;

    expect(balanceQueryOptions?.enabled).toBeFalsy();
  });
});
