import { describe, expectTypeOf, test } from "vitest";
import type { VaultClient } from "../client";
import { defineVault, defineVaultGroup, type VaultIdOf } from "../config";
import type { JoinInput } from "../types";

const STABLE = defineVaultGroup({
  id: "stable",
  chainId: 1,
  vaults: [
    {
      id: "alpha",
      batchers: {
        deposit: "0xAaaAaAAaAaAAaAaAAaaAaaAaAaAAaAaAaAAAAaaA",
        redeem: "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB",
      },
    },
    {
      id: "beta",
      batchers: {
        deposit: "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC",
        redeem: "0xdDdDddDdDdddDDddDdDdDDDDdDdDDdDDdDDDDDDd",
      },
    },
  ],
});

describe("vault group types", () => {
  test("keeps the group and vault ids as literals", () => {
    expectTypeOf(STABLE.id).toEqualTypeOf<"stable">();
    expectTypeOf<VaultIdOf<typeof STABLE>>().toEqualTypeOf<"alpha" | "beta">();
  });

  test("a join input only takes the group's vault ids", () => {
    const client = {} as VaultClient;
    expectTypeOf(client.prepareDeposit<typeof STABLE>)
      .parameter(1)
      .toEqualTypeOf<JoinInput<"alpha" | "beta">>();
  });

  test("a single vault keeps its id, and a join into it needs no vaultId", () => {
    const MAIN = defineVault({
      id: "main",
      chainId: 1,
      batchers: {
        deposit: "0xAaaAaAAaAaAAaAaAAaaAaaAaAaAAaAaAaAAAAaaA",
        redeem: "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB",
      },
    });
    const client = {} as VaultClient;
    const account = "0x6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a";
    expectTypeOf<VaultIdOf<typeof MAIN>>().toEqualTypeOf<"main">();
    expectTypeOf(client.prepareDeposit).toBeCallableWith(MAIN, { account, amount: 1n });
    // Type-only: never called.
    const refused = () => {
      // @ts-expect-error a group needs vaultId
      void client.prepareDeposit(STABLE, { account, amount: 1n });
      // @ts-expect-error a single vault takes only its own id
      void client.prepareDeposit(MAIN, { vaultId: "alpha", account, amount: 1n });
    };
    expectTypeOf(refused).toBeFunction();
  });
});
