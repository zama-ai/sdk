import { QueryClient } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import { describe, expect, test, vi } from "../../test-fixtures";
import {
  applyOptimisticBalanceDelta,
  optimisticBalanceCallbacks,
  rollbackOptimisticBalanceDelta,
  unwrapOptimisticCallerContext,
  type OptimisticBalanceSnapshot,
  type OptimisticMutateContext,
} from "../optimistic-balance-update";

const TOKEN = "0x1111111111111111111111111111111111111111" as Address;
const USER = "0x2222222222222222222222222222222222222222" as Address;
const HANDLE = `0x${"11".repeat(32)}` as Address;

// ---------------------------------------------------------------------------
// unwrapOptimisticCallerContext
// ---------------------------------------------------------------------------

describe("unwrapOptimisticCallerContext", () => {
  test("returns wrappedContext and callerContext when optimistic is true", () => {
    const inner: OptimisticMutateContext = {
      snapshot: [],
      callerContext: { requestId: "abc" },
    };
    const { wrappedContext, callerContext } = unwrapOptimisticCallerContext(true, inner);
    expect(wrappedContext).toBe(inner);
    expect(callerContext).toEqual({ requestId: "abc" });
  });

  test("returns undefined wrappedContext when optimistic is false", () => {
    const raw = { requestId: "abc" };
    const { wrappedContext, callerContext } = unwrapOptimisticCallerContext(false, raw);
    expect(wrappedContext).toBeUndefined();
    expect(callerContext).toBe(raw);
  });

  test("returns undefined wrappedContext when optimistic is undefined", () => {
    const raw = { requestId: "abc" };
    const { wrappedContext, callerContext } = unwrapOptimisticCallerContext(undefined, raw);
    expect(wrappedContext).toBeUndefined();
    expect(callerContext).toBe(raw);
  });

  test("handles undefined rawContext when optimistic is true", () => {
    const { wrappedContext, callerContext } = unwrapOptimisticCallerContext(true, undefined);
    expect(wrappedContext).toBeUndefined();
    expect(callerContext).toBeUndefined();
  });

  test("handles undefined rawContext when optimistic is false", () => {
    const { wrappedContext, callerContext } = unwrapOptimisticCallerContext(false, undefined);
    expect(wrappedContext).toBeUndefined();
    expect(callerContext).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// applyOptimisticBalanceDelta
// ---------------------------------------------------------------------------

describe("applyOptimisticBalanceDelta", () => {
  test("adds amount in add mode", async () => {
    const qc = new QueryClient();
    const balanceKey = zamaQueryKeys.confidentialBalance.owner(TOKEN, USER, HANDLE);
    qc.setQueryData(balanceKey, 1000n);

    const snapshot = await applyOptimisticBalanceDelta({
      queryClient: qc,
      tokenAddress: TOKEN,
      amount: 250n,
      mode: "add",
    });

    expect(qc.getQueryData(balanceKey)).toBe(1250n);
    expect(snapshot).toEqual([[balanceKey, 1000n]]);
  });

  test("subtracts amount in subtract mode", async () => {
    const qc = new QueryClient();
    const balanceKey = zamaQueryKeys.confidentialBalance.owner(TOKEN, USER, HANDLE);
    qc.setQueryData(balanceKey, 1000n);

    const snapshot = await applyOptimisticBalanceDelta({
      queryClient: qc,
      tokenAddress: TOKEN,
      amount: 250n,
      mode: "subtract",
    });

    expect(qc.getQueryData(balanceKey)).toBe(750n);
    expect(snapshot).toEqual([[balanceKey, 1000n]]);
  });

  test("returns empty snapshot when no balance is cached", async () => {
    const qc = new QueryClient();

    const snapshot = await applyOptimisticBalanceDelta({
      queryClient: qc,
      tokenAddress: TOKEN,
      amount: 250n,
      mode: "add",
    });

    expect(snapshot).toEqual([]);
  });

  test("cancels in-flight queries before applying delta", async () => {
    const qc = new QueryClient();
    const balanceKey = zamaQueryKeys.confidentialBalance.owner(TOKEN, USER, HANDLE);
    qc.setQueryData(balanceKey, 1000n);
    const cancelSpy = vi.spyOn(qc, "cancelQueries");

    await applyOptimisticBalanceDelta({
      queryClient: qc,
      tokenAddress: TOKEN,
      amount: 100n,
      mode: "add",
    });

    expect(cancelSpy).toHaveBeenCalledWith({
      queryKey: zamaQueryKeys.confidentialBalance.token(TOKEN),
    });
  });
});

// ---------------------------------------------------------------------------
// rollbackOptimisticBalanceDelta
// ---------------------------------------------------------------------------

describe("rollbackOptimisticBalanceDelta", () => {
  test("restores snapshot values", () => {
    const qc = new QueryClient();
    const balanceKey = zamaQueryKeys.confidentialBalance.owner(TOKEN, USER, HANDLE);
    qc.setQueryData(balanceKey, 9999n);

    const snapshot: OptimisticBalanceSnapshot = [[balanceKey, 1000n]];
    rollbackOptimisticBalanceDelta(qc, snapshot);

    expect(qc.getQueryData(balanceKey)).toBe(1000n);
  });

  test("handles empty snapshot gracefully", () => {
    const qc = new QueryClient();
    const setQueryDataSpy = vi.spyOn(qc, "setQueryData");

    const snapshot: OptimisticBalanceSnapshot = [];
    rollbackOptimisticBalanceDelta(qc, snapshot);

    expect(setQueryDataSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// optimisticBalanceCallbacks — try/finally resilience
// ---------------------------------------------------------------------------

describe("optimisticBalanceCallbacks", () => {
  test("onError calls caller onError even when rollback throws", () => {
    const qc = new QueryClient();
    // Sabotage setQueryData to simulate a rollback failure
    vi.spyOn(qc, "setQueryData").mockImplementation(() => {
      throw new Error("rollback boom");
    });

    const callerOnError = vi.fn();
    const callbacks = optimisticBalanceCallbacks<{ amount: bigint }>({
      optimistic: true,
      tokenAddress: TOKEN,
      queryClient: qc,
      options: { onError: callerOnError },
    });

    const fakeSnapshot: OptimisticMutateContext = {
      snapshot: [[zamaQueryKeys.confidentialBalance.owner(TOKEN, USER, HANDLE), 1000n]],
      callerContext: { requestId: "test" },
    };
    const fakeError = new Error("tx failed");
    const fakeContext = { client: qc } as Parameters<NonNullable<typeof callbacks.onError>>[3];

    // The rollback will throw, but onError should still be called via try/finally
    expect(() =>
      callbacks.onError!(fakeError, { amount: 100n }, fakeSnapshot, fakeContext),
    ).toThrow("rollback boom");
    expect(callerOnError).toHaveBeenCalledOnce();
    expect(callerOnError).toHaveBeenCalledWith(
      fakeError,
      { amount: 100n },
      { requestId: "test" },
      fakeContext,
    );
  });

  test("onMutate applies optimistic delta and calls caller onMutate", async () => {
    const qc = new QueryClient();
    const balanceKey = zamaQueryKeys.confidentialBalance.owner(TOKEN, USER, HANDLE);
    qc.setQueryData(balanceKey, 1000n);

    const callerOnMutate = vi.fn().mockReturnValue({ requestId: "abc" });
    const callbacks = optimisticBalanceCallbacks<{ amount: bigint }>({
      optimistic: true,
      tokenAddress: TOKEN,
      queryClient: qc,
      options: { onMutate: callerOnMutate },
    });

    const result = await callbacks.onMutate!({ amount: 200n }, undefined as never);

    expect(qc.getQueryData(balanceKey)).toBe(1200n);
    expect(callerOnMutate).toHaveBeenCalledOnce();
    expect(result).toEqual({
      snapshot: [[balanceKey, 1000n]],
      callerContext: { requestId: "abc" },
    });
  });

  test("onMutate passes through when optimistic is false", () => {
    const qc = new QueryClient();
    const callerOnMutate = vi.fn().mockReturnValue({ requestId: "abc" });
    const callbacks = optimisticBalanceCallbacks<{ amount: bigint }>({
      optimistic: false,
      tokenAddress: TOKEN,
      queryClient: qc,
      options: { onMutate: callerOnMutate },
    });

    expect(callbacks.onMutate).toBe(callerOnMutate);
  });

  test("onError does not rollback when optimistic is false", () => {
    const qc = new QueryClient();
    const setQueryDataSpy = vi.spyOn(qc, "setQueryData");
    const callerOnError = vi.fn();

    const callbacks = optimisticBalanceCallbacks<{ amount: bigint }>({
      optimistic: false,
      tokenAddress: TOKEN,
      queryClient: qc,
      options: { onError: callerOnError },
    });

    const rawContext = { requestId: "test" };
    const fakeError = new Error("tx failed");
    const fakeContext = { client: qc } as Parameters<NonNullable<typeof callbacks.onError>>[3];

    callbacks.onError!(fakeError, { amount: 100n }, rawContext, fakeContext);

    expect(setQueryDataSpy).not.toHaveBeenCalled();
    expect(callerOnError).toHaveBeenCalledOnce();
    expect(callerOnError).toHaveBeenCalledWith(
      fakeError,
      { amount: 100n },
      rawContext,
      fakeContext,
    );
  });
});
