import { getAddress, type Address, type Hex } from "viem";
import { describe, expect, TEST_UNSIGNED_TX, test, vi } from "../../test-fixtures";
import type { GenericProvider } from "../../types/provider";

/** A raw 20-byte address payload — the only recipientData length the wrapper accepts verbatim. */
const RECIPIENT_DATA_20 = "0x00000000000000000000000000000000000000ff" as Hex;

const TOKEN = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as Address;
const RECIPIENT = "0x3333333333333333333333333333333333333333" as Address;
const UNSIGNED = TEST_UNSIGNED_TX;

describe("OfflineService — ConfidentialTransfer prepare", () => {
  test("prepare encrypts amount + asks the provider for an unsigned tx", async ({
    createSDK,
    signer,
    provider,
    relayer,
    userAddress,
  }) => {
    const sdk = createSDK({ signer });
    const prepared = await sdk.offline.prepare({
      kind: "ConfidentialTransfer",
      from: userAddress,
      token: TOKEN,
      to: RECIPIENT,
      amount: 1_000n,
    });

    expect(relayer.encryptValues).toHaveBeenCalledWith(
      expect.objectContaining({
        values: [{ value: 1_000n, type: "euint64" }],
        contractAddress: TOKEN,
        userAddress,
      }),
    );
    expect(provider.prepareTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        from: userAddress,
        calldata: expect.objectContaining({ address: TOKEN, functionName: "confidentialTransfer" }),
      }),
    );
    expect(prepared.kind).toBe("ConfidentialTransfer");
    expect(prepared.from).toBe(getAddress(userAddress));
    expect(prepared.unsignedTx).toBe(UNSIGNED);
  });
});

describe("OfflineService — other transaction kinds", () => {
  test("ConfidentialTransferFrom encrypts under the tx-sender (`from`), not the `owner`", async ({
    createSDK,
    signer,
    provider,
    relayer,
    userAddress,
  }) => {
    // The input proof binds to msg.sender (fhevm `verifyInput`), which for a
    // transferFrom is the operator == the `from` wallet that signs — not the
    // `owner` being debited. Encrypting under `owner` would produce a proof the
    // on-chain call rejects.
    const sdk = createSDK({ signer });
    const owner = "0x1111111111111111111111111111111111111111" as Address;
    await sdk.offline.prepare({
      kind: "ConfidentialTransferFrom",
      from: userAddress,
      token: TOKEN,
      owner,
      to: RECIPIENT,
      amount: 5n,
    });
    expect(relayer.encryptValues).toHaveBeenCalledWith(
      expect.objectContaining({ userAddress: getAddress(userAddress), contractAddress: TOKEN }),
    );
    // and NOT under the owner
    expect(relayer.encryptValues).not.toHaveBeenCalledWith(
      expect.objectContaining({ userAddress: owner }),
    );
    expect(provider.prepareTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        calldata: expect.objectContaining({ functionName: "confidentialTransferFrom" }),
      }),
    );
  });

  test("SetOperator does not require encryption", async ({
    createSDK,
    signer,
    provider,
    relayer,
    userAddress,
  }) => {
    const sdk = createSDK({ signer });
    await sdk.offline.prepare({
      kind: "SetOperator",
      from: userAddress,
      token: TOKEN,
      operator: RECIPIENT,
      until: 1_900_000_000,
    });
    expect(relayer.encryptValues).not.toHaveBeenCalled();
    expect(provider.prepareTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        calldata: expect.objectContaining({ functionName: "setOperator" }),
      }),
    );
  });

  test("SetOperator passes an explicit `until` through unchanged", async ({
    createSDK,
    signer,
    provider,
    userAddress,
  }) => {
    const sdk = createSDK({ signer });
    const until = 1_900_000_000;
    await sdk.offline.prepare({
      kind: "SetOperator",
      from: userAddress,
      token: TOKEN,
      operator: RECIPIENT,
      until,
    });
    expect(provider.prepareTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        calldata: expect.objectContaining({
          functionName: "setOperator",
          args: [RECIPIENT, until],
        }),
      }),
    );
  });

  test("SetOperator rejects a missing/non-number `until` at runtime", async ({
    createSDK,
    signer,
    userAddress,
  }) => {
    const sdk = createSDK({ signer });
    await expect(
      sdk.offline.prepare({
        kind: "SetOperator",
        from: userAddress,
        token: TOKEN,
        operator: RECIPIENT,
        // @ts-expect-error — a JS caller could omit the required `until`; the guard must reject it.
        until: undefined,
      }),
    ).rejects.toThrow(/request\.until must be a number/);
  });

  test("Unwrap encrypts amount and builds the wrapper.unwrap call", async ({
    createSDK,
    signer,
    provider,
    relayer,
    userAddress,
  }) => {
    const sdk = createSDK({ signer });
    await sdk.offline.prepare({
      kind: "Unwrap",
      from: userAddress,
      token: TOKEN,
      to: RECIPIENT,
      amount: 7n,
    });
    expect(relayer.encryptValues).toHaveBeenCalledOnce();
    expect(provider.prepareTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ calldata: expect.objectContaining({ functionName: "unwrap" }) }),
    );
  });

  test("UnwrapAll reads the on-chain balance handle instead of encrypting", async ({
    createSDK,
    signer,
    provider,
    relayer,
    userAddress,
  }) => {
    const balanceHandle = ("0x" + "ee".repeat(32)) as Hex;
    vi.mocked(provider.readContract).mockResolvedValue(balanceHandle);
    const sdk = createSDK({ signer });
    await sdk.offline.prepare({
      kind: "UnwrapAll",
      from: userAddress,
      token: TOKEN,
      to: RECIPIENT,
    });
    expect(relayer.encryptValues).not.toHaveBeenCalled();
    expect(provider.readContract).toHaveBeenCalled();
    expect(provider.prepareTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ calldata: expect.objectContaining({ functionName: "unwrap" }) }),
    );
  });

  test("FinalizeUnwrap public-decrypts the handle and folds the cleartext into calldata", async ({
    createSDK,
    signer,
    provider,
    relayer,
    userAddress,
  }) => {
    const handle = ("0x" + "cd".repeat(32)) as Hex;
    vi.mocked(relayer.decryptPublicValuesWithSignatures).mockResolvedValue({
      clearValues: [{ type: "uint64", value: 42n }],
      checkSignaturesArgs: {
        handlesList: [handle],
        abiEncodedCleartexts: "0x2a",
        decryptionProof: "0xproof",
      },
    } as unknown as Awaited<ReturnType<typeof relayer.decryptPublicValuesWithSignatures>>);
    const sdk = createSDK({ signer });
    await sdk.offline.prepare({
      kind: "FinalizeUnwrap",
      from: userAddress,
      wrapper: TOKEN,
      unwrapRequestIdOrAmount: handle,
    });
    expect(relayer.decryptPublicValuesWithSignatures).toHaveBeenCalledWith({
      encryptedValues: [handle],
    });
    expect(provider.prepareTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        calldata: expect.objectContaining({
          functionName: "finalizeUnwrap",
          // Strict-order args: position matters on calldata.
          args: [handle, 42n, "0xproof"],
        }),
      }),
    );
  });

  test("ApproveUnderlying builds the ERC-20 approve call", async ({
    createSDK,
    signer,
    provider,
    relayer,
    userAddress,
  }) => {
    const sdk = createSDK({ signer });
    await sdk.offline.prepare({
      kind: "ApproveUnderlying",
      from: userAddress,
      underlying: TOKEN,
      spender: RECIPIENT,
      amount: 999n,
    });
    expect(relayer.encryptValues).not.toHaveBeenCalled();
    expect(provider.prepareTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ calldata: expect.objectContaining({ functionName: "approve" }) }),
    );
  });

  test("Wrap builds wrapper.wrap call", async ({ createSDK, signer, provider, userAddress }) => {
    const sdk = createSDK({ signer });
    await sdk.offline.prepare({
      kind: "Wrap",
      from: userAddress,
      wrapper: TOKEN,
      to: RECIPIENT,
      amount: 10n,
    });
    expect(provider.prepareTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ calldata: expect.objectContaining({ functionName: "wrap" }) }),
    );
  });

  test("TransferAndCall builds the ERC-1363 path", async ({
    createSDK,
    signer,
    provider,
    userAddress,
  }) => {
    const sdk = createSDK({ signer });
    await sdk.offline.prepare({
      kind: "TransferAndCall",
      from: userAddress,
      underlying: TOKEN,
      wrapper: RECIPIENT,
      amount: 100n,
    });
    expect(provider.prepareTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        calldata: expect.objectContaining({ functionName: "transferAndCall" }),
      }),
    );
  });

  test("DelegateDecryption builds the ACL delegate call", async ({
    createSDK,
    signer,
    provider,
    userAddress,
  }) => {
    const sdk = createSDK({ signer });
    await sdk.offline.prepare({
      kind: "DelegateDecryption",
      from: userAddress,
      aclAddress: TOKEN,
      contractAddress: RECIPIENT,
      delegateAddress: userAddress,
    });
    expect(provider.prepareTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        calldata: expect.objectContaining({ functionName: "delegateForUserDecryption" }),
      }),
    );
  });

  test("RevokeDelegation builds the ACL revoke call", async ({
    createSDK,
    signer,
    provider,
    userAddress,
  }) => {
    const sdk = createSDK({ signer });
    await sdk.offline.prepare({
      kind: "RevokeDelegation",
      from: userAddress,
      aclAddress: TOKEN,
      contractAddress: RECIPIENT,
      delegateAddress: userAddress,
    });
    expect(provider.prepareTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        calldata: expect.objectContaining({ functionName: "revokeDelegationForUserDecryption" }),
      }),
    );
  });
});

describe("OfflineService — encryption invariants", () => {
  const empty = { encryptedValues: [], inputProof: "0x040506" } as never;

  test("ConfidentialTransfer throws EncryptionFailedError on empty handles", async ({
    createSDK,
    signer,
    relayer,
    userAddress,
  }) => {
    const { EncryptionFailedError } = await import("../../errors");
    vi.mocked(relayer.encryptValues).mockResolvedValueOnce(empty);
    const sdk = createSDK({ signer });
    await expect(
      sdk.offline.prepare({
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
    signer,
    relayer,
    userAddress,
  }) => {
    const { EncryptionFailedError } = await import("../../errors");
    vi.mocked(relayer.encryptValues).mockResolvedValueOnce(empty);
    const sdk = createSDK({ signer });
    await expect(
      sdk.offline.prepare({
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
    signer,
    relayer,
    userAddress,
  }) => {
    const { EncryptionFailedError } = await import("../../errors");
    vi.mocked(relayer.encryptValues).mockResolvedValueOnce(empty);
    const sdk = createSDK({ signer });
    await expect(
      sdk.offline.prepare({
        kind: "Unwrap",
        from: userAddress,
        token: TOKEN,
        to: RECIPIENT,
        amount: 1n,
      }),
    ).rejects.toBeInstanceOf(EncryptionFailedError);
  });
});

describe("OfflineService — calldata arg assertions", () => {
  type Call = { args: readonly unknown[] };
  const lastCall = (provider: GenericProvider): Call => {
    const calls = vi.mocked(provider.prepareTransaction).mock.calls;
    return (calls[calls.length - 1] as [{ calldata: Call }])[0].calldata;
  };

  test("ConfidentialTransfer args are [recipient, handle, inputProof] in order", async ({
    createSDK,
    signer,
    provider,
    userAddress,
  }) => {
    const sdk = createSDK({ signer });
    await sdk.offline.prepare({
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
    signer,
    provider,
    userAddress,
  }) => {
    const OWNER = "0x1111111111111111111111111111111111111111" as Address;
    const sdk = createSDK({ signer });
    await sdk.offline.prepare({
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
    signer,
    provider,
    userAddress,
  }) => {
    const sdk = createSDK({ signer });
    await sdk.offline.prepare({
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
    signer,
    provider,
    userAddress,
  }) => {
    const sdk = createSDK({ signer });
    await sdk.offline.prepare({
      kind: "ApproveUnderlying",
      from: userAddress,
      underlying: TOKEN,
      spender: RECIPIENT,
      amount: 999n,
    });
    expect(lastCall(provider).args).toEqual([RECIPIENT, 999n]);
  });

  test("Wrap args are [to, amount]", async ({ createSDK, signer, provider, userAddress }) => {
    const sdk = createSDK({ signer });
    await sdk.offline.prepare({
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
    signer,
    provider,
    userAddress,
  }) => {
    const sdk = createSDK({ signer });
    await sdk.offline.prepare({
      kind: "TransferAndCall",
      from: userAddress,
      underlying: TOKEN,
      wrapper: RECIPIENT,
      amount: 100n,
      recipientData: RECIPIENT_DATA_20,
    });
    const call = lastCall(provider);
    expect(call.args[0]).toBe(RECIPIENT);
    expect(call.args[1]).toBe(100n);
    expect(call.args[2]).toBe(RECIPIENT_DATA_20);
  });

  test("DelegateDecryption args are [delegate, contract, expirationTimestamp]", async ({
    createSDK,
    signer,
    provider,
    userAddress,
  }) => {
    const sdk = createSDK({ signer });
    // Far-future so it clears the ≥1h-from-now guard; timestamp is in seconds.
    const expirationDate = new Date(2_000_000_000_000);
    await sdk.offline.prepare({
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
    expect(call.args[2]).toBe(2_000_000_000n);
  });

  test("DelegateDecryption rejects an expiration under 1h in the future", async ({
    createSDK,
    signer,
    userAddress,
  }) => {
    const sdk = createSDK({ signer });
    await expect(
      sdk.offline.prepare({
        kind: "DelegateDecryption",
        from: userAddress,
        aclAddress: TOKEN,
        contractAddress: RECIPIENT,
        delegateAddress: userAddress,
        expirationDate: new Date(Date.now() + 60_000),
      }),
    ).rejects.toThrow(/at least 1 hour in the future/);
  });

  test("RevokeDelegation args are [delegate, contract]", async ({
    createSDK,
    signer,
    provider,
    userAddress,
  }) => {
    const sdk = createSDK({ signer });
    await sdk.offline.prepare({
      kind: "RevokeDelegation",
      from: userAddress,
      aclAddress: TOKEN,
      contractAddress: RECIPIENT,
      delegateAddress: userAddress,
    });
    expect(lastCall(provider).args).toEqual([userAddress, RECIPIENT]);
  });
});

describe("OfflineService — prepare option overrides", () => {
  test("threads options.nonce through to provider.prepareTransaction", async ({
    createSDK,
    signer,
    provider,
    userAddress,
  }) => {
    const sdk = createSDK({ signer });
    await sdk.offline.prepare(
      {
        kind: "SetOperator",
        from: userAddress,
        token: TOKEN,
        operator: RECIPIENT,
        until: 1_900_000_000,
      },
      { nonce: 42 },
    );
    expect(provider.prepareTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ nonce: 42 }),
    );
  });

  test("threads options.fees through", async ({ createSDK, signer, provider, userAddress }) => {
    const sdk = createSDK({ signer });
    await sdk.offline.prepare(
      {
        kind: "SetOperator",
        from: userAddress,
        token: TOKEN,
        operator: RECIPIENT,
        until: 1_900_000_000,
      },
      { fees: { maxFeePerGas: 1_000_000_000n, maxPriorityFeePerGas: 1n } },
    );
    expect(provider.prepareTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ fees: { maxFeePerGas: 1_000_000_000n, maxPriorityFeePerGas: 1n } }),
    );
  });

  test("threads options.gasLimit through", async ({ createSDK, signer, provider, userAddress }) => {
    const sdk = createSDK({ signer });
    await sdk.offline.prepare(
      {
        kind: "SetOperator",
        from: userAddress,
        token: TOKEN,
        operator: RECIPIENT,
        until: 1_900_000_000,
      },
      { gasLimit: 250_000n },
    );
    expect(provider.prepareTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ gasLimit: 250_000n }),
    );
  });
});

describe("OfflineService — signer-optional surface (cross-process custody)", () => {
  test("signer-absent SDK can prepare an unsigned tx", async ({
    createSDK,
    provider,
    userAddress,
  }) => {
    // No signer configured at construction time — canonical cross-process shape.
    // `prepare` builds the unsigned tx without probing a signer; the back-end
    // custodian signs and self-publishes the bytes via its own channel.
    const sdk = createSDK({ signer: undefined });

    const prepared = await sdk.offline.prepare({
      kind: "ConfidentialTransfer",
      from: userAddress,
      token: TOKEN,
      to: RECIPIENT,
      amount: 1n,
    });

    expect(prepared.from).toBe(getAddress(userAddress));
    expect(prepared.unsignedTx).toBe(UNSIGNED);
    expect(provider.prepareTransaction).toHaveBeenCalled();
  });
});

describe("OfflineService — TransferAndCall recipientData validation", () => {
  // `test.for` (not `test.each`) forwards the fixture context as the 2nd arg.
  const ACCEPTED: readonly [string, Hex | undefined][] = [
    ["undefined (self-shield)", undefined],
    ["0x (self-shield)", "0x"],
    ["a raw 20-byte address", RECIPIENT_DATA_20],
  ];
  test.for(ACCEPTED)(
    "accepts %s",
    async ([, recipientData], { createSDK, signer, provider, userAddress }) => {
      const sdk = createSDK({ signer });
      await sdk.offline.prepare({
        kind: "TransferAndCall",
        from: userAddress,
        underlying: TOKEN,
        wrapper: RECIPIENT,
        amount: 1n,
        recipientData,
      });
      expect(provider.prepareTransaction).toHaveBeenCalled();
    },
  );

  const REJECTED: readonly [string, Hex][] = [
    ["a 32-byte ABI-encoded address", `0x${"00".repeat(12)}${"ff".repeat(20)}`],
    ["a short non-empty value", "0xdead"],
  ];
  test.for(REJECTED)(
    "rejects %s so the wrapper cannot truncate it to a garbage address",
    async ([, recipientData], { createSDK, signer, provider, userAddress }) => {
      const { ConfigurationError } = await import("../../errors");
      const sdk = createSDK({ signer });
      await expect(
        sdk.offline.prepare({
          kind: "TransferAndCall",
          from: userAddress,
          underlying: TOKEN,
          wrapper: RECIPIENT,
          amount: 1n,
          recipientData,
        }),
      ).rejects.toBeInstanceOf(ConfigurationError);
      expect(provider.prepareTransaction).not.toHaveBeenCalled();
    },
  );
});

describe("OfflineService — chain-alignment guard", () => {
  test("throws when the provider is on a different chain than the SDK", async ({
    createSDK,
    signer,
    provider,
    relayer,
    userAddress,
  }) => {
    const { ConfigurationError } = await import("../../errors");
    // SDK/router is configured for chain 31337 (fixture); point the provider elsewhere.
    vi.mocked(provider.getChainId).mockResolvedValue(1);
    const sdk = createSDK({ signer });
    await expect(
      sdk.offline.prepare({
        kind: "ConfidentialTransfer",
        from: userAddress,
        token: TOKEN,
        to: RECIPIENT,
        amount: 1n,
      }),
    ).rejects.toBeInstanceOf(ConfigurationError);
    // Guard runs before any encryption or tx building.
    expect(relayer.encryptValues).not.toHaveBeenCalled();
    expect(provider.prepareTransaction).not.toHaveBeenCalled();
  });
});
