import type { Address } from "viem";
import { describe, expect, test, vi } from "../../../test-fixtures";
import type { TransactionResult } from "../../../types";
import type { Vault } from "../../vault";
import type { VaultBatcher } from "../../vault-batcher";
import { claimMutationOptions } from "../claim";
import { depositMutationOptions } from "../deposit";
import { dispatchBatchMutationOptions } from "../dispatch-batch";
import { joinMutationOptions } from "../join";
import { quitMutationOptions } from "../quit";
import { recoverMutationOptions } from "../recover";
import { requestWithdrawalMutationOptions } from "../request-withdrawal";

const DEPOSIT_BATCHER = "0x1111111111111111111111111111111111111111" as Address;
const REDEEM_BATCHER = "0x2222222222222222222222222222222222222222" as Address;
const ACCOUNT = "0x3333333333333333333333333333333333333333" as Address;
const TX_RESULT: TransactionResult = { txHash: `0x${"11".repeat(32)}`, receipt: { logs: [] } };

function createMockVault(): Vault {
  return {
    depositBatcher: { address: DEPOSIT_BATCHER },
    redeemBatcher: { address: REDEEM_BATCHER },
    deposit: vi.fn().mockResolvedValue(TX_RESULT),
    requestWithdrawal: vi.fn().mockResolvedValue(TX_RESULT),
  } as unknown as Vault;
}

function createMockBatcher(address: Address): VaultBatcher {
  return {
    address,
    join: vi.fn().mockResolvedValue(TX_RESULT),
    claim: vi.fn().mockResolvedValue(TX_RESULT),
    quit: vi.fn().mockResolvedValue(TX_RESULT),
    recover: vi.fn().mockResolvedValue(TX_RESULT),
    dispatchBatch: vi.fn().mockResolvedValue(TX_RESULT),
  } as unknown as VaultBatcher;
}

describe("deposit / requestWithdrawal mutation options", () => {
  test("depositMutationOptions delegates to vault.deposit", async () => {
    const vault = createMockVault();
    const options = depositMutationOptions(vault);

    expect(options.mutationKey).toEqual(["zama.vault.deposit", DEPOSIT_BATCHER]);
    await options.mutationFn({ amount: 1_000n, beneficiary: ACCOUNT });
    expect(vault.deposit).toHaveBeenCalledWith(1_000n, { beneficiary: ACCOUNT });
  });

  test("requestWithdrawalMutationOptions delegates to vault.requestWithdrawal", async () => {
    const vault = createMockVault();
    const options = requestWithdrawalMutationOptions(vault);

    expect(options.mutationKey).toEqual(["zama.vault.requestWithdrawal", REDEEM_BATCHER]);
    await options.mutationFn({ amount: 500n });
    expect(vault.requestWithdrawal).toHaveBeenCalledWith(500n, {});
  });
});

describe("batcher-level mutation options", () => {
  test("joinMutationOptions delegates to batcher.join", async () => {
    const batcher = createMockBatcher(DEPOSIT_BATCHER);
    const options = joinMutationOptions(batcher);

    expect(options.mutationKey).toEqual(["zama.vault.join", DEPOSIT_BATCHER]);
    await options.mutationFn({ amount: 1_000n, beneficiary: ACCOUNT });
    expect(batcher.join).toHaveBeenCalledWith(1_000n, ACCOUNT);
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

  test("recoverMutationOptions delegates to batcher.recover", async () => {
    const batcher = createMockBatcher(REDEEM_BATCHER);
    const options = recoverMutationOptions(batcher);

    expect(options.mutationKey).toEqual(["zama.vault.recover", REDEEM_BATCHER]);
    await options.mutationFn({ batchId: 9n, account: ACCOUNT });
    expect(batcher.recover).toHaveBeenCalledWith(9n, ACCOUNT);
  });

  test("dispatchBatchMutationOptions delegates to batcher.dispatchBatch", async () => {
    const batcher = createMockBatcher(DEPOSIT_BATCHER);
    const options = dispatchBatchMutationOptions(batcher);

    expect(options.mutationKey).toEqual(["zama.vault.dispatchBatch", DEPOSIT_BATCHER]);
    await options.mutationFn();
    expect(batcher.dispatchBatch).toHaveBeenCalled();
  });
});
