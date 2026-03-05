import type { Query } from "@tanstack/react-query";
import { describe, expect, it } from "../test-fixtures";
import type { Address } from "@zama-fhe/sdk";
import {
  confidentialBalanceQueryKeys,
  confidentialBalancesQueryKeys,
  confidentialHandleQueryKeys,
  confidentialHandlesQueryKeys,
  wagmiBalancePredicates,
} from "../token/balance-query-keys";

function queryWithKey(queryKey: unknown): Query {
  return { queryKey } as unknown as Query;
}

describe("balance-query-keys", () => {
  it("builds expected confidential balance query keys", ({ tokenAddress, userAddress }) => {
    expect(confidentialBalanceQueryKeys.all).toEqual(["confidentialBalance"]);
    expect(confidentialBalanceQueryKeys.token(tokenAddress)).toEqual([
      "confidentialBalance",
      tokenAddress,
    ]);
    expect(confidentialBalanceQueryKeys.owner(tokenAddress, userAddress)).toEqual([
      "confidentialBalance",
      tokenAddress,
      userAddress,
    ]);
  });

  it("builds expected batch confidential balance and handle query keys", ({
    tokenAddress,
    userAddress,
  }) => {
    expect(confidentialBalancesQueryKeys.all).toEqual(["confidentialBalances"]);
    expect(confidentialBalancesQueryKeys.tokens([tokenAddress], userAddress)).toEqual([
      "confidentialBalances",
      [tokenAddress],
      userAddress,
    ]);
    expect(confidentialHandleQueryKeys.all).toEqual(["confidentialHandle"]);
    expect(confidentialHandleQueryKeys.token(tokenAddress)).toEqual([
      "confidentialHandle",
      tokenAddress,
    ]);
    expect(confidentialHandleQueryKeys.owner(tokenAddress, userAddress)).toEqual([
      "confidentialHandle",
      tokenAddress,
      userAddress,
    ]);
    expect(confidentialHandlesQueryKeys.all).toEqual(["confidentialHandles"]);
    expect(confidentialHandlesQueryKeys.tokens([tokenAddress], userAddress)).toEqual([
      "confidentialHandles",
      [tokenAddress],
      userAddress,
    ]);
  });

  describe("wagmiBalancePredicates.balanceOf", () => {
    it("returns false when query key is not an array", () => {
      expect(wagmiBalancePredicates.balanceOf(queryWithKey("not-an-array"))).toBe(false);
    });

    it("returns false when no balanceOf function key exists", () => {
      expect(
        wagmiBalancePredicates.balanceOf(
          queryWithKey([null, "x", { foo: "bar" }, { functionName: "allowance" }]),
        ),
      ).toBe(false);
    });

    it("returns true when any key object has functionName=balanceOf", () => {
      expect(
        wagmiBalancePredicates.balanceOf(
          queryWithKey(["readContracts", { functionName: "balanceOf" }]),
        ),
      ).toBe(true);
    });
  });

  describe("wagmiBalancePredicates.balanceOfAddress", () => {
    const address = "0x3333333333333333333333333333333333333333" as Address;

    it("returns false when top-level key does not match readContracts", () => {
      expect(
        wagmiBalancePredicates.balanceOfAddress(address)(queryWithKey(["differentRoot", {}])),
      ).toBe(false);
    });

    it("returns false when second key entry is not an object", () => {
      expect(
        wagmiBalancePredicates.balanceOfAddress(address)(queryWithKey(["readContracts", 1])),
      ).toBe(false);
    });

    it("returns false when second key entry is null", () => {
      expect(
        wagmiBalancePredicates.balanceOfAddress(address)(queryWithKey(["readContracts", null])),
      ).toBe(false);
    });

    it("returns false when contracts is missing or not an array", () => {
      expect(
        wagmiBalancePredicates.balanceOfAddress(address)(queryWithKey(["readContracts", {}])),
      ).toBe(false);
      expect(
        wagmiBalancePredicates.balanceOfAddress(address)(
          queryWithKey(["readContracts", { contracts: "not-array" }]),
        ),
      ).toBe(false);
    });

    it("returns false when contracts array has no matching address/function", () => {
      expect(
        wagmiBalancePredicates.balanceOfAddress(address)(
          queryWithKey([
            "readContracts",
            {
              contracts: [
                { address, functionName: "transfer" },
                {
                  address: "0x4444444444444444444444444444444444444444",
                  functionName: "balanceOf",
                },
              ],
            },
          ]),
        ),
      ).toBe(false);
    });

    it("returns true when contracts array has matching address and balanceOf", () => {
      expect(
        wagmiBalancePredicates.balanceOfAddress(address)(
          queryWithKey([
            "readContracts",
            {
              contracts: [{ address, functionName: "balanceOf" }],
            },
          ]),
        ),
      ).toBe(true);
    });
  });
});
