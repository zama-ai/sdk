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

const TOKEN = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a";
const OTHER_TOKEN = "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B";

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
}

describe("invalidation", () => {
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
      zamaQueryKeys.confidentialBalance.token(TOKEN),
      zamaQueryKeys.confidentialBalances.all,
      zamaQueryKeys.underlyingAllowance.token(TOKEN),
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
      zamaQueryKeys.confidentialBalance.token(OTHER_TOKEN),
      zamaQueryKeys.underlyingAllowance.token(OTHER_TOKEN),
    ];

    for (const key of otherKeys) {
      qc.setQueryData(key, { seeded: true });
    }
    invalidateAfterShield(qc, TOKEN);

    for (const key of otherKeys) {
      expect(qc.getQueryState(key)?.isInvalidated).toBe(false);
    }
  });

  test("invalidateAfterUnshield invalidates balance keys, wagmi, and underlyingAllowance", () => {
    const qc = createQueryClient();
    const keys = [
      zamaQueryKeys.confidentialBalance.token(TOKEN),
      zamaQueryKeys.confidentialBalances.all,
      zamaQueryKeys.underlyingAllowance.token(TOKEN),
    ];

    for (const key of keys) {
      qc.setQueryData(key, { seeded: true });
    }
    invalidateAfterUnshield(qc, TOKEN);

    for (const key of keys) {
      expect(qc.getQueryState(key)?.isInvalidated).toBe(true);
    }
  });

  test("invalidateAfterTransfer invalidates balance keys", () => {
    const qc = createQueryClient();
    const keys = [
      zamaQueryKeys.confidentialBalance.token(TOKEN),
      zamaQueryKeys.confidentialBalances.all,
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
      zamaQueryKeys.confidentialBalance.token(TOKEN),
      zamaQueryKeys.confidentialBalances.all,
      zamaQueryKeys.underlyingAllowance.token(TOKEN),
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

  test("invalidateWalletLifecycleQueries removes decryption cache and invalidates zama queries", () => {
    const qc = createQueryClient();
    const balanceKey = zamaQueryKeys.confidentialBalance.token(TOKEN);
    const decryptionKey = zamaQueryKeys.decryption.handle(
      "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
    const wagmiBalanceKey = ["readContract", { functionName: "balanceOf" }] as const;

    qc.setQueryData(balanceKey, { balance: 1n });
    qc.setQueryData(decryptionKey, 123n);
    qc.setQueryData(wagmiBalanceKey, "balance");

    invalidateWalletLifecycleQueries(qc);

    expect(qc.getQueryData(decryptionKey)).toBeUndefined();
    expect(qc.getQueryState(balanceKey)?.isInvalidated).toBe(true);
    expect(qc.getQueryState(wagmiBalanceKey)?.isInvalidated).toBe(true);
  });

  test("invalidateWalletLifecycleQueries removes wallet-local isAllowed cache", () => {
    const qc = createQueryClient();
    const isAllowedKey = zamaQueryKeys.isAllowed.scope([TOKEN]);

    qc.setQueryData(isAllowedKey, true);
    expect(qc.getQueryData(isAllowedKey)).toBe(true);

    invalidateWalletLifecycleQueries(qc);

    // Cache is removed outright so a disconnected or swapped signer cannot
    // read a stale `true` before the next refetch.
    expect(qc.getQueryData(isAllowedKey)).toBeUndefined();
  });
});
