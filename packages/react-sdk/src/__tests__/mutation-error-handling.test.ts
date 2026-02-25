import { expect, it, describe, vi } from "vitest";
import type { Token, Address } from "@zama-fhe/sdk";
import {
  EncryptionFailedError,
  ApprovalFailedError,
  TransactionRevertedError,
} from "@zama-fhe/sdk";
import { confidentialTransferMutationOptions } from "../token/use-confidential-transfer";
import { shieldMutationOptions } from "../token/use-shield";
import { createMockSigner } from "./test-utils";

const TOKEN_ADDR = "0xtoken" as Address;

function createMockToken(address: Address = TOKEN_ADDR) {
  const mockResult = { txHash: "0xtx", receipt: { logs: [] } };
  return {
    address,
    signer: createMockSigner(),
    confidentialTransfer: vi.fn().mockResolvedValue(mockResult),
    confidentialTransferFrom: vi.fn().mockResolvedValue(mockResult),
    approve: vi.fn().mockResolvedValue(mockResult),
    approveUnderlying: vi.fn().mockResolvedValue(mockResult),
    shield: vi.fn().mockResolvedValue(mockResult),
    shieldETH: vi.fn().mockResolvedValue(mockResult),
    unwrap: vi.fn().mockResolvedValue(mockResult),
    unwrapAll: vi.fn().mockResolvedValue(mockResult),
    finalizeUnwrap: vi.fn().mockResolvedValue(mockResult),
    unshield: vi.fn().mockResolvedValue(mockResult),
    unshieldAll: vi.fn().mockResolvedValue(mockResult),
  } as unknown as Token;
}

describe("mutation error propagation", () => {
  it("confidentialTransfer surfaces EncryptionFailedError", async () => {
    const token = createMockToken();
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

  it("shield surfaces ApprovalFailedError", async () => {
    const token = createMockToken();
    const error = new ApprovalFailedError("ERC-20 approval failed");
    vi.mocked(token.shield).mockRejectedValueOnce(error);

    const opts = shieldMutationOptions(token);

    await expect(opts.mutationFn({ amount: 100n })).rejects.toThrow(ApprovalFailedError);
  });

  it("shield surfaces TransactionRevertedError", async () => {
    const token = createMockToken();
    const error = new TransactionRevertedError("Shield (wrap) transaction failed");
    vi.mocked(token.shield).mockRejectedValueOnce(error);

    const opts = shieldMutationOptions(token);

    await expect(opts.mutationFn({ amount: 100n })).rejects.toThrow(TransactionRevertedError);
  });
});
