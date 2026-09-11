import type { Address } from "@zama-fhe/sdk";
import { VaultBatcher } from "@zama-fhe/sdk/vaults";
import { describe, expect, test } from "../../test-fixtures";
import { useVault } from "../use-vault";
import { useVaultBatcher } from "../use-vault-batcher";

const VAULT_ADDRESS = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as Address;
const DEPOSIT_BATCHER = "0x7777777777777777777777777777777777777777" as Address;
const REDEEM_BATCHER = "0x4D4d4D4d4d4D4D4d4D4D4D4d4d4d4d4D4D4d4d4D" as Address;

describe("useVault", () => {
  test("resolves the vault and its batchers", ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() =>
      useVault({
        vault: VAULT_ADDRESS,
        depositBatcher: DEPOSIT_BATCHER,
        redeemBatcher: REDEEM_BATCHER,
      }),
    );

    expect(result.current.address).toBe(VAULT_ADDRESS);
    expect(result.current.depositBatcher).toBeInstanceOf(VaultBatcher);
    expect(result.current.depositBatcher.address).toBe(DEPOSIT_BATCHER);
    expect(result.current.redeemBatcher.address).toBe(REDEEM_BATCHER);
  });

  test("memoizes by address, returning the same instance across re-renders", ({
    renderWithProviders,
  }) => {
    const addresses = {
      vault: VAULT_ADDRESS,
      depositBatcher: DEPOSIT_BATCHER,
      redeemBatcher: REDEEM_BATCHER,
    };
    const { result, rerender } = renderWithProviders(() => useVault(addresses));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});

describe("useVaultBatcher", () => {
  test("resolves a single batcher", ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() => useVaultBatcher(DEPOSIT_BATCHER));
    expect(result.current).toBeInstanceOf(VaultBatcher);
    expect(result.current.address).toBe(DEPOSIT_BATCHER);
  });
});
