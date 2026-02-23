import { expect, it, describe, vi } from "vitest";
import type { Token, Address } from "@zama-fhe/token-sdk";
import {
  EncryptionFailedError,
  ApprovalFailedError,
  TransactionRevertedError,
} from "@zama-fhe/token-sdk";
import { confidentialTransferMutationOptions } from "../token/use-confidential-transfer";
import { wrapMutationOptions } from "../token/use-wrap";
import { createMockSigner } from "./test-utils";

const TOKEN_ADDR = "0xtoken" as Address;

function createMockToken(address: Address = TOKEN_ADDR) {
  return {
    address,
    signer: createMockSigner(),
    confidentialTransfer: vi.fn(),
    confidentialTransferFrom: vi.fn(),
    approve: vi.fn(),
    approveUnderlying: vi.fn(),
    wrap: vi.fn(),
    wrapETH: vi.fn(),
    unwrap: vi.fn(),
    unwrapAll: vi.fn(),
    finalizeUnwrap: vi.fn(),
    unshield: vi.fn(),
    unshieldAll: vi.fn(),
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

  it("wrap surfaces ApprovalFailedError", async () => {
    const token = createMockToken();
    const error = new ApprovalFailedError("ERC-20 approval failed");
    vi.mocked(token.wrap).mockRejectedValueOnce(error);

    const opts = wrapMutationOptions(token);

    await expect(opts.mutationFn({ amount: 100n })).rejects.toThrow(ApprovalFailedError);
  });

  it("wrap surfaces TransactionRevertedError", async () => {
    const token = createMockToken();
    const error = new TransactionRevertedError("Shield (wrap) transaction failed");
    vi.mocked(token.wrap).mockRejectedValueOnce(error);

    const opts = wrapMutationOptions(token);

    await expect(opts.mutationFn({ amount: 100n })).rejects.toThrow(TransactionRevertedError);
  });
});
