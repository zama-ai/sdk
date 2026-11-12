import { describe, expectTypeOf, test } from "vitest";
import type { VaultClient } from "../client";
import {
  defineVault,
  defineVaultGroup,
  type Vault,
  type VaultGroup,
  type VaultIdOf,
} from "../config";
import type { GroupJoinInput, JoinInput } from "../types";

const ALPHA = defineVault({
  id: "alpha",
  chainId: 1,
  batchers: {
    deposit: "0xAaaAaAAaAaAAaAaAAaaAaaAaAaAAaAaAaAAAAaaA",
    redeem: "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB",
  },
});
const BETA = defineVault({
  id: "beta",
  chainId: 1,
  batchers: {
    deposit: "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC",
    redeem: "0xdDdDddDdDdddDDddDdDdDDDDdDdDDdDDdDDDDDDd",
  },
});
const STABLE = defineVaultGroup({ id: "stable", vaults: [ALPHA, BETA] });

const account = "0x6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a";

describe("vault types", () => {
  test("keeps the vault and group ids as literals", () => {
    expectTypeOf(ALPHA).toEqualTypeOf<Vault<"alpha">>();
    expectTypeOf(STABLE.id).toEqualTypeOf<"stable">();
    expectTypeOf<VaultIdOf<typeof STABLE>>().toEqualTypeOf<"alpha" | "beta">();
  });

  test("a group holds two vaults at least", () => {
    // A lone vault is joined on its own, not as a group.
    expectTypeOf<{ id: "solo"; vaults: readonly [typeof ALPHA] }>().not.toExtend<VaultGroup>();
  });

  test("a group join takes one of the group's vault ids", () => {
    const client = {} as VaultClient;
    expectTypeOf(client.prepareDeposit).toBeCallableWith(STABLE, {
      vaultId: "beta",
      account,
      amount: 1n,
    });
    expectTypeOf<GroupJoinInput<VaultIdOf<typeof STABLE>>["vaultId"]>().toEqualTypeOf<
      "alpha" | "beta"
    >();
    // Type-only: never called.
    const refused = () => {
      // @ts-expect-error a group needs vaultId
      void client.prepareDeposit(STABLE, { account, amount: 1n });
      // @ts-expect-error not a vault of the group
      void client.prepareDeposit(STABLE, { vaultId: "gamma", account, amount: 1n });
    };
    expectTypeOf(refused).toBeFunction();
  });

  test("a vault on its own takes no vaultId and no route", () => {
    const client = {} as VaultClient;
    expectTypeOf(client.prepareDeposit).toBeCallableWith(ALPHA, { account, amount: 1n });
    expectTypeOf(client.deposit).toBeCallableWith(ALPHA, { amount: 1n });
    expectTypeOf<JoinInput>().not.toHaveProperty("vaultId");
    // Type-only: never called.
    const refused = () => {
      // @ts-expect-error a vault on its own takes no vaultId
      void client.prepareDeposit(ALPHA, { vaultId: "alpha", account, amount: 1n });
      // @ts-expect-error a vault on its own has no route to choose
      void client.prepareDeposit(ALPHA, { account, amount: 1n }, { route: "direct" });
    };
    expectTypeOf(refused).toBeFunction();
  });
});
