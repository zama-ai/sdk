import { describe, expect, test } from "../../test-fixtures";
import { QueryClient } from "@tanstack/react-query";
import {
  invalidateAfterApprove,
  invalidateAfterApproveUnderlying,
  invalidateAfterShield,
  invalidateAfterTransfer,
  invalidateAfterUnshield,
  invalidateAfterUnwrap,
  invalidateBalanceQueries,
  invalidateWalletLifecycleQueries,
  invalidateWagmiBalanceQueries,
} from "../invalidation";
import { zamaQueryKeys } from "../query-keys";

const TOKEN = "0x1111111111111111111111111111111111111111";
const OTHER_TOKEN = "0x2222222222222222222222222222222222222222";

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
}

describe("invalidation", () => {
  test("invalidateBalanceQueries invalidates confidentialHandle token query while preserving data", () => {
    const qc = createQueryClient();
    const handleKey = zamaQueryKeys.confidentialHandle.token(TOKEN);
    const seeded = { handle: "h1" };

    qc.setQueryData(handleKey, seeded);
    invalidateBalanceQueries(qc, TOKEN);

    expect(qc.getQueryData(handleKey)).toEqual(seeded);
    expect(qc.getQueryState(handleKey)?.isInvalidated).toBe(true);
  });

  test("invalidateBalanceQueries invalidates confidentialBalance token query while preserving data", () => {
    const qc = createQueryClient();
    const balanceKey = zamaQueryKeys.confidentialBalance.token(TOKEN);
    const seeded = { balance: 123n };

    qc.setQueryData(balanceKey, seeded);
    invalidateBalanceQueries(qc, TOKEN);

    expect(qc.getQueryData(balanceKey)).toEqual(seeded);
    expect(qc.getQueryState(balanceKey)?.isInvalidated).toBe(true);
  });

  test("invalidateBalanceQueries does not remove other token confidentialBalance query data", () => {
    const qc = createQueryClient();
    const otherBalanceKey = zamaQueryKeys.confidentialBalance.token(OTHER_TOKEN);
    const seeded = { balance: 999n };

    qc.setQueryData(otherBalanceKey, seeded);
    invalidateBalanceQueries(qc, TOKEN);

    expect(qc.getQueryData(otherBalanceKey)).toEqual(seeded);
  });

  test("invalidateBalanceQueries invalidates confidentialHandles.all while preserving data", () => {
    const qc = createQueryClient();
    const handlesKey = zamaQueryKeys.confidentialHandles.all;
    const seeded = [{ tokenAddress: TOKEN, handle: "h2" }];

    qc.setQueryData(handlesKey, seeded);
    invalidateBalanceQueries(qc, TOKEN);

    expect(qc.getQueryData(handlesKey)).toEqual(seeded);
    expect(qc.getQueryState(handlesKey)?.isInvalidated).toBe(true);
  });

  test("invalidateBalanceQueries invalidates confidentialBalances.all while preserving data", () => {
    const qc = createQueryClient();
    const balancesKey = zamaQueryKeys.confidentialBalances.all;
    const seeded = [{ tokenAddress: TOKEN, balance: 123n }];

    qc.setQueryData(balancesKey, seeded);
    invalidateBalanceQueries(qc, TOKEN);

    expect(qc.getQueryData(balancesKey)).toEqual(seeded);
    expect(qc.getQueryState(balancesKey)?.isInvalidated).toBe(true);
  });

  test("invalidateAfterShield invalidates all expected keys", () => {
    const qc = createQueryClient();
    const keys = [
      zamaQueryKeys.confidentialHandle.token(TOKEN),
      zamaQueryKeys.confidentialBalance.token(TOKEN),
      zamaQueryKeys.confidentialHandles.all,
      zamaQueryKeys.confidentialBalances.all,
      zamaQueryKeys.underlyingAllowance.token(TOKEN),
      zamaQueryKeys.activityFeed.token(TOKEN),
    ];

    for (const key of keys) {
      qc.setQueryData(key, { seeded: true });
    }
    invalidateAfterShield(qc, TOKEN);

    for (const key of keys) {
      expect(qc.getQueryState(key)?.isInvalidated).toBe(true);
    }
  });

  test("invalidateAfterShield does not invalidate keys for a different token", () => {
    const qc = createQueryClient();
    const otherKeys = [
      zamaQueryKeys.confidentialHandle.token(OTHER_TOKEN),
      zamaQueryKeys.confidentialBalance.token(OTHER_TOKEN),
      zamaQueryKeys.underlyingAllowance.token(OTHER_TOKEN),
      zamaQueryKeys.activityFeed.token(OTHER_TOKEN),
    ];

    for (const key of otherKeys) {
      qc.setQueryData(key, { seeded: true });
    }
    invalidateAfterShield(qc, TOKEN);

    for (const key of otherKeys) {
      expect(qc.getQueryState(key)?.isInvalidated).toBe(false);
    }
  });

  test("invalidateAfterUnshield invalidates balance keys, wagmi, underlyingAllowance, and activityFeed", () => {
    const qc = createQueryClient();
    const keys = [
      zamaQueryKeys.confidentialHandle.token(TOKEN),
      zamaQueryKeys.confidentialBalance.token(TOKEN),
      zamaQueryKeys.confidentialHandles.all,
      zamaQueryKeys.confidentialBalances.all,
      zamaQueryKeys.underlyingAllowance.token(TOKEN),
      zamaQueryKeys.activityFeed.token(TOKEN),
    ];

    for (const key of keys) {
      qc.setQueryData(key, { seeded: true });
    }
    invalidateAfterUnshield(qc, TOKEN);

    for (const key of keys) {
      expect(qc.getQueryState(key)?.isInvalidated).toBe(true);
    }
  });

  test("invalidateAfterTransfer invalidates balance keys and activityFeed", () => {
    const qc = createQueryClient();
    const keys = [
      zamaQueryKeys.confidentialHandle.token(TOKEN),
      zamaQueryKeys.confidentialBalance.token(TOKEN),
      zamaQueryKeys.confidentialHandles.all,
      zamaQueryKeys.confidentialBalances.all,
      zamaQueryKeys.activityFeed.token(TOKEN),
    ];

    for (const key of keys) {
      qc.setQueryData(key, { seeded: true });
    }
    invalidateAfterTransfer(qc, TOKEN);

    for (const key of keys) {
      expect(qc.getQueryState(key)?.isInvalidated).toBe(true);
    }
  });

  test("invalidateAfterTransfer does NOT invalidate underlyingAllowance or wagmi balance", () => {
    const qc = createQueryClient();
    const allowanceKey = zamaQueryKeys.underlyingAllowance.token(TOKEN);
    const wagmiKey = ["readContract", { functionName: "balanceOf" }] as const;

    qc.setQueryData(allowanceKey, { amount: 88n });
    qc.setQueryData(wagmiKey, "balance");
    invalidateAfterTransfer(qc, TOKEN);

    expect(qc.getQueryState(allowanceKey)?.isInvalidated).toBe(false);
    expect(qc.getQueryState(wagmiKey)?.isInvalidated).toBe(false);
  });

  test("invalidateAfterUnwrap invalidates all expected keys", () => {
    const qc = createQueryClient();
    const keys = [
      zamaQueryKeys.confidentialHandle.token(TOKEN),
      zamaQueryKeys.confidentialBalance.token(TOKEN),
      zamaQueryKeys.confidentialHandles.all,
      zamaQueryKeys.confidentialBalances.all,
      zamaQueryKeys.underlyingAllowance.token(TOKEN),
      zamaQueryKeys.activityFeed.token(TOKEN),
    ];

    for (const key of keys) {
      qc.setQueryData(key, { seeded: true });
    }
    invalidateAfterUnwrap(qc, TOKEN);

    for (const key of keys) {
      expect(qc.getQueryState(key)?.isInvalidated).toBe(true);
    }
  });

  test("invalidateAfterApprove invalidates confidential approval key", () => {
    const qc = createQueryClient();
    const approvalKey = zamaQueryKeys.confidentialIsApproved.token(TOKEN);

    qc.setQueryData(approvalKey, true);
    invalidateAfterApprove(qc, TOKEN);

    expect(qc.getQueryData(approvalKey)).toBe(true);
    expect(qc.getQueryState(approvalKey)?.isInvalidated).toBe(true);
  });

  test("invalidateAfterApprove invalidates activityFeed.token", () => {
    const qc = createQueryClient();
    const activityKey = zamaQueryKeys.activityFeed.token(TOKEN);

    qc.setQueryData(activityKey, [{ id: "evt-1" }]);
    invalidateAfterApprove(qc, TOKEN);

    expect(qc.getQueryState(activityKey)?.isInvalidated).toBe(true);
  });

  test("invalidateAfterApproveUnderlying invalidates underlying allowance and keeps data", () => {
    const qc = createQueryClient();
    const allowanceKey = zamaQueryKeys.underlyingAllowance.token(TOKEN);

    qc.setQueryData(allowanceKey, { amount: 100n });
    invalidateAfterApproveUnderlying(qc, TOKEN);

    expect(qc.getQueryData(allowanceKey)).toEqual({ amount: 100n });
    expect(qc.getQueryState(allowanceKey)?.isInvalidated).toBe(true);
  });

  test("invalidateWagmiBalanceQueries predicate only invalidates functionName=balanceOf", () => {
    const qc = createQueryClient();
    const wagmiBalanceKey = ["readContract", { functionName: "balanceOf" }] as const;
    const otherWagmiKey = ["readContract", { functionName: "totalSupply" }] as const;

    qc.setQueryData(wagmiBalanceKey, "balance");
    qc.setQueryData(otherWagmiKey, "total");

    invalidateWagmiBalanceQueries(qc);

    expect(qc.getQueryState(wagmiBalanceKey)?.isInvalidated).toBe(true);
    expect(qc.getQueryState(otherWagmiKey)?.isInvalidated).toBe(false);
  });

  test("invalidateWalletLifecycleQueries removes signerAddress and invalidates zama queries", () => {
    const qc = createQueryClient();
    const signerKey = zamaQueryKeys.signerAddress.all;
    const balanceKey = zamaQueryKeys.confidentialBalance.token(TOKEN);
    const wagmiBalanceKey = ["readContract", { functionName: "balanceOf" }] as const;

    qc.setQueryData(signerKey, "0xuser");
    qc.setQueryData(balanceKey, { balance: 1n });
    qc.setQueryData(wagmiBalanceKey, "balance");

    invalidateWalletLifecycleQueries(qc);

    expect(qc.getQueryData(signerKey)).toBeUndefined();
    expect(qc.getQueryState(balanceKey)?.isInvalidated).toBe(true);
    expect(qc.getQueryState(wagmiBalanceKey)?.isInvalidated).toBe(true);
  });
});
