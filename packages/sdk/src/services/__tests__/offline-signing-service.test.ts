import type { Address, Hex } from "viem";
import {
  describe,
  expect,
  TEST_SIGNED_TX,
  TEST_TX_HASH,
  TEST_UNSIGNED_TX,
  test,
  vi,
} from "../../test-fixtures";
import { ZamaSDKEvents, type ZamaSDKEventInput } from "../../events/sdk-events";
import type { GenericProvider } from "../../types/provider";
import type { ZamaSDK } from "../../zama-sdk";

const TOKEN = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as Address;
const RECIPIENT = "0x3333333333333333333333333333333333333333" as Address;
const UNSIGNED = TEST_UNSIGNED_TX;
const SIGNED = TEST_SIGNED_TX;
const TX_HASH = TEST_TX_HASH;

describe("OfflineSigningService — ConfidentialTransfer round-trip", () => {
  test("prepare encrypts amount + asks the provider for an unsigned tx", async ({
    createSDK,
    broadcastSigner,
    provider,
    relayer,
    userAddress,
  }) => {
    const sdk = createSDK({ signer: broadcastSigner });
    const prepared = await sdk.prepare({
      kind: "ConfidentialTransfer",
      token: TOKEN,
      to: RECIPIENT,
      amount: 1_000n,
    });

    expect(relayer.encrypt).toHaveBeenCalledWith(
      expect.objectContaining({
        values: [{ value: 1_000n, type: "euint64" }],
        contractAddress: TOKEN,
        userAddress,
      }),
    );
    expect(provider.prepareTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        from: userAddress,
        call: expect.objectContaining({
          address: TOKEN,
          functionName: "confidentialTransfer",
        }),
      }),
    );
    expect(prepared.kind).toBe("ConfidentialTransfer");
    expect(prepared.unsignedTx).toBe(UNSIGNED);
    expect(prepared.from).toBe(userAddress);
    expect(prepared.to).toBe(TOKEN);
    expect(prepared.chainId).toBe(31337);
  });

  test("sign delegates to signer.signTransaction with the prepared bytes", async ({
    createSDK,
    broadcastSigner,
    broadcaster,
  }) => {
    const sdk = createSDK({ signer: broadcastSigner });
    const prepared = await sdk.prepare({
      kind: "ConfidentialTransfer",
      token: TOKEN,
      to: RECIPIENT,
      amount: 1n,
    });
    const signed = await sdk.sign(prepared);
    expect(signed).toBe(SIGNED);
    expect(broadcaster.signTransaction).toHaveBeenCalledWith(UNSIGNED);
  });

  test("broadcast submits signed bytes + emits TransferSubmitted + awaits receipt", async ({
    createSDK,
    broadcastSigner,
    provider,
  }) => {
    const onEvent = vi.fn();
    const sdk = createSDK({ signer: broadcastSigner, onEvent });
    const prepared = await sdk.prepare({
      kind: "ConfidentialTransfer",
      token: TOKEN,
      to: RECIPIENT,
      amount: 1n,
    });
    const result = await sdk.broadcast(prepared, SIGNED);
    expect(provider.sendRawTransaction).toHaveBeenCalledWith(SIGNED);
    expect(provider.waitForTransactionReceipt).toHaveBeenCalledWith(TX_HASH);
    expect(result.txHash).toBe(TX_HASH);
    expect(result.receipt).toEqual({ logs: [] });
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: ZamaSDKEvents.TransferSubmitted,
        txHash: TX_HASH,
        tokenAddress: TOKEN,
      }),
    );
  });

  test("execute(prepared) signs then broadcasts in one call", async ({
    createSDK,
    broadcastSigner,
    broadcaster,
    provider,
  }) => {
    const sdk = createSDK({ signer: broadcastSigner });
    const prepared = await sdk.prepare({
      kind: "ConfidentialTransfer",
      token: TOKEN,
      to: RECIPIENT,
      amount: 1n,
    });
    const result = await sdk.execute(prepared);
    expect(broadcaster.signTransaction).toHaveBeenCalledWith(UNSIGNED);
    expect(provider.sendRawTransaction).toHaveBeenCalledWith(SIGNED);
    expect(result.txHash).toBe(TX_HASH);
  });

  test("execute(request) prepares + signs + broadcasts in one call", async ({
    createSDK,
    broadcastSigner,
    broadcaster,
    provider,
  }) => {
    const sdk = createSDK({ signer: broadcastSigner });
    const result = await sdk.execute({
      kind: "ConfidentialTransfer",
      token: TOKEN,
      to: RECIPIENT,
      amount: 1n,
    });
    expect(provider.prepareTransaction).toHaveBeenCalledOnce();
    expect(broadcaster.signTransaction).toHaveBeenCalledOnce();
    expect(provider.sendRawTransaction).toHaveBeenCalledWith(SIGNED);
    expect(result.txHash).toBe(TX_HASH);
  });

  test("completeFromTxHash awaits receipt + emits event without re-broadcasting", async ({
    createSDK,
    broadcastSigner,
    provider,
  }) => {
    const onEvent = vi.fn();
    const sdk = createSDK({ signer: broadcastSigner, onEvent });
    const prepared = await sdk.prepare({
      kind: "ConfidentialTransfer",
      token: TOKEN,
      to: RECIPIENT,
      amount: 1n,
    });
    const externalTxHash = "0xdeadbeefcafe" as Hex;
    const result = await sdk.completeFromTxHash(prepared, externalTxHash);
    expect(provider.sendRawTransaction).not.toHaveBeenCalled();
    expect(provider.waitForTransactionReceipt).toHaveBeenCalledWith(externalTxHash);
    expect(result.txHash).toBe(externalTxHash);
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: ZamaSDKEvents.TransferSubmitted,
        txHash: externalTxHash,
        tokenAddress: TOKEN,
      }),
    );
  });
});

describe("OfflineSigningService — other transaction kinds", () => {
  test("ConfidentialTransferFrom encrypts amount under `from` and builds calldata", async ({
    createSDK,
    broadcastSigner,
    provider,
    relayer,
  }) => {
    const sdk = createSDK({ signer: broadcastSigner });
    const from = "0x1111111111111111111111111111111111111111" as Address;
    await sdk.prepare({
      kind: "ConfidentialTransferFrom",
      token: TOKEN,
      from,
      to: RECIPIENT,
      amount: 5n,
    });
    expect(relayer.encrypt).toHaveBeenCalledWith(
      expect.objectContaining({ userAddress: from, contractAddress: TOKEN }),
    );
    expect(provider.prepareTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        call: expect.objectContaining({
          functionName: "confidentialTransferFrom",
        }),
      }),
    );
  });

  test("SetOperator does not require encryption", async ({
    createSDK,
    broadcastSigner,
    provider,
    relayer,
  }) => {
    const sdk = createSDK({ signer: broadcastSigner });
    await sdk.prepare({
      kind: "SetOperator",
      token: TOKEN,
      operator: RECIPIENT,
    });
    expect(relayer.encrypt).not.toHaveBeenCalled();
    expect(provider.prepareTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        call: expect.objectContaining({ functionName: "setOperator" }),
      }),
    );
  });

  test("Unwrap encrypts amount and builds the wrapper.unwrap call", async ({
    createSDK,
    broadcastSigner,
    provider,
    relayer,
  }) => {
    const sdk = createSDK({ signer: broadcastSigner });
    await sdk.prepare({
      kind: "Unwrap",
      token: TOKEN,
      to: RECIPIENT,
      amount: 7n,
    });
    expect(relayer.encrypt).toHaveBeenCalledOnce();
    expect(provider.prepareTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        call: expect.objectContaining({ functionName: "unwrap" }),
      }),
    );
  });

  test("UnwrapAll reads the on-chain balance handle instead of encrypting", async ({
    createSDK,
    broadcastSigner,
    provider,
    relayer,
  }) => {
    const balanceHandle = ("0x" + "ee".repeat(32)) as Hex;
    vi.mocked(provider.readContract).mockResolvedValue(balanceHandle);
    const sdk = createSDK({ signer: broadcastSigner });
    await sdk.prepare({ kind: "UnwrapAll", token: TOKEN, to: RECIPIENT });
    expect(relayer.encrypt).not.toHaveBeenCalled();
    expect(provider.readContract).toHaveBeenCalled();
    expect(provider.prepareTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        call: expect.objectContaining({ functionName: "unwrap" }),
      }),
    );
  });

  test("FinalizeUnwrap public-decrypts the handle and folds the cleartext into calldata", async ({
    createSDK,
    broadcastSigner,
    provider,
    relayer,
  }) => {
    const handle = ("0x" + "cd".repeat(32)) as Hex;
    vi.mocked(relayer.publicDecrypt).mockResolvedValue({
      clearValues: { [handle]: 42n },
      decryptionProof: "0xproof" as Hex,
      abiEncodedClearValues: "0x2a" as Hex,
    });
    const sdk = createSDK({ signer: broadcastSigner });
    await sdk.prepare({
      kind: "FinalizeUnwrap",
      wrapper: TOKEN,
      unwrapRequestIdOrAmount: handle,
    });
    expect(relayer.publicDecrypt).toHaveBeenCalledWith([handle]);
    expect(provider.prepareTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        call: expect.objectContaining({
          functionName: "finalizeUnwrap",
          // Strict-order args: position matters on calldata.
          args: [handle, 42n, "0xproof"],
        }),
      }),
    );
  });

  test("ApproveUnderlying builds the ERC-20 approve call", async ({
    createSDK,
    broadcastSigner,
    provider,
    relayer,
  }) => {
    const sdk = createSDK({ signer: broadcastSigner });
    await sdk.prepare({
      kind: "ApproveUnderlying",
      underlying: TOKEN,
      spender: RECIPIENT,
      amount: 999n,
    });
    expect(relayer.encrypt).not.toHaveBeenCalled();
    expect(provider.prepareTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        call: expect.objectContaining({ functionName: "approve" }),
      }),
    );
  });

  test("Wrap builds wrapper.wrap call", async ({ createSDK, broadcastSigner, provider }) => {
    const sdk = createSDK({ signer: broadcastSigner });
    await sdk.prepare({
      kind: "Wrap",
      wrapper: TOKEN,
      to: RECIPIENT,
      amount: 10n,
    });
    expect(provider.prepareTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        call: expect.objectContaining({ functionName: "wrap" }),
      }),
    );
  });

  test("TransferAndCall builds the ERC-1363 path", async ({
    createSDK,
    broadcastSigner,
    provider,
  }) => {
    const sdk = createSDK({ signer: broadcastSigner });
    await sdk.prepare({
      kind: "TransferAndCall",
      underlying: TOKEN,
      wrapper: RECIPIENT,
      amount: 100n,
    });
    expect(provider.prepareTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        call: expect.objectContaining({ functionName: "transferAndCall" }),
      }),
    );
  });

  test("DelegateDecryption builds the ACL delegate call", async ({
    createSDK,
    broadcastSigner,
    provider,
    userAddress,
  }) => {
    const sdk = createSDK({ signer: broadcastSigner });
    await sdk.prepare({
      kind: "DelegateDecryption",
      aclAddress: TOKEN,
      contractAddress: RECIPIENT,
      delegateAddress: userAddress,
    });
    expect(provider.prepareTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        call: expect.objectContaining({
          functionName: "delegateForUserDecryption",
        }),
      }),
    );
  });

  test("RevokeDelegation builds the ACL revoke call", async ({
    createSDK,
    broadcastSigner,
    provider,
    userAddress,
  }) => {
    const sdk = createSDK({ signer: broadcastSigner });
    await sdk.prepare({
      kind: "RevokeDelegation",
      aclAddress: TOKEN,
      contractAddress: RECIPIENT,
      delegateAddress: userAddress,
    });
    expect(provider.prepareTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        call: expect.objectContaining({
          functionName: "revokeDelegationForUserDecryption",
        }),
      }),
    );
  });

  test("submitted-event dispatches the right kind", async ({ createSDK, broadcastSigner }) => {
    const onEvent = vi.fn();
    const sdk = createSDK({ signer: broadcastSigner, onEvent });
    const prepared = await sdk.prepare({
      kind: "SetOperator",
      token: TOKEN,
      operator: RECIPIENT,
    });
    await sdk.broadcast(prepared, SIGNED);
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: ZamaSDKEvents.SetOperatorSubmitted,
        txHash: TX_HASH,
      }),
    );
  });
});

describe("OfflineSigningService — CredentialPermit", () => {
  test("execute({ kind: 'CredentialPermit' }) signs typed data via the broadcaster", async ({
    createSDK,
    broadcastSigner,
    broadcaster,
  }) => {
    const sdk = createSDK({ signer: broadcastSigner });
    await sdk.execute({ kind: "CredentialPermit", contracts: [TOKEN] });
    expect(broadcaster.signTypedData).toHaveBeenCalledOnce();
    expect(broadcaster.signTransaction).not.toHaveBeenCalled();
  });

  test("execute({ kind: 'CredentialPermit', contracts: [] }) is a no-op (keypair warm)", async ({
    createSDK,
    broadcastSigner,
    broadcaster,
  }) => {
    const sdk = createSDK({ signer: broadcastSigner });
    await sdk.execute({ kind: "CredentialPermit", contracts: [] });
    expect(broadcaster.signTypedData).not.toHaveBeenCalled();
  });

  test("forwards contracts into CredentialService.allow → relayer.createEIP712", async ({
    createSDK,
    broadcastSigner,
    relayer,
  }) => {
    const sdk = createSDK({ signer: broadcastSigner });
    const OTHER = "0x4444444444444444444444444444444444444444" as Address;
    await sdk.execute({ kind: "CredentialPermit", contracts: [TOKEN, OTHER] });
    // createEIP712(publicKey, contractAddresses, startTimestamp, durationDays)
    expect(relayer.createEIP712).toHaveBeenCalledWith(
      expect.anything(),
      [TOKEN, OTHER],
      expect.any(Number),
      expect.any(Number),
    );
  });
});

// ─── New coverage: broadcast error paths, chain re-check, exhaustive submitted events ───

describe("OfflineSigningService — broadcast error paths", () => {
  test("pre-submit send error → TransactionError event + TransactionRevertedError(Broadcast failed)", async ({
    createSDK,
    broadcastSigner,
    provider,
  }) => {
    const onEvent = vi.fn();
    const sdk = createSDK({ signer: broadcastSigner, onEvent });
    const prepared = await sdk.prepare({
      kind: "ConfidentialTransfer",
      token: TOKEN,
      to: RECIPIENT,
      amount: 1n,
    });
    vi.mocked(provider.sendRawTransaction).mockRejectedValueOnce(new Error("RPC dropped"));

    await expect(sdk.broadcast(prepared, SIGNED)).rejects.toThrow(
      "Broadcast failed for ConfidentialTransfer",
    );
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: ZamaSDKEvents.TransactionError,
        operation: "transfer",
      }),
    );
    // Submitted event must NOT have fired — the send failed.
    const submittedCall = vi
      .mocked(onEvent)
      .mock.calls.find(
        ([event]) => (event as { type: string }).type === ZamaSDKEvents.TransferSubmitted,
      );
    expect(submittedCall).toBeUndefined();
  });

  test("post-submit receipt error → Submitted fired, throw preserves txHash", async ({
    createSDK,
    broadcastSigner,
    provider,
  }) => {
    const onEvent = vi.fn();
    const sdk = createSDK({ signer: broadcastSigner, onEvent });
    const prepared = await sdk.prepare({
      kind: "ConfidentialTransfer",
      token: TOKEN,
      to: RECIPIENT,
      amount: 1n,
    });
    vi.mocked(provider.waitForTransactionReceipt).mockRejectedValueOnce(
      new Error("receipt timeout"),
    );

    await expect(sdk.broadcast(prepared, SIGNED)).rejects.toThrow(
      `Receipt wait failed for ConfidentialTransfer (txHash ${TX_HASH})`,
    );
    // Submitted MUST have been emitted with the real txHash — the caller can
    // recover via completeFromTxHash.
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: ZamaSDKEvents.TransferSubmitted,
        txHash: TX_HASH,
      }),
    );
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: ZamaSDKEvents.TransactionError,
        operation: "transfer",
      }),
    );
  });

  test("ZamaError causes are re-thrown unchanged (no double wrap)", async ({
    createSDK,
    broadcastSigner,
    provider,
  }) => {
    const { TransactionRevertedError } = await import("../../errors");
    const sdk = createSDK({ signer: broadcastSigner });
    const prepared = await sdk.prepare({
      kind: "SetOperator",
      token: TOKEN,
      operator: RECIPIENT,
    });
    const typed = new TransactionRevertedError("already typed");
    vi.mocked(provider.sendRawTransaction).mockRejectedValueOnce(typed);

    await expect(sdk.broadcast(prepared, SIGNED)).rejects.toBe(typed);
  });

  test("sign() wraps broadcaster rejection in SigningFailedError + emits TransactionError", async ({
    createSDK,
    broadcastSigner,
    broadcaster,
  }) => {
    const { SigningFailedError } = await import("../../errors");
    const onEvent = vi.fn();
    vi.mocked(broadcaster.signTransaction).mockRejectedValueOnce(new Error("HSM denied"));
    const sdk = createSDK({ signer: broadcastSigner, onEvent });
    const prepared = await sdk.prepare({
      kind: "ConfidentialTransfer",
      token: TOKEN,
      to: RECIPIENT,
      amount: 1n,
    });
    const err = await sdk.sign(prepared).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SigningFailedError);
    expect((err as Error).message).toContain("Sign failed for ConfidentialTransfer");
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: ZamaSDKEvents.TransactionError,
        operation: "transfer",
      }),
    );
  });
});

describe("OfflineSigningService — chain alignment", () => {
  test("prepare() throws ChainMismatchError when signer and provider disagree", async ({
    createSDK,
    broadcastSigner,
    provider,
  }) => {
    const { ChainMismatchError } = await import("../../errors");
    const sdk = createSDK({ signer: broadcastSigner });
    vi.mocked(provider.getChainId).mockResolvedValueOnce(1); // signer is on 31337

    await expect(
      sdk.prepare({ kind: "SetOperator", token: TOKEN, operator: RECIPIENT }),
    ).rejects.toBeInstanceOf(ChainMismatchError);
  });

  test("broadcast() re-checks chain — fails on mismatch even with a stale prepared tx", async ({
    createSDK,
    broadcastSigner,
    provider,
  }) => {
    const { ChainMismatchError } = await import("../../errors");
    const sdk = createSDK({ signer: broadcastSigner });
    // Prepare on chain 31337 …
    const prepared = await sdk.prepare({
      kind: "SetOperator",
      token: TOKEN,
      operator: RECIPIENT,
    });
    // … then the user switches networks before broadcasting.
    vi.mocked(provider.getChainId).mockResolvedValueOnce(1);

    await expect(sdk.broadcast(prepared, SIGNED)).rejects.toBeInstanceOf(ChainMismatchError);
    // Must fail BEFORE sending.
    expect(provider.sendRawTransaction).not.toHaveBeenCalled();
  });

  test("completeFromTxHash() also re-checks chain alignment", async ({
    createSDK,
    broadcastSigner,
    provider,
  }) => {
    const { ChainMismatchError } = await import("../../errors");
    const sdk = createSDK({ signer: broadcastSigner });
    const prepared = await sdk.prepare({
      kind: "SetOperator",
      token: TOKEN,
      operator: RECIPIENT,
    });
    vi.mocked(provider.getChainId).mockResolvedValueOnce(1);

    await expect(sdk.completeFromTxHash(prepared, TX_HASH)).rejects.toBeInstanceOf(
      ChainMismatchError,
    );
  });
});

describe("OfflineSigningService — exhaustive submitted-event mapping", () => {
  // Skip kinds that need extra mocks (Unwrap, UnwrapAll, FinalizeUnwrap) — those
  // are exercised in their own builder tests above. Cases here cover the
  // remaining entries of SUBMITTED_EVENT_BY_KIND with `as const` requests so
  // the discriminator is narrowed properly.
  const FROM = "0x1111111111111111111111111111111111111111" as Address;
  type Expectation = {
    request: Parameters<ZamaSDK["prepare"]>[0];
    event: ZamaSDKEventInput["type"];
  };
  const cases: ReadonlyArray<Expectation> = [
    {
      request: {
        kind: "ConfidentialTransfer",
        token: TOKEN,
        to: RECIPIENT,
        amount: 1n,
      },
      event: ZamaSDKEvents.TransferSubmitted,
    },
    {
      request: {
        kind: "ConfidentialTransferFrom",
        token: TOKEN,
        from: FROM,
        to: RECIPIENT,
        amount: 1n,
      },
      event: ZamaSDKEvents.TransferFromSubmitted,
    },
    {
      request: { kind: "SetOperator", token: TOKEN, operator: RECIPIENT },
      event: ZamaSDKEvents.SetOperatorSubmitted,
    },
    {
      request: {
        kind: "ApproveUnderlying",
        underlying: TOKEN,
        spender: RECIPIENT,
        amount: 1n,
      },
      event: ZamaSDKEvents.ApproveUnderlyingSubmitted,
    },
    {
      request: { kind: "Wrap", wrapper: TOKEN, to: RECIPIENT, amount: 1n },
      event: ZamaSDKEvents.ShieldSubmitted,
    },
    {
      request: {
        kind: "TransferAndCall",
        underlying: TOKEN,
        wrapper: RECIPIENT,
        amount: 1n,
      },
      event: ZamaSDKEvents.ShieldSubmitted,
    },
    {
      request: {
        kind: "DelegateDecryption",
        aclAddress: TOKEN,
        contractAddress: RECIPIENT,
        delegateAddress: FROM,
      },
      event: ZamaSDKEvents.DelegationSubmitted,
    },
    {
      request: {
        kind: "RevokeDelegation",
        aclAddress: TOKEN,
        contractAddress: RECIPIENT,
        delegateAddress: FROM,
      },
      event: ZamaSDKEvents.RevokeDelegationSubmitted,
    },
  ];

  for (const { request, event } of cases) {
    test(`broadcast emits the ${event} event for ${request.kind}`, async ({
      createSDK,
      broadcastSigner,
    }) => {
      const onEvent = vi.fn();
      const sdk = createSDK({ signer: broadcastSigner, onEvent });
      const prepared = await sdk.prepare(request);
      await sdk.broadcast(prepared, SIGNED);
      expect(onEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: event, txHash: TX_HASH }),
      );
    });
  }
});

describe("OfflineSigningService — encryption invariants", () => {
  const empty = {
    handles: [] as Uint8Array[],
    inputProof: new Uint8Array([4, 5, 6]),
  };

  test("ConfidentialTransfer throws EncryptionFailedError on empty handles", async ({
    createSDK,
    broadcastSigner,
    relayer,
  }) => {
    const { EncryptionFailedError } = await import("../../errors");
    vi.mocked(relayer.encrypt).mockResolvedValueOnce(empty);
    const sdk = createSDK({ signer: broadcastSigner });
    await expect(
      sdk.prepare({
        kind: "ConfidentialTransfer",
        token: TOKEN,
        to: RECIPIENT,
        amount: 1n,
      }),
    ).rejects.toBeInstanceOf(EncryptionFailedError);
  });

  test("ConfidentialTransferFrom throws EncryptionFailedError on empty handles", async ({
    createSDK,
    broadcastSigner,
    relayer,
  }) => {
    const { EncryptionFailedError } = await import("../../errors");
    vi.mocked(relayer.encrypt).mockResolvedValueOnce(empty);
    const sdk = createSDK({ signer: broadcastSigner });
    await expect(
      sdk.prepare({
        kind: "ConfidentialTransferFrom",
        token: TOKEN,
        from: "0x1111111111111111111111111111111111111111" as Address,
        to: RECIPIENT,
        amount: 1n,
      }),
    ).rejects.toBeInstanceOf(EncryptionFailedError);
  });

  test("Unwrap throws EncryptionFailedError on empty handles", async ({
    createSDK,
    broadcastSigner,
    relayer,
  }) => {
    const { EncryptionFailedError } = await import("../../errors");
    vi.mocked(relayer.encrypt).mockResolvedValueOnce(empty);
    const sdk = createSDK({ signer: broadcastSigner });
    await expect(
      sdk.prepare({ kind: "Unwrap", token: TOKEN, to: RECIPIENT, amount: 1n }),
    ).rejects.toBeInstanceOf(EncryptionFailedError);
  });
});

describe("OfflineSigningService — calldata arg assertions", () => {
  type Call = { args: readonly unknown[] };
  const lastCall = (provider: GenericProvider): Call => {
    const calls = vi.mocked(provider.prepareTransaction).mock.calls;
    return (calls[calls.length - 1] as [{ call: Call }])[0].call;
  };

  test("ConfidentialTransfer args are [recipient, handle, inputProof] in order", async ({
    createSDK,
    broadcastSigner,
    provider,
  }) => {
    const sdk = createSDK({ signer: broadcastSigner });
    await sdk.prepare({
      kind: "ConfidentialTransfer",
      token: TOKEN,
      to: RECIPIENT,
      amount: 1n,
    });
    const call = lastCall(provider);
    expect(call.args[0]).toBe(RECIPIENT);
    expect(call.args).toHaveLength(3);
  });

  test("ConfidentialTransferFrom args are [from, to, handle, inputProof]", async ({
    createSDK,
    broadcastSigner,
    provider,
  }) => {
    const FROM = "0x1111111111111111111111111111111111111111" as Address;
    const sdk = createSDK({ signer: broadcastSigner });
    await sdk.prepare({
      kind: "ConfidentialTransferFrom",
      token: TOKEN,
      from: FROM,
      to: RECIPIENT,
      amount: 1n,
    });
    const call = lastCall(provider);
    expect(call.args[0]).toBe(FROM);
    expect(call.args[1]).toBe(RECIPIENT);
    expect(call.args).toHaveLength(4);
  });

  test("SetOperator args are [operator, until]", async ({
    createSDK,
    broadcastSigner,
    provider,
  }) => {
    const sdk = createSDK({ signer: broadcastSigner });
    await sdk.prepare({
      kind: "SetOperator",
      token: TOKEN,
      operator: RECIPIENT,
      until: 1_700_000_000,
    });
    const call = lastCall(provider);
    expect(call.args[0]).toBe(RECIPIENT);
    expect(call.args[1]).toBe(1_700_000_000);
  });

  test("ApproveUnderlying args are [spender, amount]", async ({
    createSDK,
    broadcastSigner,
    provider,
  }) => {
    const sdk = createSDK({ signer: broadcastSigner });
    await sdk.prepare({
      kind: "ApproveUnderlying",
      underlying: TOKEN,
      spender: RECIPIENT,
      amount: 999n,
    });
    expect(lastCall(provider).args).toEqual([RECIPIENT, 999n]);
  });

  test("Wrap args are [to, amount]", async ({ createSDK, broadcastSigner, provider }) => {
    const sdk = createSDK({ signer: broadcastSigner });
    await sdk.prepare({
      kind: "Wrap",
      wrapper: TOKEN,
      to: RECIPIENT,
      amount: 10n,
    });
    expect(lastCall(provider).args).toEqual([RECIPIENT, 10n]);
  });

  test("TransferAndCall args are [wrapper, amount, recipientData]", async ({
    createSDK,
    broadcastSigner,
    provider,
  }) => {
    const sdk = createSDK({ signer: broadcastSigner });
    await sdk.prepare({
      kind: "TransferAndCall",
      underlying: TOKEN,
      wrapper: RECIPIENT,
      amount: 100n,
      recipientData: "0xdead" as Hex,
    });
    const call = lastCall(provider);
    expect(call.args[0]).toBe(RECIPIENT);
    expect(call.args[1]).toBe(100n);
    expect(call.args[2]).toBe("0xdead");
  });

  test("DelegateDecryption args are [delegate, contract, expirationTimestamp]", async ({
    createSDK,
    broadcastSigner,
    provider,
    userAddress,
  }) => {
    const sdk = createSDK({ signer: broadcastSigner });
    const expirationDate = new Date(1_700_000_000_000);
    await sdk.prepare({
      kind: "DelegateDecryption",
      aclAddress: TOKEN,
      contractAddress: RECIPIENT,
      delegateAddress: userAddress,
      expirationDate,
    });
    const call = lastCall(provider);
    expect(call.args[0]).toBe(userAddress);
    expect(call.args[1]).toBe(RECIPIENT);
    expect(call.args[2]).toBe(1_700_000_000n);
  });

  test("RevokeDelegation args are [delegate, contract]", async ({
    createSDK,
    broadcastSigner,
    provider,
    userAddress,
  }) => {
    const sdk = createSDK({ signer: broadcastSigner });
    await sdk.prepare({
      kind: "RevokeDelegation",
      aclAddress: TOKEN,
      contractAddress: RECIPIENT,
      delegateAddress: userAddress,
    });
    expect(lastCall(provider).args).toEqual([userAddress, RECIPIENT]);
  });
});
