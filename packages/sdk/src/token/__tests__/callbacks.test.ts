import { describe, expect, test, vi } from "../../test-fixtures";
import { Topics } from "../../events";

import { DecryptionFailedError, TransactionRevertedError } from "../../errors";
import type { GenericProvider } from "../../types";
import type { Address } from "viem";

describe("Unshield callbacks (P4)", () => {
  function mockReceiptWithUnwrapRequested(provider: GenericProvider, userAddress: Address) {
    vi.mocked(provider.waitForTransactionReceipt).mockResolvedValue({
      logs: [
        {
          topics: [
            Topics.UnwrapRequested,
            `0x000000000000000000000000${userAddress.slice(2)}`,
            `0x${"ff".repeat(32)}`,
          ],
          data: `0x${"ff".repeat(32)}`,
        },
      ],
    });
  }

  test("fires all callbacks during unshield", async ({
    relayer: _relayer,
    userAddress,
    wrappedToken: token,
    provider,
  }) => {
    mockReceiptWithUnwrapRequested(provider, userAddress);

    const onUnwrapSubmitted = vi.fn();
    const onFinalizing = vi.fn();
    const onFinalizeSubmitted = vi.fn();

    await token.unshield(50n, {
      skipBalanceCheck: true,
      onUnwrapSubmitted,
      onFinalizing,
      onFinalizeSubmitted,
    });

    expect(onUnwrapSubmitted).toHaveBeenCalledWith("0xtxhash");
    expect(onFinalizing).toHaveBeenCalledOnce();
    expect(onFinalizeSubmitted).toHaveBeenCalledWith("0xtxhash");
  });

  test("fires all callbacks during unshieldAll", async ({
    userAddress,
    handle,
    wrappedToken: token,
    provider,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValue(handle);
    mockReceiptWithUnwrapRequested(provider, userAddress);

    const onUnwrapSubmitted = vi.fn();
    const onFinalizing = vi.fn();
    const onFinalizeSubmitted = vi.fn();

    await token.unshieldAll({
      onUnwrapSubmitted,
      onFinalizing,
      onFinalizeSubmitted,
    });

    expect(onUnwrapSubmitted).toHaveBeenCalledWith("0xtxhash");
    expect(onFinalizing).toHaveBeenCalledOnce();
    expect(onFinalizeSubmitted).toHaveBeenCalledWith("0xtxhash");
  });

  test("fires callbacks during resumeUnshield", async ({
    userAddress,
    wrappedToken: token,
    provider,
  }) => {
    mockReceiptWithUnwrapRequested(provider, userAddress);

    const onFinalizing = vi.fn();
    const onFinalizeSubmitted = vi.fn();

    await token.resumeUnshield("0xprevioustx", {
      onFinalizing,
      onFinalizeSubmitted,
    });

    expect(provider.waitForTransactionReceipt).toHaveBeenCalledWith("0xprevioustx");
    expect(onFinalizing).toHaveBeenCalledOnce();
    expect(onFinalizeSubmitted).toHaveBeenCalledWith("0xtxhash");
  });

  test("works without callbacks (backward compatible)", async ({
    userAddress,
    wrappedToken: token,
    provider,
  }) => {
    mockReceiptWithUnwrapRequested(provider, userAddress);

    const result = await token.unshield(50n, { skipBalanceCheck: true });
    expect(result.txHash).toBe("0xtxhash");
    expect(result.receipt).toBeDefined();
  });

  test("completes unshield even when callbacks throw", async ({
    signer,
    userAddress,
    wrappedToken: token,
    provider,
  }) => {
    mockReceiptWithUnwrapRequested(provider, userAddress);

    const result = await token.unshield(50n, {
      skipBalanceCheck: true,
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

  test("fires onFinalizing before onFinalizeSubmitted", async ({
    userAddress,
    wrappedToken: token,
    provider,
  }) => {
    mockReceiptWithUnwrapRequested(provider, userAddress);

    const order: string[] = [];
    await token.unshield(50n, {
      skipBalanceCheck: true,
      onUnwrapSubmitted: () => order.push("unwrapSubmitted"),
      onFinalizing: () => order.push("finalizing"),
      onFinalizeSubmitted: () => order.push("finalizeSubmitted"),
    });

    expect(order).toEqual(["unwrapSubmitted", "finalizing", "finalizeSubmitted"]);
  });

  test("throws TransactionRevertedError when receipt fetch fails", async ({
    wrappedToken: token,
    provider,
  }) => {
    vi.mocked(provider.waitForTransactionReceipt).mockRejectedValue(new Error("network error"));

    await expect(token.unshield(50n, { skipBalanceCheck: true })).rejects.toThrow(
      TransactionRevertedError,
    );
  });

  test("throws TransactionRevertedError when no UnwrapRequested event in receipt", async ({
    wrappedToken: token,
    provider,
  }) => {
    vi.mocked(provider.waitForTransactionReceipt).mockResolvedValue({
      logs: [],
    });

    await expect(token.unshield(50n, { skipBalanceCheck: true })).rejects.toThrow(
      TransactionRevertedError,
    );
  });

  test("throws TransactionRevertedError when finalize writeContract fails", async ({
    signer,
    userAddress,
    wrappedToken: token,
    provider,
  }) => {
    mockReceiptWithUnwrapRequested(provider, userAddress);
    vi.mocked(signer.writeContract)
      .mockResolvedValueOnce("0xunwraphash") // unwrap succeeds
      .mockRejectedValueOnce(new Error("finalize failed")); // finalize fails

    await expect(token.unshield(50n, { skipBalanceCheck: true })).rejects.toThrow(
      TransactionRevertedError,
    );
  });

  test("throws DecryptionFailedError when decryptPublicValues fails during finalize", async ({
    relayer,
    userAddress,
    wrappedToken: token,
    provider,
  }) => {
    mockReceiptWithUnwrapRequested(provider, userAddress);
    vi.mocked(relayer.decryptPublicValues).mockRejectedValue(new Error("decrypt error"));

    await expect(token.unshield(50n, { skipBalanceCheck: true })).rejects.toThrow(
      DecryptionFailedError,
    );
  });
});

describe("Transfer callbacks (SDK-19)", () => {
  test("fires onEncryptComplete and onTransferSubmitted callbacks", async ({ token }) => {
    const onEncryptComplete = vi.fn();
    const onTransferSubmitted = vi.fn();

    await token.confidentialTransfer(
      "0x8b8b8b8b8B8B8b8B8B8b8b8b8b8B8B8B8B8b8B8b" as Address,
      100n,
      { skipBalanceCheck: true, onEncryptComplete, onTransferSubmitted },
    );

    expect(onEncryptComplete).toHaveBeenCalledOnce();
    expect(onTransferSubmitted).toHaveBeenCalledWith("0xtxhash");
  });

  test("fires callbacks in correct order", async ({ token }) => {
    const order: string[] = [];

    await token.confidentialTransfer(
      "0x8b8b8b8b8B8B8b8B8B8b8b8b8b8B8B8B8B8b8B8b" as Address,
      100n,
      {
        skipBalanceCheck: true,
        onEncryptComplete: () => order.push("encrypted"),
        onTransferSubmitted: () => order.push("submitted"),
      },
    );

    expect(order).toEqual(["encrypted", "submitted"]);
  });

  test("works without callbacks (backward compatible)", async ({ token }) => {
    const result = await token.confidentialTransfer(
      "0x8b8b8b8b8B8B8b8B8B8b8b8b8b8B8B8B8B8b8B8b" as Address,
      100n,
      { skipBalanceCheck: true },
    );

    expect(result.txHash).toBe("0xtxhash");
  });

  test("completes transfer even when callbacks throw", async ({ token }) => {
    const result = await token.confidentialTransfer(
      "0x8b8b8b8b8B8B8b8B8B8b8b8b8b8B8B8B8B8b8B8b" as Address,
      100n,
      {
        skipBalanceCheck: true,
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
