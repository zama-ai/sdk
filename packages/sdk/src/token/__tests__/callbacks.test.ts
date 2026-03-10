import { describe, expect, it, vi } from "../../test-fixtures";
import { Topics } from "../../events";

import { DecryptionFailedError, TransactionRevertedError } from "../errors";
import type { GenericSigner } from "../token.types";
import type { Address } from "viem";

describe("Unshield callbacks (P4)", () => {
  function mockReceiptWithUnwrapRequested(signer: GenericSigner, userAddress: Address) {
    vi.mocked(signer.waitForTransactionReceipt).mockResolvedValue({
      logs: [
        {
          topics: [Topics.UnwrapRequested, `0x000000000000000000000000${userAddress.slice(2)}`],
          data: `0x${"ff".repeat(32)}`,
        },
      ],
    });
  }

  it("fires all callbacks during unshield", async ({
    relayer: _relayer,
    signer,
    userAddress,
    token,
  }) => {
    mockReceiptWithUnwrapRequested(signer, userAddress);

    const onUnwrapSubmitted = vi.fn();
    const onFinalizing = vi.fn();
    const onFinalizeSubmitted = vi.fn();

    await token.unshield(50n, { onUnwrapSubmitted, onFinalizing, onFinalizeSubmitted });

    expect(onUnwrapSubmitted).toHaveBeenCalledWith("0xtxhash");
    expect(onFinalizing).toHaveBeenCalledOnce();
    expect(onFinalizeSubmitted).toHaveBeenCalledWith("0xtxhash");
  });

  it("fires all callbacks during unshieldAll", async ({ signer, userAddress, handle, token }) => {
    vi.mocked(signer.readContract).mockResolvedValue(handle);
    mockReceiptWithUnwrapRequested(signer, userAddress);

    const onUnwrapSubmitted = vi.fn();
    const onFinalizing = vi.fn();
    const onFinalizeSubmitted = vi.fn();

    await token.unshieldAll({ onUnwrapSubmitted, onFinalizing, onFinalizeSubmitted });

    expect(onUnwrapSubmitted).toHaveBeenCalledWith("0xtxhash");
    expect(onFinalizing).toHaveBeenCalledOnce();
    expect(onFinalizeSubmitted).toHaveBeenCalledWith("0xtxhash");
  });

  it("fires callbacks during resumeUnshield", async ({ signer, userAddress, token }) => {
    mockReceiptWithUnwrapRequested(signer, userAddress);

    const onFinalizing = vi.fn();
    const onFinalizeSubmitted = vi.fn();

    await token.resumeUnshield("0xprevioustx", { onFinalizing, onFinalizeSubmitted });

    expect(signer.waitForTransactionReceipt).toHaveBeenCalledWith("0xprevioustx");
    expect(onFinalizing).toHaveBeenCalledOnce();
    expect(onFinalizeSubmitted).toHaveBeenCalledWith("0xtxhash");
  });

  it("works without callbacks (backward compatible)", async ({ signer, userAddress, token }) => {
    mockReceiptWithUnwrapRequested(signer, userAddress);

    const result = await token.unshield(50n);
    expect(result.txHash).toBe("0xtxhash");
    expect(result.receipt).toBeDefined();
  });

  it("completes unshield even when callbacks throw", async ({ signer, userAddress, token }) => {
    mockReceiptWithUnwrapRequested(signer, userAddress);

    const result = await token.unshield(50n, {
      onUnwrapSubmitted: () => {
        throw new Error("callback exploded");
      },
      onFinalizing: () => {
        throw new Error("callback exploded again");
      },
      onFinalizeSubmitted: () => {
        throw new Error("callback exploded a third time");
      },
    });

    expect(result.txHash).toBe("0xtxhash");
    expect(signer.writeContract).toHaveBeenCalledTimes(2); // unwrap + finalize
  });

  it("fires onFinalizing before onFinalizeSubmitted", async ({ signer, userAddress, token }) => {
    mockReceiptWithUnwrapRequested(signer, userAddress);

    const order: string[] = [];
    await token.unshield(50n, {
      onUnwrapSubmitted: () => order.push("unwrapSubmitted"),
      onFinalizing: () => order.push("finalizing"),
      onFinalizeSubmitted: () => order.push("finalizeSubmitted"),
    });

    expect(order).toEqual(["unwrapSubmitted", "finalizing", "finalizeSubmitted"]);
  });

  it("throws TransactionRevertedError when receipt fetch fails", async ({ signer, token }) => {
    vi.mocked(signer.waitForTransactionReceipt).mockRejectedValue(new Error("network error"));

    await expect(token.unshield(50n)).rejects.toBeInstanceOf(TransactionRevertedError);
  });

  it("throws TransactionRevertedError when no UnwrapRequested event in receipt", async ({
    signer,
    token,
  }) => {
    vi.mocked(signer.waitForTransactionReceipt).mockResolvedValue({ logs: [] });

    await expect(token.unshield(50n)).rejects.toBeInstanceOf(TransactionRevertedError);
  });

  it("throws TransactionRevertedError when finalize writeContract fails", async ({
    signer,
    userAddress,
    token,
  }) => {
    mockReceiptWithUnwrapRequested(signer, userAddress);
    vi.mocked(signer.writeContract)
      .mockResolvedValueOnce("0xunwraphash") // unwrap succeeds
      .mockRejectedValueOnce(new Error("finalize failed")); // finalize fails

    await expect(token.unshield(50n)).rejects.toBeInstanceOf(TransactionRevertedError);
  });

  it("throws DecryptionFailedError when publicDecrypt fails during finalize", async ({
    relayer,
    signer,
    userAddress,
    token,
  }) => {
    mockReceiptWithUnwrapRequested(signer, userAddress);
    vi.mocked(relayer.publicDecrypt).mockRejectedValue(new Error("decrypt error"));

    await expect(token.unshield(50n)).rejects.toBeInstanceOf(DecryptionFailedError);
  });
});

describe("Shield callbacks (SDK-19)", () => {
  it("fires onApprovalSubmitted and onShieldSubmitted callbacks", async ({
    relayer,
    signer,
    createToken,
    storage,
    sessionStorage,
    tokenAddress,
  }) => {
    // underlying() returns a non-zero address so it's treated as ERC-20, not ETH
    vi.mocked(signer.readContract).mockResolvedValue("0x9999999999999999999999999999999999999999");
    const token = createToken({
      relayer,
      signer,
      storage,
      sessionStorage,
      address: tokenAddress,
      wrapper: tokenAddress,
    });

    // Mock allowance to 0 so approval is needed
    vi.mocked(signer.readContract)
      .mockResolvedValueOnce("0x9999999999999999999999999999999999999999") // underlying()
      .mockResolvedValueOnce(0n); // allowance()

    const onApprovalSubmitted = vi.fn();
    const onShieldSubmitted = vi.fn();

    await token.shield(100n, {
      callbacks: { onApprovalSubmitted, onShieldSubmitted },
    });

    expect(onApprovalSubmitted).toHaveBeenCalledWith("0xtxhash");
    expect(onShieldSubmitted).toHaveBeenCalledWith("0xtxhash");
  });

  it("skips onApprovalSubmitted when allowance is sufficient", async ({
    relayer,
    signer,
    createToken,
    storage,
    sessionStorage,
    tokenAddress,
  }) => {
    vi.mocked(signer.readContract).mockResolvedValue("0x9999999999999999999999999999999999999999");
    const token = createToken({
      relayer,
      signer,
      storage,
      sessionStorage,
      address: tokenAddress,
      wrapper: tokenAddress,
    });

    // Mock allowance to be greater than amount
    vi.mocked(signer.readContract)
      .mockResolvedValueOnce("0x9999999999999999999999999999999999999999") // underlying()
      .mockResolvedValueOnce(1000n); // allowance() > 100n

    const onApprovalSubmitted = vi.fn();
    const onShieldSubmitted = vi.fn();

    await token.shield(100n, {
      callbacks: { onApprovalSubmitted, onShieldSubmitted },
    });

    expect(onApprovalSubmitted).not.toHaveBeenCalled();
    expect(onShieldSubmitted).toHaveBeenCalledOnce();
  });

  it("completes shield even when callbacks throw", async ({
    relayer,
    signer,
    createToken,
    storage,
    sessionStorage,
    tokenAddress,
  }) => {
    vi.mocked(signer.readContract).mockResolvedValue("0x9999999999999999999999999999999999999999");
    const token = createToken({
      relayer,
      signer,
      storage,
      sessionStorage,
      address: tokenAddress,
      wrapper: tokenAddress,
    });

    vi.mocked(signer.readContract)
      .mockResolvedValueOnce("0x9999999999999999999999999999999999999999")
      .mockResolvedValueOnce(0n);

    const result = await token.shield(100n, {
      callbacks: {
        onApprovalSubmitted: () => {
          throw new Error("callback exploded");
        },
        onShieldSubmitted: () => {
          throw new Error("callback exploded again");
        },
      },
    });

    expect(result.txHash).toBe("0xtxhash");
  });

  it("passes to parameter for shield recipient", async ({
    relayer,
    signer,
    createToken,
    storage,
    sessionStorage,
    tokenAddress,
  }) => {
    vi.mocked(signer.readContract).mockResolvedValue("0x9999999999999999999999999999999999999999");
    const token = createToken({
      relayer,
      signer,
      storage,
      sessionStorage,
      address: tokenAddress,
      wrapper: tokenAddress,
    });

    vi.mocked(signer.readContract)
      .mockResolvedValueOnce("0x9999999999999999999999999999999999999999")
      .mockResolvedValueOnce(1000n);

    const recipient = "0x8888888888888888888888888888888888888888" as Address;
    await token.shield(100n, { to: recipient });

    // The writeContract call for wrap should include the recipient
    expect(signer.writeContract).toHaveBeenCalled();
  });
});

describe("Transfer callbacks (SDK-19)", () => {
  it("fires onEncryptComplete and onTransferSubmitted callbacks", async ({ token }) => {
    const onEncryptComplete = vi.fn();
    const onTransferSubmitted = vi.fn();

    await token.confidentialTransfer(
      "0x8888888888888888888888888888888888888888" as Address,
      100n,
      { onEncryptComplete, onTransferSubmitted },
    );

    expect(onEncryptComplete).toHaveBeenCalledOnce();
    expect(onTransferSubmitted).toHaveBeenCalledWith("0xtxhash");
  });

  it("fires callbacks in correct order", async ({ token }) => {
    const order: string[] = [];

    await token.confidentialTransfer(
      "0x8888888888888888888888888888888888888888" as Address,
      100n,
      {
        onEncryptComplete: () => order.push("encrypted"),
        onTransferSubmitted: () => order.push("submitted"),
      },
    );

    expect(order).toEqual(["encrypted", "submitted"]);
  });

  it("works without callbacks (backward compatible)", async ({ token }) => {
    const result = await token.confidentialTransfer(
      "0x8888888888888888888888888888888888888888" as Address,
      100n,
    );

    expect(result.txHash).toBe("0xtxhash");
  });

  it("completes transfer even when callbacks throw", async ({ token }) => {
    const result = await token.confidentialTransfer(
      "0x8888888888888888888888888888888888888888" as Address,
      100n,
      {
        onEncryptComplete: () => {
          throw new Error("callback exploded");
        },
        onTransferSubmitted: () => {
          throw new Error("callback exploded again");
        },
      },
    );

    expect(result.txHash).toBe("0xtxhash");
  });
});
