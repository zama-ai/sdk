import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Address } from "@zama-fhe/sdk";

// ---------------------------------------------------------------------------
// Mock wagmi – useBalanceOf uses useReadContracts + useConnection (compat)
// ---------------------------------------------------------------------------
const mockUseReadContracts = vi.fn(() => ({
  data: undefined as never,
  isLoading: false,
  isSuccess: false,
  isError: false,
  error: null,
}));

const mockUseConnection = vi.fn(() => ({
  address: "0x2222222222222222222222222222222222222222" as Address,
}));

vi.mock("wagmi", () => ({
  useReadContracts: (...args: unknown[]) => mockUseReadContracts(...(args as [])),
}));

vi.mock("../wagmi/compat", () => ({
  useConnection: (...args: unknown[]) => mockUseConnection(...(args as [])),
}));

// ---------------------------------------------------------------------------
// Mock contract builders – verify hooks call the correct builders
// ---------------------------------------------------------------------------
vi.mock("@zama-fhe/sdk", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    symbolContract: vi.fn(actual.symbolContract as (...args: unknown[]) => unknown),
    decimalsContract: vi.fn(actual.decimalsContract as (...args: unknown[]) => unknown),
    balanceOfContract: vi.fn(actual.balanceOfContract as (...args: unknown[]) => unknown),
  };
});

import { symbolContract, decimalsContract, balanceOfContract } from "@zama-fhe/sdk";
import { useBalanceOf } from "../wagmi/use-balance-of";

const TOKEN = "0x1111111111111111111111111111111111111111" as Address;
const USER = "0x2222222222222222222222222222222222222222" as Address;
const OTHER_USER = "0x3333333333333333333333333333333333333333" as Address;

beforeEach(() => {
  vi.clearAllMocks();
  mockUseConnection.mockReturnValue({ address: USER });
  mockUseReadContracts.mockReturnValue({
    data: undefined as never,
    isLoading: false,
    isSuccess: false,
    isError: false,
    error: null,
  });
});

// ======================== useBalanceOf ======================================
describe("useBalanceOf", () => {
  it("calls contract builders and useReadContracts with enabled=true", () => {
    useBalanceOf({ tokenAddress: TOKEN, userAddress: USER });

    expect(vi.mocked(symbolContract)).toHaveBeenCalledWith(TOKEN);
    expect(vi.mocked(decimalsContract)).toHaveBeenCalledWith(TOKEN);
    expect(vi.mocked(balanceOfContract)).toHaveBeenCalledWith(TOKEN, USER);
    expect(mockUseReadContracts).toHaveBeenCalledWith(
      expect.objectContaining({
        query: { enabled: true },
      }),
    );
  });

  it("falls back to connected address when userAddress is not provided", () => {
    useBalanceOf({ tokenAddress: TOKEN });

    expect(vi.mocked(balanceOfContract)).toHaveBeenCalledWith(TOKEN, USER);
    expect(mockUseReadContracts).toHaveBeenCalledWith(
      expect.objectContaining({
        query: { enabled: true },
      }),
    );
  });

  it("uses explicit userAddress over connected address", () => {
    useBalanceOf({ tokenAddress: TOKEN, userAddress: OTHER_USER });

    expect(vi.mocked(balanceOfContract)).toHaveBeenCalledWith(TOKEN, OTHER_USER);
  });

  it("passes enabled=false when no address is available", () => {
    mockUseConnection.mockReturnValue({ address: undefined } as never);

    useBalanceOf({ tokenAddress: TOKEN });

    expect(mockUseReadContracts).toHaveBeenCalledWith(
      expect.objectContaining({
        query: { enabled: false },
      }),
    );
  });

  it("returns formatted balance data when results are available", () => {
    mockUseReadContracts.mockReturnValue({
      data: [
        { result: "USDT", status: "success" },
        { result: 6, status: "success" },
        { result: 1000000n, status: "success" },
      ] as never,
      isLoading: false,
      isSuccess: true,
      isError: false,
      error: null,
    });

    const result = useBalanceOf({ tokenAddress: TOKEN, userAddress: USER });

    expect(result.data.symbol).toBe("USDT");
    expect(result.data.decimals).toBe(6);
    expect(result.data.value).toBe(1000000n);
    expect(result.data.formatted).toBe("1");
  });

  it("returns undefined formatted when value is undefined", () => {
    mockUseReadContracts.mockReturnValue({
      data: [
        { result: "USDT", status: "success" },
        { result: 6, status: "success" },
        { result: undefined, status: "failure" },
      ] as never,
      isLoading: false,
      isSuccess: false,
      isError: false,
      error: null,
    });

    const result = useBalanceOf({ tokenAddress: TOKEN, userAddress: USER });

    expect(result.data.formatted).toBeUndefined();
  });

  it("returns undefined formatted when decimals is undefined", () => {
    mockUseReadContracts.mockReturnValue({
      data: [
        { result: "USDT", status: "success" },
        { result: undefined, status: "failure" },
        { result: 1000000n, status: "success" },
      ] as never,
      isLoading: false,
      isSuccess: false,
      isError: false,
      error: null,
    });

    const result = useBalanceOf({ tokenAddress: TOKEN, userAddress: USER });

    expect(result.data.formatted).toBeUndefined();
  });

  it("returns all undefined data fields when data is undefined", () => {
    const result = useBalanceOf({ tokenAddress: TOKEN, userAddress: USER });

    expect(result.data.value).toBeUndefined();
    expect(result.data.symbol).toBeUndefined();
    expect(result.data.decimals).toBeUndefined();
    expect(result.data.formatted).toBeUndefined();
  });

  it("spreads remaining query state", () => {
    mockUseReadContracts.mockReturnValue({
      data: undefined as never,
      isLoading: true,
      isSuccess: false,
      isError: false,
      error: null,
    });

    const result = useBalanceOf({ tokenAddress: TOKEN, userAddress: USER });

    expect(result.isLoading).toBe(true);
    expect(result.isError).toBe(false);
  });
});

// =================== useBalanceOfSuspense ==================================
describe("useBalanceOfSuspense", () => {
  it("calls contract builders and passes suspense: true", async () => {
    const { useBalanceOfSuspense } = await import("../wagmi/use-balance-of");

    useBalanceOfSuspense({ tokenAddress: TOKEN, userAddress: USER });

    expect(vi.mocked(symbolContract)).toHaveBeenCalledWith(TOKEN);
    expect(vi.mocked(decimalsContract)).toHaveBeenCalledWith(TOKEN);
    expect(vi.mocked(balanceOfContract)).toHaveBeenCalledWith(TOKEN, USER);
    expect(mockUseReadContracts).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({ suspense: true }),
      }),
    );
  });

  it("falls back to connected address when userAddress is not provided", async () => {
    const { useBalanceOfSuspense } = await import("../wagmi/use-balance-of");

    useBalanceOfSuspense({ tokenAddress: TOKEN });

    expect(vi.mocked(balanceOfContract)).toHaveBeenCalledWith(TOKEN, USER);
  });

  it("returns formatted balance data", async () => {
    mockUseReadContracts.mockReturnValue({
      data: [
        { result: "USDC", status: "success" },
        { result: 6, status: "success" },
        { result: 5000000n, status: "success" },
      ] as never,
      isLoading: false,
      isSuccess: true,
      isError: false,
      error: null,
    });

    const { useBalanceOfSuspense } = await import("../wagmi/use-balance-of");
    const result = useBalanceOfSuspense({ tokenAddress: TOKEN, userAddress: USER });

    expect(result.data.symbol).toBe("USDC");
    expect(result.data.decimals).toBe(6);
    expect(result.data.value).toBe(5000000n);
    expect(result.data.formatted).toBe("5");
  });

  it("passes enabled=false when no address is available", async () => {
    mockUseConnection.mockReturnValue({ address: undefined } as never);
    const { useBalanceOfSuspense } = await import("../wagmi/use-balance-of");

    useBalanceOfSuspense({ tokenAddress: TOKEN });

    expect(mockUseReadContracts).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({ enabled: false }),
      }),
    );
  });
});
