import { expect, it, describe, vi } from "../test-fixtures";
import type { Address, Token } from "@zama-fhe/sdk";
import {
  EncryptionFailedError,
  ApprovalFailedError,
  TransactionRevertedError,
} from "@zama-fhe/sdk";
import { confidentialTransferMutationOptions } from "../token/use-confidential-transfer";
import { shieldMutationOptions } from "../token/use-shield";

describe("mutation error propagation", () => {
  it("confidentialTransfer surfaces EncryptionFailedError", async ({ createMockToken }) => {
    const token = createMockToken({
      txResult: { txHash: "0xtx", receipt: { logs: [] } },
    }) as unknown as Token;
    const error = new EncryptionFailedError("Failed to encrypt transfer amount");
    vi.mocked(token.confidentialTransfer).mockRejectedValue(error);

    const opts = confidentialTransferMutationOptions(token);

    await expect(opts.mutationFn({ to: "0xto" as Address, amount: 100n })).rejects.toThrow(
      EncryptionFailedError,
    );
    await expect(opts.mutationFn({ to: "0xto" as Address, amount: 100n })).rejects.toThrow(
      "Failed to encrypt transfer amount",
    );
  });

  it("shield surfaces ApprovalFailedError", async ({ createMockToken }) => {
    const token = createMockToken({
      txResult: { txHash: "0xtx", receipt: { logs: [] } },
    }) as unknown as Token;
    const error = new ApprovalFailedError("ERC-20 approval failed");
    vi.mocked(token.shield).mockRejectedValueOnce(error);

    const opts = shieldMutationOptions(token);

    await expect(opts.mutationFn({ amount: 100n })).rejects.toThrow(ApprovalFailedError);
  });

  it("shield surfaces TransactionRevertedError", async ({ createMockToken }) => {
    const token = createMockToken({
      txResult: { txHash: "0xtx", receipt: { logs: [] } },
    }) as unknown as Token;
    const error = new TransactionRevertedError("Shield (wrap) transaction failed");
    vi.mocked(token.shield).mockRejectedValueOnce(error);

    const opts = shieldMutationOptions(token);

    await expect(opts.mutationFn({ amount: 100n })).rejects.toThrow(TransactionRevertedError);
  });
});
