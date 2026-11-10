import type { Address } from "viem";
import { describe, expectTypeOf, test } from "vitest";
import type { VaultJoinParams, VaultRecord } from "../client";
import { defineVaults, type GroupId, type VaultId } from "../config";

const VAULTS = defineVaults({
  chainId: 1,
  groups: {
    stable: {
      asset: "0x2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a",
      vaults: {
        alpha: {
          depositBatcher: "0xAaaAaAAaAaAAaAaAAaaAaaAaAaAAaAaAaAAAAaaA",
          redeemBatcher: "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB",
        },
        beta: {
          depositBatcher: "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC",
          redeemBatcher: "0xdDdDddDdDdddDDddDdDdDDDDdDdDDdDDdDDDDDDd",
        },
      },
    },
    solo: {
      asset: "0x2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a",
      vaults: {
        main: {
          depositBatcher: "0x1111111111111111111111111111111111111111",
          redeemBatcher: "0x2222222222222222222222222222222222222222",
        },
      },
    },
  },
});
type Config = typeof VAULTS;

describe("vault config types", () => {
  test("keeps group and vault ids as literals", () => {
    expectTypeOf<GroupId<Config>>().toEqualTypeOf<"stable" | "solo">();
    expectTypeOf<VaultId<Config, "stable">>().toEqualTypeOf<"alpha" | "beta">();
    expectTypeOf<VaultRecord<Config>["groupId"]>().toEqualTypeOf<"stable" | "solo">();
  });

  test("a larger group needs vaultId and takes no beneficiary", () => {
    type Stable = Extract<VaultJoinParams<Config>, { groupId: "stable" }>;
    expectTypeOf<Stable["vaultId"]>().toEqualTypeOf<"alpha" | "beta">();
    expectTypeOf<Stable["beneficiary"]>().toEqualTypeOf<undefined>();
  });

  test("a group of one may leave out vaultId and name a beneficiary", () => {
    type Solo = Extract<VaultJoinParams<Config>, { groupId: "solo" }>;
    expectTypeOf<Solo["vaultId"]>().toEqualTypeOf<"main" | undefined>();
    expectTypeOf<Solo["beneficiary"]>().toEqualTypeOf<Address | undefined>();
  });
});
