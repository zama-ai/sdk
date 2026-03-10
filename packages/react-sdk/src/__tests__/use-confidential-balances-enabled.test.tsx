import { renderHook } from "@testing-library/react";
import { useQuery } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import { signerAddressQueryOptions } from "@zama-fhe/sdk/query";
import { vi } from "vitest";
import { beforeEach, describe, expect, test } from "../test-fixtures";
import { useConfidentialBalances } from "../token/use-confidential-balances";

const TOKEN = "0x1111111111111111111111111111111111111111" as Address;
const TOKEN_B = "0x2222222222222222222222222222222222222222" as Address;
const OWNER = "0x3333333333333333333333333333333333333333" as Address;
const HANDLE_A = `0x${"aa".repeat(32)}` as Address;
const HANDLE_B = `0x${"bb".repeat(32)}` as Address;

vi.mock("@tanstack/react-query", async () => {
  const actual =
    await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query");
  return { ...actual, useQuery: vi.fn() };
});

vi.mock("../provider", () => ({
  useZamaSDK: vi.fn(() => ({
    signer: { getAddress: vi.fn().mockResolvedValue(OWNER) },
    createReadonlyToken: vi.fn((address: Address) => ({ address })),
  })),
}));

vi.mock("@zama-fhe/sdk/query", () => ({
  confidentialBalancesQueryOptions: vi.fn(() => ({
    queryKey: ["balances"],
    queryFn: vi.fn(),
    enabled: true,
  })),
  confidentialHandlesQueryOptions: vi.fn(() => ({
    queryKey: ["handles"],
    queryFn: vi.fn(),
    enabled: true,
  })),
  signerAddressQueryOptions: vi.fn(() => ({
    queryKey: ["signerAddress"],
    queryFn: vi.fn(),
    enabled: true,
  })),
  hashFn: vi.fn(),
}));

describe("useConfidentialBalances enabled propagation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useQuery)
      .mockReturnValueOnce({ data: OWNER } as ReturnType<typeof useQuery>)
      .mockReturnValueOnce({ data: [HANDLE_A, HANDLE_B], fetchStatus: "idle" } as ReturnType<
        typeof useQuery
      >)
      .mockReturnValueOnce({ data: new Map<Address, bigint>(), fetchStatus: "idle" } as ReturnType<
        typeof useQuery
      >);
  });

  test("disables handles polling query when user passes enabled=false", () => {
    renderHook(() =>
      useConfidentialBalances({ tokenAddresses: [TOKEN, TOKEN_B] }, { enabled: false }),
    );

    const handlesQueryOptions = vi.mocked(useQuery).mock.calls[1]?.[0] as
      | { enabled?: boolean }
      | undefined;

    expect(handlesQueryOptions).toBeDefined();
    expect(handlesQueryOptions?.enabled).toBe(false);
  });

  test("uses a signer-only address query key and disables handles for other falsy enabled values", () => {
    renderHook(() =>
      useConfidentialBalances(
        { tokenAddresses: [TOKEN, TOKEN_B] },
        { enabled: 0 as unknown as boolean },
      ),
    );

    expect(vi.mocked(signerAddressQueryOptions).mock.calls[0]).toEqual([
      expect.objectContaining({ getAddress: expect.any(Function) }),
    ]);

    const handlesQueryOptions = vi.mocked(useQuery).mock.calls[1]?.[0] as
      | { enabled?: boolean }
      | undefined;

    expect(handlesQueryOptions?.enabled).toBeFalsy();
  });
});
