import { describe, expect, it, vi } from "../../test-fixtures";
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
            Topics.UnwrapRequestedLegacy,
            `0x000000000000000000000000${userAddress.slice(2)}`,
            `0x${"ff".repeat(32)}`,
          ],
          data: `0x${"ff".repeat(32)}`,
        },
      ],
    });
  }

  it("fires all callbacks during unshield", async ({
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

  it("fires clear-signing intents for unwrap and finalize phases", async ({
    userAddress,
    wrappedToken: token,
    provider,
  }) => {
    mockReceiptWithUnwrapRequested(provider, userAddress);

    const onClearSigningIntent = vi.fn();
    await token.unshield(50n, {
      skipBalanceCheck: true,
      onClearSigningIntent,
    });

    expect(onClearSigningIntent).toHaveBeenCalledTimes(2);
    expect(onClearSigningIntent.mock.calls[0]?.[0]).toMatchObject({
      kind: "unwrap",
      contractContext: { contractAddress: token.address, functionName: "unwrap" },
    });
    expect(onClearSigningIntent.mock.calls[1]?.[0]).toMatchObject({
      kind: "finalizeUnwrap",
      contractContext: { contractAddress: token.address, functionName: "finalizeUnwrap" },
    });
  });

  it("fires all callbacks during unshieldAll", async ({
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

  it("fires callbacks during resumeUnshield", async ({
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

  it("works without callbacks (backward compatible)", async ({
    userAddress,
    wrappedToken: token,
    provider,
  }) => {
    mockReceiptWithUnwrapRequested(provider, userAddress);

    const result = await token.unshield(50n, { skipBalanceCheck: true });
    expect(result.txHash).toBe("0xtxhash");
    expect(result.receipt).toBeDefined();
  });

  it("completes unshield even when callbacks throw", async ({
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

  it("fires onFinalizing before onFinalizeSubmitted", async ({
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

  it("throws TransactionRevertedError when receipt fetch fails", async ({
    wrappedToken: token,
    provider,
  }) => {
    vi.mocked(provider.waitForTransactionReceipt).mockRejectedValue(new Error("network error"));

    await expect(token.unshield(50n, { skipBalanceCheck: true })).rejects.toThrow(
      TransactionRevertedError,
    );
  });

  it("throws TransactionRevertedError when no UnwrapRequested event in receipt", async ({
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

  it("throws TransactionRevertedError when finalize writeContract fails", async ({
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

  it("throws DecryptionFailedError when publicDecrypt fails during finalize", async ({
    relayer,
    userAddress,
    wrappedToken: token,
    provider,
  }) => {
    mockReceiptWithUnwrapRequested(provider, userAddress);
    vi.mocked(relayer.publicDecrypt).mockRejectedValue(new Error("decrypt error"));

    await expect(token.unshield(50n, { skipBalanceCheck: true })).rejects.toThrow(
      DecryptionFailedError,
    );
  });
});

describe("Transfer callbacks (SDK-19)", () => {
  it("fires onEncryptComplete and onTransferSubmitted callbacks", async ({ token }) => {
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

  it("fires clear-signing intent before submitting confidential transfer", async ({ token }) => {
    const order: string[] = [];
    const onClearSigningIntent = vi.fn((intent) => {
      order.push(`intent:${intent.kind}`);
    });

    await token.confidentialTransfer(
      "0x8b8b8b8b8b8b8b8b8b8b8b8b8b8b8b8b8b8b8b8b" as Address,
      100n,
      {
        skipBalanceCheck: true,
        onEncryptComplete: () => order.push("encrypted"),
        onClearSigningIntent,
        onTransferSubmitted: () => order.push("submitted"),
      },
    );

    expect(order).toEqual(["encrypted", "intent:confidentialTransfer", "submitted"]);
    expect(onClearSigningIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "confidentialTransfer",
        contractContext: expect.objectContaining({
          contractAddress: token.address,
          functionName: "confidentialTransfer",
        }),
      }),
    );
  });

  it("fires callbacks in correct order", async ({ token }) => {
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

  it("works without callbacks (backward compatible)", async ({ token }) => {
    const result = await token.confidentialTransfer(
      "0x8b8b8b8b8B8B8b8B8B8b8b8b8b8B8B8B8B8b8B8b" as Address,
      100n,
      { skipBalanceCheck: true },
    );

    expect(result.txHash).toBe("0xtxhash");
  });

  it("completes transfer even when callbacks throw", async ({ token }) => {
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

  it("completes transfer even when clear-signing callback throws", async ({ token }) => {
    const result = await token.confidentialTransfer(
      "0x8b8b8b8b8b8b8b8b8b8b8b8b8b8b8b8b8b8b8b8b" as Address,
      100n,
      {
        skipBalanceCheck: true,
        onClearSigningIntent: () => {
          throw new Error("clear-signing callback exploded");
        },
      },
    );

    expect(result.txHash).toBe("0xtxhash");
  });
});

describe("Shield clear-signing callbacks", () => {
  it("fires clear-signing intent for approve-and-wrap route", async ({
    handle: _handle,
    tokenAddress,
    wrappedToken,
    provider,
  }) => {
    vi.mocked(provider.readContract)
      .mockResolvedValueOnce(tokenAddress)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(1_000n)
      .mockResolvedValueOnce(0n);

    const onClearSigningIntent = vi.fn();
    await wrappedToken.shield(100n, { onClearSigningIntent });

    expect(onClearSigningIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "shield",
        contractContext: expect.objectContaining({
          contractAddress: wrappedToken.address,
        }),
        rawContext: expect.objectContaining({ route: "approveAndWrap" }),
      }),
    );
  });
});
