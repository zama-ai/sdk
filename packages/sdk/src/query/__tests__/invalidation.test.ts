import type { QueryClient } from "@tanstack/query-core";
import { describe, expect, test, vi } from "vitest";
import {
  invalidateAfterApprove,
  invalidateAfterShield,
  invalidateAfterUnshield,
  invalidateBalanceQueries,
  invalidateWagmiBalanceQueries,
} from "../invalidation";
import { zamaQueryKeys } from "../query-keys";

function createMockQueryClient(): QueryClient {
  return {
    invalidateQueries: vi.fn(),
    removeQueries: vi.fn(),
    resetQueries: vi.fn(),
  } as unknown as QueryClient;
}

describe("invalidation", () => {
  test("invalidateBalanceQueries invalidates and resets expected keys", () => {
    const qc = createMockQueryClient();
    invalidateBalanceQueries(qc, "0xabc");

    expect(vi.mocked(qc.invalidateQueries)).toHaveBeenCalledWith({
      queryKey: zamaQueryKeys.confidentialHandle.token("0xabc"),
    });
    expect(vi.mocked(qc.removeQueries)).toHaveBeenCalledWith({
      queryKey: zamaQueryKeys.confidentialHandle.token("0xabc"),
    });
    expect(vi.mocked(qc.invalidateQueries)).toHaveBeenCalledWith({
      queryKey: zamaQueryKeys.confidentialHandles.all,
    });
    expect(vi.mocked(qc.resetQueries)).toHaveBeenCalledWith({
      queryKey: zamaQueryKeys.confidentialBalance.token("0xabc"),
    });
    expect(vi.mocked(qc.invalidateQueries)).toHaveBeenCalledWith({
      queryKey: zamaQueryKeys.confidentialBalances.all,
    });
  });

  test("invalidateAfterShield includes allowance and wagmi invalidation", () => {
    const qc = createMockQueryClient();
    invalidateAfterShield(qc, "0xabc");

    expect(vi.mocked(qc.invalidateQueries)).toHaveBeenCalledWith({
      queryKey: zamaQueryKeys.underlyingAllowance.token("0xabc"),
    });
    expect(vi.mocked(qc.removeQueries)).toHaveBeenCalledWith({
      queryKey: zamaQueryKeys.underlyingAllowance.token("0xabc"),
    });

    const predicateCall = vi
      .mocked(qc.invalidateQueries)
      .mock.calls.find(
        ([arg]: [{ predicate?: unknown }]) => typeof arg?.predicate === "function",
      );
    expect(predicateCall).toBeDefined();
  });

  test("invalidateAfterUnshield includes allowance and wagmi invalidation", () => {
    const qc = createMockQueryClient();
    invalidateAfterUnshield(qc, "0xabc");

    expect(vi.mocked(qc.invalidateQueries)).toHaveBeenCalledWith({
      queryKey: zamaQueryKeys.underlyingAllowance.token("0xabc"),
    });
    expect(vi.mocked(qc.removeQueries)).toHaveBeenCalledWith({
      queryKey: zamaQueryKeys.underlyingAllowance.token("0xabc"),
    });
  });

  test("invalidateAfterApprove invalidates confidential approval key", () => {
    const qc = createMockQueryClient();
    invalidateAfterApprove(qc, "0xabc");

    expect(vi.mocked(qc.invalidateQueries)).toHaveBeenCalledWith({
      queryKey: zamaQueryKeys.confidentialIsApproved.token("0xabc"),
    });
  });

  test("invalidateWagmiBalanceQueries predicate only matches functionName=balanceOf", () => {
    const qc = createMockQueryClient();
    invalidateWagmiBalanceQueries(qc);

    const options = vi.mocked(qc.invalidateQueries).mock.calls[0]?.[0] as {
      predicate?: (query: { queryKey: unknown[] }) => boolean;
    };
    expect(options.predicate).toBeDefined();

    expect(options.predicate?.({ queryKey: ["read", { functionName: "balanceOf" }] })).toBe(true);
    expect(options.predicate?.({ queryKey: ["read", { functionName: "totalSupply" }] })).toBe(
      false,
    );
    expect(options.predicate?.({ queryKey: ["read", { foo: "bar" }] })).toBe(false);
  });
});
