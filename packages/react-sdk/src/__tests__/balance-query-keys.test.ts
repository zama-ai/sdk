import type { Query } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { Address } from "@zama-fhe/sdk";
import {
  confidentialBalanceQueryKeys,
  confidentialBalancesQueryKeys,
  confidentialHandleQueryKeys,
  confidentialHandlesQueryKeys,
  wagmiBalancePredicates,
} from "../token/balance-query-keys";

const TOKEN = "0x1111111111111111111111111111111111111111";
const OWNER = "0x2222222222222222222222222222222222222222";

function queryWithKey(queryKey: unknown): Query {
  return { queryKey } as unknown as Query;
}

describe("balance-query-keys", () => {
  it("builds expected confidential balance query keys", () => {
    expect(confidentialBalanceQueryKeys.all).toEqual(["confidentialBalance"]);
    expect(confidentialBalanceQueryKeys.token(TOKEN)).toEqual(["confidentialBalance", TOKEN]);
    expect(confidentialBalanceQueryKeys.owner(TOKEN, OWNER)).toEqual([
      "confidentialBalance",
      TOKEN,
      OWNER,
    ]);
  });

  it("builds expected batch confidential balance and handle query keys", () => {
    expect(confidentialBalancesQueryKeys.all).toEqual(["confidentialBalances"]);
    expect(confidentialBalancesQueryKeys.tokens([TOKEN], OWNER)).toEqual([
      "confidentialBalances",
      [TOKEN],
      OWNER,
    ]);
    expect(confidentialHandleQueryKeys.all).toEqual(["confidentialHandle"]);
    expect(confidentialHandleQueryKeys.token(TOKEN)).toEqual(["confidentialHandle", TOKEN]);
    expect(confidentialHandleQueryKeys.owner(TOKEN, OWNER)).toEqual([
      "confidentialHandle",
      TOKEN,
      OWNER,
    ]);
    expect(confidentialHandlesQueryKeys.all).toEqual(["confidentialHandles"]);
    expect(confidentialHandlesQueryKeys.tokens([TOKEN], OWNER)).toEqual([
      "confidentialHandles",
      [TOKEN],
      OWNER,
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
