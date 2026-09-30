import type { Address } from "@zama-fhe/sdk";
import type { VaultGroupConfig } from "@zama-fhe/sdk/vaults";
import { describe, expect, test } from "../../test-fixtures";
import { useVaultGroup } from "../use-vault-group";

const REDEEM = "0x2222222222222222222222222222222222222222" as Address;
const OTHER_REDEEM = "0x3333333333333333333333333333333333333333" as Address;

function config(redeem: Address): VaultGroupConfig {
  return {
    id: "solo",
    cAsset: "0x4444444444444444444444444444444444444444",
    vaults: [
      {
        id: "alpha",
        vault: "0x6666666666666666666666666666666666666666",
        cShare: "0x7777777777777777777777777777777777777777",
        batchers: { deposit: "0x1111111111111111111111111111111111111111", redeem },
      },
    ],
  };
}

describe("useVaultGroup", () => {
  test("keeps one instance across renders with a fresh but equal config object", ({
    renderWithProviders,
  }) => {
    const { result, rerender } = renderWithProviders(() => useVaultGroup(config(REDEEM)));
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });

  test("rebuilds the group when the config's contents change", ({ renderWithProviders }) => {
    let redeem = REDEEM;
    const { result, rerender } = renderWithProviders(() => useVaultGroup(config(redeem)));
    const first = result.current;

    redeem = OTHER_REDEEM;
    rerender();

    expect(result.current).not.toBe(first);
    expect(result.current.vaults[0]?.batchers.redeem).toBe(OTHER_REDEEM);
  });

  test("shares one instance between hooks that name the same group", ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() => [
      useVaultGroup(config(REDEEM)),
      useVaultGroup(config(REDEEM)),
    ]);

    expect(result.current[0]).toBe(result.current[1]);
  });
});
