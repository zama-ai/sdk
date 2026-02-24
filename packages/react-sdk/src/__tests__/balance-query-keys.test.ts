import { describe, expect, it } from "vitest";
import type { Query } from "@tanstack/react-query";

import {
  confidentialBalanceQueryKeys,
  confidentialBalancesQueryKeys,
  confidentialHandleQueryKeys,
  confidentialHandlesQueryKeys,
  wagmiBalancePredicates,
} from "../token/balance-query-keys";

const asQuery = (queryKey: unknown): Query => ({ queryKey }) as Query;

describe("balance query key factories", () => {
  it("builds single-token keys", () => {
    expect(confidentialBalanceQueryKeys.all).toEqual(["confidentialBalance"]);
    expect(confidentialBalanceQueryKeys.token("0xtoken")).toEqual([
      "confidentialBalance",
      "0xtoken",
    ]);
    expect(confidentialBalanceQueryKeys.owner("0xtoken", "0xowner")).toEqual([
      "confidentialBalance",
      "0xtoken",
      "0xowner",
    ]);
  });

  it("builds batch keys", () => {
    expect(confidentialBalancesQueryKeys.all).toEqual(["confidentialBalances"]);
    expect(confidentialBalancesQueryKeys.tokens(["0xa", "0xb"], "0xowner")).toEqual([
      "confidentialBalances",
      ["0xa", "0xb"],
      "0xowner",
    ]);
  });

  it("builds handle keys", () => {
    expect(confidentialHandleQueryKeys.all).toEqual(["confidentialHandle"]);
    expect(confidentialHandleQueryKeys.token("0xtoken")).toEqual(["confidentialHandle", "0xtoken"]);
    expect(confidentialHandleQueryKeys.owner("0xtoken", "0xowner")).toEqual([
      "confidentialHandle",
      "0xtoken",
      "0xowner",
    ]);

    expect(confidentialHandlesQueryKeys.all).toEqual(["confidentialHandles"]);
    expect(confidentialHandlesQueryKeys.tokens(["0xa"], "0xowner")).toEqual([
      "confidentialHandles",
      ["0xa"],
      "0xowner",
    ]);
  });
});

describe("wagmiBalancePredicates", () => {
  it("matches balanceOf read contract entries", () => {
    const query = asQuery(["readContracts", { functionName: "balanceOf" }]);
    expect(wagmiBalancePredicates.balanceOf(query)).toBe(true);
  });

  it("returns false for non-matching balanceOf shapes", () => {
    expect(wagmiBalancePredicates.balanceOf(asQuery("not-an-array"))).toBe(false);
    expect(wagmiBalancePredicates.balanceOf(asQuery(["readContracts", "not-an-object"]))).toBe(
      false,
    );
    expect(wagmiBalancePredicates.balanceOf(asQuery(["readContracts", null]))).toBe(false);
    expect(wagmiBalancePredicates.balanceOf(asQuery(["readContracts", {}]))).toBe(false);
    expect(
      wagmiBalancePredicates.balanceOf(asQuery(["readContracts", { functionName: "transfer" }])),
    ).toBe(false);
  });

  it("matches balanceOfAddress for the target token", () => {
    const isTarget = wagmiBalancePredicates.balanceOfAddress("0x1234" as `0x${string}`);
    const query = asQuery([
      "readContracts",
      { contracts: [{ address: "0x1234", functionName: "balanceOf" }] },
    ]);

    expect(isTarget(query)).toBe(true);
  });

  it("returns false for non-matching balanceOfAddress shapes", () => {
    const isTarget = wagmiBalancePredicates.balanceOfAddress("0x1234" as `0x${string}`);

    expect(isTarget(asQuery(["other", { contracts: [] }]))).toBe(false);
    expect(isTarget(asQuery(["readContracts", "nope"]))).toBe(false);
    expect(isTarget(asQuery(["readContracts", null]))).toBe(false);
    expect(isTarget(asQuery(["readContracts", {}]))).toBe(false);
    expect(isTarget(asQuery(["readContracts", { contracts: "not-array" }]))).toBe(false);
    expect(
      isTarget(
        asQuery([
          "readContracts",
          { contracts: [{ address: "0x1234", functionName: "transfer" }] },
        ]),
      ),
    ).toBe(false);
  });
});
