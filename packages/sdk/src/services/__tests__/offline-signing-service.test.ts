import type { Address, Hex } from "viem";
import {
  createMockChain,
  createMockProvider,
  createMockRelayer,
  describe,
  expect,
  test,
  vi,
} from "../../test-fixtures";
import { ZamaSDKEvents } from "../../events/sdk-events";
import { BroadcastSigner } from "../../signer/broadcast-signer";
import { MemoryStorage } from "../../storage/memory-storage";
import type { ZamaConfig } from "../../config/types";
import type { Broadcaster } from "../../types";
import { ZamaSDK } from "../../zama-sdk";

const ACCOUNT = {
  address: "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address,
  chainId: 31337,
};
const TOKEN = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as Address;
const RECIPIENT = "0x3333333333333333333333333333333333333333" as Address;
const UNSIGNED = "0xdeadbeef" as Hex;
const SIGNED = "0xfeedface" as Hex;
const TX_HASH = ("0x" + "ab".repeat(32)) as Hex;

function makeBroadcaster(overrides: Partial<Broadcaster> = {}): Broadcaster {
  return {
    signTransaction: vi.fn(async () => SIGNED),
    signTypedData: vi.fn(async () => ("0x" + "ab".repeat(65)) as Hex),
    ...overrides,
  };
}

function buildSDK(opts: { broadcaster?: Broadcaster; onEvent?: ZamaConfig["onEvent"] } = {}) {
  const broadcaster = opts.broadcaster ?? makeBroadcaster();
  const signer = new BroadcastSigner({ account: ACCOUNT, broadcaster });
  const provider = createMockProvider({
    getChainId: vi.fn().mockResolvedValue(31337),
    prepareTransaction: vi.fn().mockResolvedValue(UNSIGNED),
    sendRawTransaction: vi.fn().mockResolvedValue(TX_HASH),
    waitForTransactionReceipt: vi.fn().mockResolvedValue({ logs: [] }),
  });
  const relayer = createMockRelayer();
  const storage = new MemoryStorage();
  const sdk = new ZamaSDK({
    chains: [createMockChain({ id: 31337 })],
    relayer: relayer as unknown as ZamaConfig["relayer"],
    provider,
    signer,
    storage,
    permitStorage: storage,
    keypairTTL: 2592000,
    permitTTL: 1,
    registryTTL: 86400,
    onEvent: opts.onEvent,
  } as unknown as ZamaConfig);
  return { sdk, signer, provider, relayer, broadcaster };
}

describe("OfflineSigningService — ConfidentialTransfer round-trip", () => {
  test("prepare encrypts amount + asks the provider for an unsigned tx", async () => {
    const { sdk, provider, relayer } = buildSDK();
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
        userAddress: ACCOUNT.address,
      }),
    );
    expect(provider.prepareTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        from: ACCOUNT.address,
        call: expect.objectContaining({
          address: TOKEN,
          functionName: "confidentialTransfer",
        }),
      }),
    );
    expect(prepared.kind).toBe("ConfidentialTransfer");
    expect(prepared.unsignedTx).toBe(UNSIGNED);
    expect(prepared.from).toBe(ACCOUNT.address);
    expect(prepared.to).toBe(TOKEN);
    expect(prepared.chainId).toBe(31337);
  });

  test("sign delegates to signer.signTransaction with the prepared bytes", async () => {
    const { sdk, broadcaster } = buildSDK();
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

  test("broadcast submits signed bytes + emits TransferSubmitted + awaits receipt", async () => {
    const onEvent = vi.fn();
    const { sdk, provider } = buildSDK({ onEvent });
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

  test("execute(prepared) signs then broadcasts in one call", async () => {
    const { sdk, broadcaster, provider } = buildSDK();
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

  test("execute(request) prepares + signs + broadcasts in one call", async () => {
    const { sdk, broadcaster, provider } = buildSDK();
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

  test("completeFromTxHash awaits receipt + emits event without re-broadcasting", async () => {
    const onEvent = vi.fn();
    const { sdk, provider } = buildSDK({ onEvent });
    const prepared = await sdk.prepare({
      kind: "ConfidentialTransfer",
      token: TOKEN,
      to: RECIPIENT,
      amount: 1n,
    });
    const externalTxHash = "0xexternal" as Hex;
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
  test("ConfidentialTransferFrom encrypts amount under `from` and builds calldata", async () => {
    const { sdk, provider, relayer } = buildSDK();
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
        call: expect.objectContaining({ functionName: "confidentialTransferFrom" }),
      }),
    );
  });

  test("SetOperator does not require encryption", async () => {
    const { sdk, provider, relayer } = buildSDK();
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

  test("Unwrap encrypts amount and builds the wrapper.unwrap call", async () => {
    const { sdk, provider, relayer } = buildSDK();
    await sdk.prepare({ kind: "Unwrap", token: TOKEN, to: RECIPIENT, amount: 7n });
    expect(relayer.encrypt).toHaveBeenCalledOnce();
    expect(provider.prepareTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        call: expect.objectContaining({ functionName: "unwrap" }),
      }),
    );
  });

  test("UnwrapAll reads the on-chain balance handle instead of encrypting", async () => {
    const balanceHandle = ("0x" + "ee".repeat(32)) as Hex;
    const { sdk, provider, relayer } = buildSDK();
    (provider.readContract as unknown as { mockResolvedValue: (v: Hex) => void }).mockResolvedValue(
      balanceHandle,
    );
    await sdk.prepare({ kind: "UnwrapAll", token: TOKEN, to: RECIPIENT });
    expect(relayer.encrypt).not.toHaveBeenCalled();
    expect(provider.readContract).toHaveBeenCalled();
    expect(provider.prepareTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        call: expect.objectContaining({ functionName: "unwrap" }),
      }),
    );
  });

  test("FinalizeUnwrap public-decrypts the handle and folds the cleartext into calldata", async () => {
    const handle = ("0x" + "cd".repeat(32)) as Hex;
    const { sdk, provider, relayer } = buildSDK();
    (
      relayer.publicDecrypt as unknown as {
        mockResolvedValue: (v: { clearValues: Record<Hex, bigint>; decryptionProof: Hex }) => void;
      }
    ).mockResolvedValue({
      clearValues: { [handle]: 42n },
      decryptionProof: "0xproof" as Hex,
    });
    await sdk.prepare({ kind: "FinalizeUnwrap", wrapper: TOKEN, unwrapRequestIdOrAmount: handle });
    expect(relayer.publicDecrypt).toHaveBeenCalledWith([handle]);
    expect(provider.prepareTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        call: expect.objectContaining({
          functionName: "finalizeUnwrap",
          args: expect.arrayContaining([handle, 42n, "0xproof"]),
        }),
      }),
    );
  });

  test("ApproveUnderlying builds the ERC-20 approve call", async () => {
    const { sdk, provider, relayer } = buildSDK();
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

  test("Wrap builds wrapper.wrap call", async () => {
    const { sdk, provider } = buildSDK();
    await sdk.prepare({ kind: "Wrap", wrapper: TOKEN, to: RECIPIENT, amount: 10n });
    expect(provider.prepareTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        call: expect.objectContaining({ functionName: "wrap" }),
      }),
    );
  });

  test("TransferAndCall builds the ERC-1363 path", async () => {
    const { sdk, provider } = buildSDK();
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

  test("DelegateDecryption builds the ACL delegate call", async () => {
    const { sdk, provider } = buildSDK();
    await sdk.prepare({
      kind: "DelegateDecryption",
      aclAddress: TOKEN,
      contractAddress: RECIPIENT,
      delegateAddress: ACCOUNT.address,
    });
    expect(provider.prepareTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        call: expect.objectContaining({ functionName: "delegateForUserDecryption" }),
      }),
    );
  });

  test("RevokeDelegation builds the ACL revoke call", async () => {
    const { sdk, provider } = buildSDK();
    await sdk.prepare({
      kind: "RevokeDelegation",
      aclAddress: TOKEN,
      contractAddress: RECIPIENT,
      delegateAddress: ACCOUNT.address,
    });
    expect(provider.prepareTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        call: expect.objectContaining({ functionName: "revokeDelegationForUserDecryption" }),
      }),
    );
  });

  test("submitted-event dispatches the right kind", async () => {
    const onEvent = vi.fn();
    const { sdk } = buildSDK({ onEvent });
    const prepared = await sdk.prepare({
      kind: "SetOperator",
      token: TOKEN,
      operator: RECIPIENT,
    });
    await sdk.broadcast(prepared, SIGNED);
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: ZamaSDKEvents.SetOperatorSubmitted, txHash: TX_HASH }),
    );
  });
});

describe("OfflineSigningService — CredentialPermit", () => {
  test("execute({ kind: 'CredentialPermit' }) signs typed data via the broadcaster", async () => {
    const { sdk, broadcaster } = buildSDK();
    await sdk.execute({ kind: "CredentialPermit", contracts: [TOKEN] });
    expect(broadcaster.signTypedData).toHaveBeenCalledOnce();
    expect(broadcaster.signTransaction).not.toHaveBeenCalled();
  });

  test("execute({ kind: 'CredentialPermit', contracts: [] }) is a no-op (keypair warm)", async () => {
    const { sdk, broadcaster } = buildSDK();
    await sdk.execute({ kind: "CredentialPermit", contracts: [] });
    expect(broadcaster.signTypedData).not.toHaveBeenCalled();
  });
});
