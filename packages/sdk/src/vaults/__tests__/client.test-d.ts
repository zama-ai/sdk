import { describe, expectTypeOf, test } from "vitest";
import type { VaultClient } from "../client";
import { defineVaultGroup, type VaultIdOf } from "../config";
import type { JoinInput } from "../types";

const STABLE = defineVaultGroup({
  id: "stable",
  chainId: 1,
  asset: "0x2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a",
  vaults: [
    {
      id: "alpha",
      batchers: {
        deposit: "0xAaaAaAAaAaAAaAaAAaaAaaAaAaAAaAaAaAAAAaaA",
        redeem: "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB",
      },
      share: "0x1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c",
    },
    {
      id: "beta",
      batchers: {
        deposit: "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC",
        redeem: "0xdDdDddDdDdddDDddDdDdDDDDdDdDDdDDdDDDDDDd",
      },
      share: "0x3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e",
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
});
