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
import type { TransactionPrepareRequest } from "../../types/prepared-tx";

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
      from: userAddress,
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

  test("broadcast submits signed bytes + emits TransferSubmitted + awaits receipt", async ({
    createSDK,
    broadcastSigner,
    provider,
    userAddress,
  }) => {
    const onEvent = vi.fn();
    const sdk = createSDK({ signer: broadcastSigner, onEvent });
    const prepared = await sdk.prepare({
      kind: "ConfidentialTransfer",
      from: userAddress,
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

  test("execute(request) prepares + signs + broadcasts in one call", async ({
    createSDK,
    broadcastSigner,
    broadcaster,
    provider,
    userAddress,
  }) => {
    const sdk = createSDK({ signer: broadcastSigner });
    const result = await sdk.execute({
      kind: "ConfidentialTransfer",
      from: userAddress,
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
    userAddress,
  }) => {
    const onEvent = vi.fn();
    const sdk = createSDK({ signer: broadcastSigner, onEvent });
    const prepared = await sdk.prepare({
      kind: "ConfidentialTransfer",
      from: userAddress,
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
  test("ConfidentialTransferFrom encrypts amount under `owner` and builds calldata", async ({
    createSDK,
    broadcastSigner,
    provider,
    relayer,
    userAddress,
  }) => {
    const sdk = createSDK({ signer: broadcastSigner });
    const owner = "0x1111111111111111111111111111111111111111" as Address;
    await sdk.prepare({
      kind: "ConfidentialTransferFrom",
      from: userAddress,
      token: TOKEN,
      owner,
      to: RECIPIENT,
      amount: 5n,
    });
    expect(relayer.encrypt).toHaveBeenCalledWith(
      expect.objectContaining({ userAddress: owner, contractAddress: TOKEN }),
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
    userAddress,
  }) => {
    const sdk = createSDK({ signer: broadcastSigner });
    await sdk.prepare({
      kind: "SetOperator",
      from: userAddress,
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
    userAddress,
  }) => {
    const sdk = createSDK({ signer: broadcastSigner });
    await sdk.prepare({
      kind: "Unwrap",
      from: userAddress,
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
    userAddress,
  }) => {
    const balanceHandle = ("0x" + "ee".repeat(32)) as Hex;
    vi.mocked(provider.readContract).mockResolvedValue(balanceHandle);
    const sdk = createSDK({ signer: broadcastSigner });
    await sdk.prepare({ kind: "UnwrapAll", from: userAddress, token: TOKEN, to: RECIPIENT });
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
    userAddress,
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
      from: userAddress,
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
    userAddress,
  }) => {
    const sdk = createSDK({ signer: broadcastSigner });
    await sdk.prepare({
      kind: "ApproveUnderlying",
      from: userAddress,
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

  test("Wrap builds wrapper.wrap call", async ({
    createSDK,
    broadcastSigner,
    provider,
    userAddress,
  }) => {
    const sdk = createSDK({ signer: broadcastSigner });
    await sdk.prepare({
      kind: "Wrap",
      from: userAddress,
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
    userAddress,
  }) => {
    const sdk = createSDK({ signer: broadcastSigner });
    await sdk.prepare({
      kind: "TransferAndCall",
      from: userAddress,
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
      from: userAddress,
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
      from: userAddress,
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

  test("submitted-event dispatches the right kind", async ({
    createSDK,
    broadcastSigner,
    userAddress,
  }) => {
    const onEvent = vi.fn();
    const sdk = createSDK({ signer: broadcastSigner, onEvent });
    const prepared = await sdk.prepare({
      kind: "SetOperator",
      from: userAddress,
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

describe("OfflineSigningService — CredentialPermit deferred path", () => {
  test("prepare returns a typed-data envelope for fresh contracts", async ({
    createSDK,
    broadcastSigner,
    userAddress,
  }) => {
    const sdk = createSDK({ signer: broadcastSigner });
    const prepared = await sdk.prepare({
      kind: "CredentialPermit",
      from: userAddress,
      contracts: [TOKEN],
    });
    expect(prepared.kind).toBe("CredentialPermit");
    expect(prepared.typedData).not.toBeNull();
    expect(prepared.context.chunk).toEqual([TOKEN]);
  });

  test("prepare returns typedData: null when contracts are empty (keypair warm)", async ({
    createSDK,
    broadcastSigner,
    userAddress,
  }) => {
    const sdk = createSDK({ signer: broadcastSigner });
    const prepared = await sdk.prepare({
      kind: "CredentialPermit",
      from: userAddress,
      contracts: [],
    });
    expect(prepared.typedData).toBeNull();
  });

  test("registerPermit round-trip: prepare → external signTypedData stub → registerPermit", async ({
    createSDK,
    broadcastSigner,
    userAddress,
  }) => {
    const sdk = createSDK({ signer: broadcastSigner });
    const prepared = await sdk.prepare({
      kind: "CredentialPermit",
      from: userAddress,
      contracts: [TOKEN],
    });
    const externalSignature = `0x${"ab".repeat(65)}` as Hex;
    const result = await sdk.registerPermit(prepared, externalSignature);
    expect(result.contracts).toEqual([TOKEN]);
    // After registering, an isAllowed query should report true.
    const allowed = await sdk.isAllowed([TOKEN]);
    expect(allowed).toBe(true);
  });

  test("registerPermit rejects a malformed signature with SigningFailedError", async ({
    createSDK,
    broadcastSigner,
    userAddress,
  }) => {
    const { SigningFailedError } = await import("../../errors");
    const sdk = createSDK({ signer: broadcastSigner });
    const prepared = await sdk.prepare({
      kind: "CredentialPermit",
      from: userAddress,
      contracts: [TOKEN],
    });
    await expect(sdk.registerPermit(prepared, "not-hex" as unknown as Hex)).rejects.toBeInstanceOf(
      SigningFailedError,
    );
  });
});

describe("OfflineSigningService — CredentialPermit", () => {
  test("execute({ kind: 'CredentialPermit' }) signs typed data via the broadcaster", async ({
    createSDK,
    broadcastSigner,
    broadcaster,
    userAddress,
  }) => {
    const sdk = createSDK({ signer: broadcastSigner });
    await sdk.execute({ kind: "CredentialPermit", from: userAddress, contracts: [TOKEN] });
    expect(broadcaster.signTypedData).toHaveBeenCalledOnce();
    expect(broadcaster.signTransaction).not.toHaveBeenCalled();
  });

  test("execute({ kind: 'CredentialPermit', contracts: [] }) is a no-op (keypair warm)", async ({
    createSDK,
    broadcastSigner,
    broadcaster,
    userAddress,
  }) => {
    const sdk = createSDK({ signer: broadcastSigner });
    await sdk.execute({ kind: "CredentialPermit", from: userAddress, contracts: [] });
    expect(broadcaster.signTypedData).not.toHaveBeenCalled();
  });

  test("forwards contracts into CredentialService.allow → relayer.createEIP712", async ({
    createSDK,
    broadcastSigner,
    relayer,
    userAddress,
  }) => {
    const sdk = createSDK({ signer: broadcastSigner });
    const OTHER = "0x4444444444444444444444444444444444444444" as Address;
    await sdk.execute({
      kind: "CredentialPermit",
      from: userAddress,
      contracts: [TOKEN, OTHER],
    });
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
    userAddress,
  }) => {
    const onEvent = vi.fn();
    const sdk = createSDK({ signer: broadcastSigner, onEvent });
    const prepared = await sdk.prepare({
      kind: "ConfidentialTransfer",
      from: userAddress,
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
    userAddress,
  }) => {
    const onEvent = vi.fn();
    const sdk = createSDK({ signer: broadcastSigner, onEvent });
    const prepared = await sdk.prepare({
      kind: "ConfidentialTransfer",
      from: userAddress,
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
    userAddress,
  }) => {
    const { TransactionRevertedError } = await import("../../errors");
    const sdk = createSDK({ signer: broadcastSigner });
    const prepared = await sdk.prepare({
      kind: "SetOperator",
      from: userAddress,
      token: TOKEN,
      operator: RECIPIENT,
    });
    const typed = new TransactionRevertedError("already typed");
    vi.mocked(provider.sendRawTransaction).mockRejectedValueOnce(typed);

    await expect(sdk.broadcast(prepared, SIGNED)).rejects.toBe(typed);
  });
});

describe("OfflineSigningService — chain alignment", () => {
  test("prepare() throws ChainMismatchError when signer and provider disagree", async ({
    createSDK,
    broadcastSigner,
    provider,
    userAddress,
  }) => {
    const { ChainMismatchError } = await import("../../errors");
    const sdk = createSDK({ signer: broadcastSigner });
    vi.mocked(provider.getChainId).mockResolvedValueOnce(1); // signer is on 31337

    await expect(
      sdk.prepare({ kind: "SetOperator", from: userAddress, token: TOKEN, operator: RECIPIENT }),
    ).rejects.toBeInstanceOf(ChainMismatchError);
  });

  test("broadcast() re-checks chain — fails on mismatch even with a stale prepared tx", async ({
    createSDK,
    broadcastSigner,
    provider,
    userAddress,
  }) => {
    const { ChainMismatchError } = await import("../../errors");
    const sdk = createSDK({ signer: broadcastSigner });
    // Prepare on chain 31337 …
    const prepared = await sdk.prepare({
      kind: "SetOperator",
      from: userAddress,
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
    userAddress,
  }) => {
    const { ChainMismatchError } = await import("../../errors");
    const sdk = createSDK({ signer: broadcastSigner });
    const prepared = await sdk.prepare({
      kind: "SetOperator",
      from: userAddress,
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
  const OWNER = "0x1111111111111111111111111111111111111111" as Address;
  const ANY_DELEGATE = "0x1111111111111111111111111111111111111111" as Address;
  type Expectation = {
    requestFor: (from: Address) => TransactionPrepareRequest;
    event: ZamaSDKEventInput["type"];
    kind: string;
  };
  const cases: ReadonlyArray<Expectation> = [
    {
      kind: "ConfidentialTransfer",
      requestFor: (from) => ({
        kind: "ConfidentialTransfer",
        from,
        token: TOKEN,
        to: RECIPIENT,
        amount: 1n,
      }),
      event: ZamaSDKEvents.TransferSubmitted,
    },
    {
      kind: "ConfidentialTransferFrom",
      requestFor: (from) => ({
        kind: "ConfidentialTransferFrom",
        from,
        token: TOKEN,
        owner: OWNER,
        to: RECIPIENT,
        amount: 1n,
      }),
      event: ZamaSDKEvents.TransferFromSubmitted,
    },
    {
      kind: "SetOperator",
      requestFor: (from) => ({ kind: "SetOperator", from, token: TOKEN, operator: RECIPIENT }),
      event: ZamaSDKEvents.SetOperatorSubmitted,
    },
    {
      kind: "ApproveUnderlying",
      requestFor: (from) => ({
        kind: "ApproveUnderlying",
        from,
        underlying: TOKEN,
        spender: RECIPIENT,
        amount: 1n,
      }),
      event: ZamaSDKEvents.ApproveUnderlyingSubmitted,
    },
    {
      kind: "Wrap",
      requestFor: (from) => ({ kind: "Wrap", from, wrapper: TOKEN, to: RECIPIENT, amount: 1n }),
      event: ZamaSDKEvents.ShieldSubmitted,
    },
    {
      kind: "TransferAndCall",
      requestFor: (from) => ({
        kind: "TransferAndCall",
        from,
        underlying: TOKEN,
        wrapper: RECIPIENT,
        amount: 1n,
      }),
      event: ZamaSDKEvents.ShieldSubmitted,
    },
    {
      kind: "DelegateDecryption",
      requestFor: (from) => ({
        kind: "DelegateDecryption",
        from,
        aclAddress: TOKEN,
        contractAddress: RECIPIENT,
        delegateAddress: ANY_DELEGATE,
      }),
      event: ZamaSDKEvents.DelegationSubmitted,
    },
    {
      kind: "RevokeDelegation",
      requestFor: (from) => ({
        kind: "RevokeDelegation",
        from,
        aclAddress: TOKEN,
        contractAddress: RECIPIENT,
        delegateAddress: ANY_DELEGATE,
      }),
      event: ZamaSDKEvents.RevokeDelegationSubmitted,
    },
  ];

  for (const { kind, requestFor, event } of cases) {
    test(`broadcast emits the ${event} event for ${kind}`, async ({
      createSDK,
      broadcastSigner,
      userAddress,
    }) => {
      const onEvent = vi.fn();
      const sdk = createSDK({ signer: broadcastSigner, onEvent });
      const prepared = await sdk.prepare(requestFor(userAddress));
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
    userAddress,
  }) => {
    const { EncryptionFailedError } = await import("../../errors");
    vi.mocked(relayer.encrypt).mockResolvedValueOnce(empty);
    const sdk = createSDK({ signer: broadcastSigner });
    await expect(
      sdk.prepare({
        kind: "ConfidentialTransfer",
        from: userAddress,
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
    userAddress,
  }) => {
    const { EncryptionFailedError } = await import("../../errors");
    vi.mocked(relayer.encrypt).mockResolvedValueOnce(empty);
    const sdk = createSDK({ signer: broadcastSigner });
    await expect(
      sdk.prepare({
        kind: "ConfidentialTransferFrom",
        from: userAddress,
        token: TOKEN,
        owner: "0x1111111111111111111111111111111111111111" as Address,
        to: RECIPIENT,
        amount: 1n,
      }),
    ).rejects.toBeInstanceOf(EncryptionFailedError);
  });

  test("Unwrap throws EncryptionFailedError on empty handles", async ({
    createSDK,
    broadcastSigner,
    relayer,
    userAddress,
  }) => {
    const { EncryptionFailedError } = await import("../../errors");
    vi.mocked(relayer.encrypt).mockResolvedValueOnce(empty);
    const sdk = createSDK({ signer: broadcastSigner });
    await expect(
      sdk.prepare({ kind: "Unwrap", from: userAddress, token: TOKEN, to: RECIPIENT, amount: 1n }),
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
    userAddress,
  }) => {
    const sdk = createSDK({ signer: broadcastSigner });
    await sdk.prepare({
      kind: "ConfidentialTransfer",
      from: userAddress,
      token: TOKEN,
      to: RECIPIENT,
      amount: 1n,
    });
    const call = lastCall(provider);
    expect(call.args[0]).toBe(RECIPIENT);
    expect(call.args).toHaveLength(3);
  });

  test("ConfidentialTransferFrom args are [owner, to, handle, inputProof]", async ({
    createSDK,
    broadcastSigner,
    provider,
    userAddress,
  }) => {
    const OWNER = "0x1111111111111111111111111111111111111111" as Address;
    const sdk = createSDK({ signer: broadcastSigner });
    await sdk.prepare({
      kind: "ConfidentialTransferFrom",
      from: userAddress,
      token: TOKEN,
      owner: OWNER,
      to: RECIPIENT,
      amount: 1n,
    });
    const call = lastCall(provider);
    expect(call.args[0]).toBe(OWNER);
    expect(call.args[1]).toBe(RECIPIENT);
    expect(call.args).toHaveLength(4);
  });

  test("SetOperator args are [operator, until]", async ({
    createSDK,
    broadcastSigner,
    provider,
    userAddress,
  }) => {
    const sdk = createSDK({ signer: broadcastSigner });
    await sdk.prepare({
      kind: "SetOperator",
      from: userAddress,
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
    userAddress,
  }) => {
    const sdk = createSDK({ signer: broadcastSigner });
    await sdk.prepare({
      kind: "ApproveUnderlying",
      from: userAddress,
      underlying: TOKEN,
      spender: RECIPIENT,
      amount: 999n,
    });
    expect(lastCall(provider).args).toEqual([RECIPIENT, 999n]);
  });

  test("Wrap args are [to, amount]", async ({
    createSDK,
    broadcastSigner,
    provider,
    userAddress,
  }) => {
    const sdk = createSDK({ signer: broadcastSigner });
    await sdk.prepare({
      kind: "Wrap",
      from: userAddress,
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
    userAddress,
  }) => {
    const sdk = createSDK({ signer: broadcastSigner });
    await sdk.prepare({
      kind: "TransferAndCall",
      from: userAddress,
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
      from: userAddress,
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
      from: userAddress,
      aclAddress: TOKEN,
      contractAddress: RECIPIENT,
      delegateAddress: userAddress,
    });
    expect(lastCall(provider).args).toEqual([userAddress, RECIPIENT]);
  });
});

describe("OfflineSigningService — prepare option overrides", () => {
  test("threads options.nonce through to provider.prepareTransaction", async ({
    createSDK,
    broadcastSigner,
    provider,
    userAddress,
  }) => {
    const sdk = createSDK({ signer: broadcastSigner });
    await sdk.prepare(
      {
        kind: "SetOperator",
        from: userAddress,
        token: TOKEN,
        operator: RECIPIENT,
      },
      { nonce: 42 },
    );
    expect(provider.prepareTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ nonce: 42 }),
    );
  });

  test("threads options.maxFeePerGas + maxPriorityFeePerGas through", async ({
    createSDK,
    broadcastSigner,
    provider,
    userAddress,
  }) => {
    const sdk = createSDK({ signer: broadcastSigner });
    await sdk.prepare(
      {
        kind: "SetOperator",
        from: userAddress,
        token: TOKEN,
        operator: RECIPIENT,
      },
      { maxFeePerGas: 1_000_000_000n, maxPriorityFeePerGas: 1n },
    );
    expect(provider.prepareTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        maxFeePerGas: 1_000_000_000n,
        maxPriorityFeePerGas: 1n,
      }),
    );
  });

  test("threads options.gasLimit through", async ({
    createSDK,
    broadcastSigner,
    provider,
    userAddress,
  }) => {
    const sdk = createSDK({ signer: broadcastSigner });
    await sdk.prepare(
      {
        kind: "SetOperator",
        from: userAddress,
        token: TOKEN,
        operator: RECIPIENT,
      },
      { gasLimit: 250_000n },
    );
    expect(provider.prepareTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ gasLimit: 250_000n }),
    );
  });
});

describe("OfflineSigningService — refreshPrepared", () => {
  test("re-prepares from the original request and leaves the input untouched", async ({
    createSDK,
    broadcastSigner,
    provider,
    userAddress,
  }) => {
    const sdk = createSDK({ signer: broadcastSigner });
    const prepared = await sdk.prepare({
      kind: "ConfidentialTransfer",
      from: userAddress,
      token: TOKEN,
      to: RECIPIENT,
      amount: 1n,
    });
    const originalUnsigned = prepared.unsignedTx;

    // Subsequent `prepareTransaction` call returns different bytes — mimics
    // the chain state drifting between prepare and refresh.
    const fresh = "0xfeedfacecafebabe" as Hex;
    vi.mocked(provider.prepareTransaction).mockResolvedValueOnce(fresh);

    const refreshed = await sdk.refreshPrepared(prepared);
    expect(refreshed.unsignedTx).toBe(fresh);
    // Original prepared object is untouched.
    expect(prepared.unsignedTx).toBe(originalUnsigned);
    // Same kind + request (referentially).
    expect(refreshed.kind).toBe(prepared.kind);
    expect(refreshed.request).toEqual(prepared.request);
  });

  test("works without a configured signer (cross-process refresh)", async ({
    createSDK,
    userAddress,
  }) => {
    const sdk = createSDK({ signer: undefined });
    const prepared = await sdk.prepare({
      kind: "SetOperator",
      from: userAddress,
      token: TOKEN,
      operator: RECIPIENT,
    });
    const refreshed = await sdk.refreshPrepared(prepared);
    expect(refreshed.from).toBe(prepared.from);
    expect(refreshed.kind).toBe("SetOperator");
  });
});

describe("OfflineSigningService — CredentialPermit cross-process", () => {
  test("signer-absent SDK: prepare → external sign → registerPermit round-trip", async ({
    createSDK,
    userAddress,
  }) => {
    const sdk = createSDK({ signer: undefined });
    const prepared = await sdk.prepare({
      kind: "CredentialPermit",
      from: userAddress,
      contracts: [TOKEN],
    });
    expect(prepared.typedData).not.toBeNull();
    const externalSignature = `0x${"ab".repeat(65)}` as Hex;
    const result = await sdk.registerPermit(prepared, externalSignature);
    expect(result.contracts).toEqual([TOKEN]);
  });
});

describe("OfflineSigningService — signer-optional surface (cross-process custody)", () => {
  test("signer-absent SDK: prepare → external sign-stub → broadcast round-trip", async ({
    createSDK,
    provider,
    userAddress,
  }) => {
    // No signer configured at SDK construction time — canonical cross-process
    // shape (web initiator process). `prepare` and `broadcast` work without
    // probing a signer; the back-end signer service returns signed bytes via
    // its own channel.
    const sdk = createSDK({ signer: undefined });

    const prepared = await sdk.prepare({
      kind: "ConfidentialTransfer",
      from: userAddress,
      token: TOKEN,
      to: RECIPIENT,
      amount: 1n,
    });

    // External sign stub — production code path would hand `prepared.unsignedTx`
    // to a back-end custodian service and receive signed bytes back.
    const externalSigned = SIGNED;

    const result = await sdk.broadcast(prepared, externalSigned);
    expect(provider.sendRawTransaction).toHaveBeenCalledWith(externalSigned);
    expect(result.txHash).toBe(TX_HASH);
  });

  test("signer-absent SDK: execute throws SignerNotConfiguredError", async ({
    createSDK,
    userAddress,
  }) => {
    const { SignerNotConfiguredError } = await import("../../errors");
    const sdk = createSDK({ signer: undefined });
    await expect(
      sdk.execute({
        kind: "ConfidentialTransfer",
        from: userAddress,
        token: TOKEN,
        to: RECIPIENT,
        amount: 1n,
      }),
    ).rejects.toBeInstanceOf(SignerNotConfiguredError);
  });

  test("signer-address-mismatch: configured signer != request.from", async ({
    createSDK,
    broadcastSigner,
  }) => {
    const { SignerAddressMismatchError } = await import("../../errors");
    const sdk = createSDK({ signer: broadcastSigner });
    const otherAddress = "0x9999999999999999999999999999999999999999" as Address;
    await expect(
      sdk.prepare({
        kind: "ConfidentialTransfer",
        from: otherAddress,
        token: TOKEN,
        to: RECIPIENT,
        amount: 1n,
      }),
    ).rejects.toBeInstanceOf(SignerAddressMismatchError);
  });
});
