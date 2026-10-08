import type { Address } from "viem";
import { describe, expect, test, vi } from "../../../test-fixtures";
import type { TransactionResult } from "../../../types";
import type { Vault } from "../../vault";
import type { VaultBatcher } from "../../vault-batcher";
import type { VaultGroup } from "../../vault-group";
import { claimMutationOptions } from "../claim";
import { depositMutationOptions } from "../deposit";
import { dispatchBatchMutationOptions } from "../dispatch-batch";
import { groupDepositMutationOptions } from "../group-deposit";
import { groupRedeemMutationOptions } from "../group-redeem";
import { joinMutationOptions } from "../join";
import { quitMutationOptions } from "../quit";
import { redeemMutationOptions } from "../redeem";

const DEPOSIT_BATCHER = "0x1111111111111111111111111111111111111111" as Address;
const REDEEM_BATCHER = "0x2222222222222222222222222222222222222222" as Address;
const ROUTER = "0x4444444444444444444444444444444444444444" as Address;
const ACCOUNT = "0x3333333333333333333333333333333333333333" as Address;
const TX_RESULT: TransactionResult = { txHash: `0x${"11".repeat(32)}`, receipt: { logs: [] } };

function createMockVault(): Vault {
  return {
    depositBatcher: { address: DEPOSIT_BATCHER },
    redeemBatcher: { address: REDEEM_BATCHER },
    deposit: vi.fn().mockResolvedValue(TX_RESULT),
    redeem: vi.fn().mockResolvedValue(TX_RESULT),
  } as unknown as Vault;
}

function createMockBatcher(address: Address): VaultBatcher {
  return {
    address,
    join: vi.fn().mockResolvedValue(TX_RESULT),
    claim: vi.fn().mockResolvedValue(TX_RESULT),
    quit: vi.fn().mockResolvedValue(TX_RESULT),
    dispatchBatch: vi.fn().mockResolvedValue(TX_RESULT),
  } as unknown as VaultBatcher;
}

describe("deposit / redeem mutation options", () => {
  test("depositMutationOptions delegates to vault.deposit", async () => {
    const vault = createMockVault();
    const options = depositMutationOptions(vault);

    expect(options.mutationKey).toEqual(["zama.vault.deposit", DEPOSIT_BATCHER]);
    await options.mutationFn({ amount: 1_000n, beneficiary: ACCOUNT });
    expect(vault.deposit).toHaveBeenCalledWith(1_000n, { beneficiary: ACCOUNT });
  });

  test("redeemMutationOptions delegates to vault.redeem", async () => {
    const vault = createMockVault();
    const options = redeemMutationOptions(vault);

    expect(options.mutationKey).toEqual(["zama.vault.redeem", REDEEM_BATCHER]);
    await options.mutationFn({ amount: 500n });
    expect(vault.redeem).toHaveBeenCalledWith(500n, {});
  });
});

function createMockGroup(): VaultGroup {
  return {
    id: "stable",
    cAsset: ACCOUNT,
    members: [
      {
        id: "alpha",
        vault: {
          depositBatcher: { address: DEPOSIT_BATCHER },
          redeemBatcher: { address: REDEEM_BATCHER },
        },
      },
      {
        id: "beta",
        vault: { depositBatcher: { address: ACCOUNT }, redeemBatcher: { address: ROUTER } },
      },
    ],
    deposit: vi.fn().mockResolvedValue(TX_RESULT),
    redeem: vi.fn().mockResolvedValue(TX_RESULT),
  } as unknown as VaultGroup;
}

describe("group mutation options", () => {
  test("groupDepositMutationOptions keys on the deposit batchers and delegates to group.deposit", async () => {
    const group = createMockGroup();
    const options = groupDepositMutationOptions(group);

    expect(options.mutationKey).toEqual([
      "zama.vaultGroup.deposit",
      { cAsset: ACCOUNT, batchers: [DEPOSIT_BATCHER, ACCOUNT] },
    ]);
    await options.mutationFn({ vaultId: "alpha", amount: 1_000n, skipBalanceCheck: true });
    expect(group.deposit).toHaveBeenCalledWith("alpha", 1_000n, { skipBalanceCheck: true });
  });

  test("groupRedeemMutationOptions keys on the redeem batchers and delegates to group.redeem", async () => {
    const group = createMockGroup();
    const options = groupRedeemMutationOptions(group);

    expect(options.mutationKey).toEqual([
      "zama.vaultGroup.redeem",
      { cAsset: ACCOUNT, batchers: [REDEEM_BATCHER, ROUTER] },
    ]);
    await options.mutationFn({ vaultId: "beta", amount: 500n, operatorUntil: 1_800_000_000 });
    expect(group.redeem).toHaveBeenCalledWith("beta", 500n, { operatorUntil: 1_800_000_000 });
  });
});

describe("batcher-level mutation options", () => {
  test("joinMutationOptions delegates to batcher.join", async () => {
    const batcher = createMockBatcher(DEPOSIT_BATCHER);
    const options = joinMutationOptions(batcher);

    expect(options.mutationKey).toEqual(["zama.vault.join", DEPOSIT_BATCHER]);
    await options.mutationFn({ amount: 1_000n, beneficiary: ACCOUNT });
    expect(batcher.join).toHaveBeenCalledWith(1_000n, ACCOUNT, {});
  });

  test("claimMutationOptions delegates to batcher.claim", async () => {
    const batcher = createMockBatcher(DEPOSIT_BATCHER);
    const options = claimMutationOptions(batcher);

    expect(options.mutationKey).toEqual(["zama.vault.claim", DEPOSIT_BATCHER]);
    await options.mutationFn({ batchId: 7n, account: ACCOUNT });
    expect(batcher.claim).toHaveBeenCalledWith(7n, ACCOUNT);
  });

  test("quitMutationOptions delegates to batcher.quit", async () => {
    const batcher = createMockBatcher(DEPOSIT_BATCHER);
    const options = quitMutationOptions(batcher);

    expect(options.mutationKey).toEqual(["zama.vault.quit", DEPOSIT_BATCHER]);
    await options.mutationFn({ batchId: 3n });
    expect(batcher.quit).toHaveBeenCalledWith(3n);
  });

  test("dispatchBatchMutationOptions delegates to batcher.dispatchBatch", async () => {
    const batcher = createMockBatcher(DEPOSIT_BATCHER);
    const options = dispatchBatchMutationOptions(batcher);

    expect(options.mutationKey).toEqual(["zama.vault.dispatchBatch", DEPOSIT_BATCHER]);
    await options.mutationFn();
    expect(batcher.dispatchBatch).toHaveBeenCalled();
  });
});
