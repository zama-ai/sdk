import type { Address } from "@zama-fhe/sdk";
import type { VaultGroupConfig } from "@zama-fhe/sdk/vaults";
import { describe, expect, test } from "../../test-fixtures";
import { useVaultGroup } from "../use-vault-group";

const REDEEM = "0x2222222222222222222222222222222222222222" as Address;
const OTHER_REDEEM = "0x3333333333333333333333333333333333333333" as Address;

function config(redeem: Address): VaultGroupConfig {
  return {
    id: "pair",
    cAsset: "0x4444444444444444444444444444444444444444",
    router: "0x5555555555555555555555555555555555555555",
    vaults: [
      {
        id: "alpha",
        depositBatcher: "0x1111111111111111111111111111111111111111",
        redeemBatcher: redeem,
      },
      {
        id: "beta",
        depositBatcher: "0x6666666666666666666666666666666666666666",
        redeemBatcher: "0x7777777777777777777777777777777777777777",
      },
    ],
  };
}

describe("useVaultGroup", () => {
  test("keeps one instance across renders with the same config", ({ renderWithProviders }) => {
    const stable = config(REDEEM);
    const { result, rerender } = renderWithProviders(() => useVaultGroup(stable));
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });

  test("builds a new group when the config object changes", ({ renderWithProviders }) => {
    let current = config(REDEEM);
    const { result, rerender } = renderWithProviders(() => useVaultGroup(current));
    const first = result.current;

    current = config(OTHER_REDEEM);
    rerender();

    expect(result.current).not.toBe(first);
    expect(result.current.members[0]?.vault.redeemBatcher.address).toBe(OTHER_REDEEM);
  });
});
